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
        role: { in: [Role.ADMIN, Role.HEAD_OF_SALES, Role.HEAD_OF_TELE_SALES] },
        isActive: true,
      },
      select: { id: true },
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let createdCount = 0;

    // ========== 1. Leads transferred with no action (24+ hours) ==========
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
      const employeeName = lead.assignedTo?.name || "Unknown";

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
            title: "Lead with no action from Sales",
            message: `Lead "${lead.name}" was transferred to Sales employee "${employeeName}" ${hoursSinceTransfer} hours ago and no action has been taken.`,
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
            title: "Reminder: pending lead",
            message: `Lead "${lead.name}" was transferred to you ${hoursSinceTransfer} hours ago and no action has been taken. Please follow up.`,
            type: "STALE_LEAD_ALERT",
            link: `/sales?search=${encodeURIComponent(lead.name)}`,
          },
        });
        createdCount++;
      }
    }

    // ========== 2. Meetings that are overdue with no report written ==========
    const now = new Date();

    const overdueMeetings = await prisma.meeting.findMany({
      where: {
        status: "SCHEDULED",       // Not completed yet
        scheduledAt: { lt: now },   // Date has passed
      },
      include: {
        lead: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } },
      },
    });

    for (const meeting of overdueMeetings) {
      const employeeName = meeting.owner?.name || "Unknown";
      const leadName = meeting.lead?.name || "Unknown";
      
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
            title: "Overdue meeting with no report",
            message: `Sales employee "${employeeName}" has a meeting with lead "${leadName}" that was due ${hoursSinceMeeting} hours ago and no meeting report has been written.`,
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
            title: "Reminder: overdue meeting report",
            message: `The meeting with lead "${leadName}" was due ${hoursSinceMeeting} hours ago. Please complete the meeting and write the report.`,
            type: "OVERDUE_MEETING_ALERT",
            link: `/sales?search=${encodeURIComponent(leadName)}`,
          },
        });
        createdCount++;
      }
    }

    // ========== 3. Alerts 30 minutes before a meeting ==========
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
      const leadName = meeting.lead?.name || "Unknown";
      
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
            title: "⏳ Upcoming meeting reminder",
            message: `You have a meeting with lead "${leadName}" starting in less than 30 minutes. Get ready!`,
            type: "UPCOMING_MEETING_ALERT",
            link: `/sales?search=${encodeURIComponent(leadName)}`,
          },
        });
        createdCount++;
      }
    }

    // ========== 4. Leads distributed to Tele-Sales with no action (24+ hours) ==========
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
      const employeeName = lead.assignedTo?.name || "Unknown";
      
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
            title: "New lead with no action from Tele-Sales",
            message: `Lead "${lead.name}" has been assigned to employee "${employeeName}" for ${hoursSinceUpload} hours and no action has been taken.`,
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
          title: "Reminder: pending new lead",
          message: `Lead "${lead.name}" was assigned to you ${hoursSinceUpload} hours ago and no action has been taken. Please reach out to them.`,
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
      message: `${createdCount} notification(s) sent`
    });
  } catch (error) {
    console.error("Stale leads check error:", error);
    return NextResponse.json({ error: "Failed to check stale leads" }, { status: 500 });
  }
}
