import { NextResponse } from "next/server";
export const dynamic = 'force-dynamic';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isManagementRole } from "@/lib/permissions";
import { Role } from "@/lib/enums";

// This endpoint checks for:
// 1. Leads transferred to Sales but no action taken (salesStatus still "NEW")
// 2. Meetings whose date has passed but the Sales employee hasn't written a report
// 3. Upcoming meetings within the next 30 minutes
// It creates notifications for admin/management users and the sales employees.

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    
    if (!isManagementRole(session.user.role as Role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const admins = await prisma.user.findMany({
      where: {
        role: { in: [Role.ADMIN, Role.HEAD_OF_SALES] },
        isActive: true,
      },
      select: { id: true },
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let createdCount = 0;

    // ========== 1. عملاء محولين بدون أي أكشن (24 ساعة+) ==========
    const staleThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const staleLeads = await (prisma as any).lead.findMany({
      where: {
        currentStage: "SALES",
        salesStatus: "NEW",
        transferredAt: { lte: staleThreshold },
      },
      include: {
        assignedTo: { select: { id: true, name: true } },
      },
    });

    for (const lead of staleLeads) {
      const employeeName = lead.assignedTo?.name || "غير معروف";
      
      const existingNotif = await (prisma as any).notification.findFirst({
        where: {
          type: "STALE_LEAD_ALERT",
          link: `/admin/customers?search=${encodeURIComponent(lead.name)}`,
        },
      });
      if (existingNotif) continue;

      const hoursSinceTransfer = lead.transferredAt 
        ? Math.round((Date.now() - new Date(lead.transferredAt).getTime()) / (1000 * 60 * 60))
        : 0;

      for (const admin of admins) {
        await (prisma as any).notification.create({
          data: {
            userId: admin.id,
            title: "عميل بدون أكشن من السيلز",
            message: `العميل "${lead.name}" محوّل لموظف السيلز "${employeeName}" من ${hoursSinceTransfer} ساعة ولم يتم اتخاذ أي إجراء عليه.`,
            type: "STALE_LEAD_ALERT",
            link: `/admin/customers?search=${encodeURIComponent(lead.name)}`,
          },
        });
        createdCount++;
      }

      // Notify the sales employee as well
      if (lead.assignedToId) {
        await (prisma as any).notification.create({
          data: {
            userId: lead.assignedToId,
            title: "تذكير: عميل معلق",
            message: `العميل "${lead.name}" تم تحويله لك من ${hoursSinceTransfer} ساعة ولم تتخذ أي إجراء عليه. يرجى المتابعة.`,
            type: "STALE_LEAD_ALERT",
            link: `/sales?search=${encodeURIComponent(lead.name)}`,
          },
        });
        createdCount++;
      }
    }

    // ========== 2. مقابلات فات ميعادها ولم يتم كتابة تقرير ==========
    const now = new Date();

    const overdueMeetings = await prisma.meeting.findMany({
      where: {
        status: "SCHEDULED",       // لسه مكملهاش
        scheduledAt: { lt: now },   // ميعادها عدى
      },
      include: {
        lead: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } },
      },
    });

    for (const meeting of overdueMeetings) {
      const employeeName = meeting.owner?.name || "غير معروف";
      const leadName = meeting.lead?.name || "غير معروف";
      
      const existingNotif = await (prisma as any).notification.findFirst({
        where: {
          type: "OVERDUE_MEETING_ALERT",
          link: `/admin/customers?search=${encodeURIComponent(leadName)}`,
        },
      });
      if (existingNotif) continue;

      const hoursSinceMeeting = Math.round(
        (Date.now() - new Date(meeting.scheduledAt).getTime()) / (1000 * 60 * 60)
      );

      for (const admin of admins) {
        await (prisma as any).notification.create({
          data: {
            userId: admin.id,
            title: "مقابلة فات ميعادها بدون تقرير",
            message: `موظف السيلز "${employeeName}" عنده مقابلة مع العميل "${leadName}" فات ميعادها من ${hoursSinceMeeting} ساعة ولم يكتب تقرير المقابلة.`,
            type: "OVERDUE_MEETING_ALERT",
            link: `/admin/customers?search=${encodeURIComponent(leadName)}`,
          },
        });
        createdCount++;
      }

      // Notify the sales employee
      if (meeting.ownerId) {
        await (prisma as any).notification.create({
          data: {
            userId: meeting.ownerId,
            title: "تذكير: تقرير مقابلة متأخر",
            message: `فات ميعاد المقابلة مع العميل "${leadName}" من ${hoursSinceMeeting} ساعة. الرجاء إنهاء المقابلة وكتابة التقرير.`,
            type: "OVERDUE_MEETING_ALERT",
            link: `/sales?search=${encodeURIComponent(leadName)}`,
          },
        });
        createdCount++;
      }
    }

    // ========== 3. تنبيهات قبل المقابلة بـ 30 دقيقة ==========
    const thirtyMinsFromNow = new Date(now.getTime() + 30 * 60 * 1000);

    const upcomingMeetings = await prisma.meeting.findMany({
      where: {
        status: "SCHEDULED",
        scheduledAt: { 
          gt: now,
          lte: thirtyMinsFromNow 
        },
      },
      include: {
        lead: { select: { id: true, name: true } },
      },
    });

    for (const meeting of upcomingMeetings) {
      const leadName = meeting.lead?.name || "غير معروف";
      
      const existingNotif = await (prisma as any).notification.findFirst({
        where: {
          type: "UPCOMING_MEETING_ALERT",
          link: `/sales?search=${encodeURIComponent(leadName)}`,
        },
      });
      if (existingNotif) continue;

      if (meeting.ownerId) {
        await (prisma as any).notification.create({
          data: {
            userId: meeting.ownerId,
            title: "⏳ تذكير بمقابلة قادمة",
            message: `لديك مقابلة مع العميل "${leadName}" ستبدأ خلال أقل من 30 دقيقة. استعد!`,
            type: "UPCOMING_MEETING_ALERT",
            link: `/sales?search=${encodeURIComponent(leadName)}`,
          },
        });
        createdCount++;
      }
    }

    // ========== 4. عملاء موزعين على التيلي سيلز بدون أكشن (24 ساعة+) ==========
    const staleTeleLeads = await (prisma as any).lead.findMany({
      where: {
        currentStage: "TELE_SALES",
        status: "NEW", // No action taken
        createdAt: { lte: staleThreshold },
      },
      include: {
        assignedTo: { select: { id: true, name: true } },
      },
    });

    for (const lead of staleTeleLeads) {
      if (!lead.assignedToId) continue;
      const employeeName = lead.assignedTo?.name || "غير معروف";
      
      const existingNotif = await (prisma as any).notification.findFirst({
        where: {
          type: "STALE_TELE_LEAD_ALERT",
          link: `/admin/customers?search=${encodeURIComponent(lead.name)}`,
        },
      });
      if (existingNotif) continue;

      const hoursSinceUpload = lead.createdAt 
        ? Math.round((Date.now() - new Date(lead.createdAt).getTime()) / (1000 * 60 * 60))
        : 0;

      for (const admin of admins) {
        await (prisma as any).notification.create({
          data: {
            userId: admin.id,
            title: "عميل جديد بدون أكشن من التيلي سيلز",
            message: `العميل "${lead.name}" مسند للموظف "${employeeName}" من ${hoursSinceUpload} ساعة ولم يتم اتخاذ أي إجراء عليه.`,
            type: "STALE_TELE_LEAD_ALERT",
            link: `/admin/customers?search=${encodeURIComponent(lead.name)}`,
          },
        });
        createdCount++;
      }

      // Notify the tele-sales employee
      await (prisma as any).notification.create({
        data: {
          userId: lead.assignedToId,
          title: "تذكير: عميل جديد معلق",
          message: `تم إسناد العميل "${lead.name}" لك من ${hoursSinceUpload} ساعة ولم تتخذ أي إجراء عليه. يرجى التواصل معه.`,
          type: "STALE_TELE_LEAD_ALERT",
          link: `/tele-sales?search=${encodeURIComponent(lead.name)}`,
        },
      });
      createdCount++;
    }

    return NextResponse.json({ 
      count: createdCount, 
      staleLeads: staleLeads.length,
      overdueMeetings: overdueMeetings.length,
      staleTeleLeads: staleTeleLeads.length,
      message: `تم إرسال ${createdCount} إشعار` 
    });
  } catch (error) {
    console.error("Stale leads check error:", error);
    return NextResponse.json({ error: "Failed to check stale leads" }, { status: 500 });
  }
}
