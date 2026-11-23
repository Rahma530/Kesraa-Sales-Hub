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
// 4. Leads distributed to Tele-Sales but no action taken
// It creates notifications for admin/management users and the relevant employee.
//
// PERFORMANCE NOTE (this used to be the #1 cause of the whole app freezing):
// this used to run on every single Admin Dashboard page load (via
// StaleLeadsChecker's useEffect), and for every matching lead/meeting it did
// a separate `findFirst` (dedup check) + separate `create` calls in a
// sequential for-loop. With a few thousand test leads sitting in the
// "stale" state, that meant several thousand *sequential* DB round trips on
// every single page visit — starving the connection pool for every other
// request running at the same time (notifications, leads list, session
// checks, all stuck behind it).
//
// Fixed two ways:
//   1. Throttled via SystemCheckState — this now actually does its heavy
//      work at most once every 5 minutes no matter how many tabs/users
//      trigger it, instead of on every page mount.
//   2. Batched — one bulk `findMany` to see which links are already
//      notified (indexed on [type, link]), then one chunked `createMany`
//      per category instead of per-row round trips.
const THROTTLE_KEY = "stale_leads_check";
const THROTTLE_MS = 5 * 60 * 1000; // 5 minutes
const CREATE_CHUNK_SIZE = 500; // keep each createMany payload reasonable

type NotificationRow = {
  userId: string;
  title: string;
  message: string;
  type: string;
  link: string;
};

async function createManyChunked(rows: NotificationRow[]) {
  for (let i = 0; i < rows.length; i += CREATE_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CREATE_CHUNK_SIZE);
    await (prisma as any).notification.createMany({ data: chunk });
  }
}

// Given a notification `type` and the full list of candidate links for that
// type, returns the subset of links that do NOT already have a notification
// (i.e. genuinely new — still need one created). One query instead of one
// findFirst per candidate.
async function filterUnnotifiedLinks(type: string, links: string[]): Promise<Set<string>> {
  if (links.length === 0) return new Set();
  const existing = await (prisma as any).notification.findMany({
    where: { type, link: { in: links } },
    select: { link: true },
  });
  const alreadyNotified = new Set(existing.map((e: { link: string | null }) => e.link));
  return new Set(links.filter((l) => !alreadyNotified.has(l)));
}

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (!isManagementRole(session.user.role as Role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // ---- Throttle: skip the heavy work entirely if we ran recently ----
    const state = await (prisma as any).systemCheckState.findUnique({ where: { key: THROTTLE_KEY } });
    const now = new Date();
    if (state && now.getTime() - new Date(state.lastRunAt).getTime() < THROTTLE_MS) {
      return NextResponse.json({
        skipped: true,
        message: "Stale-leads check ran recently; skipped to avoid redundant load.",
      });
    }
    // Claim this run immediately (upsert) so overlapping requests (e.g. two
    // tabs loading at once) don't both slip past the check above.
    await (prisma as any).systemCheckState.upsert({
      where: { key: THROTTLE_KEY },
      create: { key: THROTTLE_KEY, lastRunAt: now },
      update: { lastRunAt: now },
    });

    const admins = await prisma.user.findMany({
      where: {
        role: { in: [Role.ADMIN, Role.HEAD_OF_SALES, Role.HEAD_OF_TELE_SALES] },
        isActive: true,
      },
      select: { id: true },
    });

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

    {
      const links = staleLeads.map(
        (lead: any) => `/admin/customers?search=${encodeURIComponent(lead.name)}`
      );
      const unnotified = await filterUnnotifiedLinks("STALE_LEAD_ALERT", links);
      const rows: NotificationRow[] = [];

      for (const lead of staleLeads) {
        const link = `/admin/customers?search=${encodeURIComponent(lead.name)}`;
        if (!unnotified.has(link)) continue;

        const employeeName = lead.assignedTo?.name || "Unknown";
        const hoursSinceTransfer = lead.transferredAt
          ? Math.round((Date.now() - new Date(lead.transferredAt).getTime()) / (1000 * 60 * 60))
          : 0;

        for (const admin of admins) {
          rows.push({
            userId: admin.id,
            title: "Lead with no action from Sales",
            message: `Lead "${lead.name}" was transferred to Sales employee "${employeeName}" ${hoursSinceTransfer} hours ago and no action has been taken.`,
            type: "STALE_LEAD_ALERT",
            link,
          });
        }

        if (lead.assignedToId) {
          rows.push({
            userId: lead.assignedToId,
            title: "Reminder: pending lead",
            message: `Lead "${lead.name}" was transferred to you ${hoursSinceTransfer} hours ago and no action has been taken. Please follow up.`,
            type: "STALE_LEAD_ALERT",
            link: `/sales?search=${encodeURIComponent(lead.name)}`,
          });
        }
      }

      await createManyChunked(rows);
      createdCount += rows.length;
    }

    // ========== 2. Meetings that are overdue with no report written ==========
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

    {
      const links = overdueMeetings.map(
        (m: any) => `/admin/customers?search=${encodeURIComponent(m.lead?.name || "Unknown")}`
      );
      const unnotified = await filterUnnotifiedLinks("OVERDUE_MEETING_ALERT", links);
      const rows: NotificationRow[] = [];

      for (const meeting of overdueMeetings) {
        const leadName = meeting.lead?.name || "Unknown";
        const link = `/admin/customers?search=${encodeURIComponent(leadName)}`;
        if (!unnotified.has(link)) continue;

        const employeeName = meeting.owner?.name || "Unknown";
        const hoursSinceMeeting = Math.round(
          (Date.now() - new Date(meeting.scheduledAt).getTime()) / (1000 * 60 * 60)
        );

        for (const admin of admins) {
          rows.push({
            userId: admin.id,
            title: "Overdue meeting with no report",
            message: `Sales employee "${employeeName}" has a meeting with lead "${leadName}" that was due ${hoursSinceMeeting} hours ago and no meeting report has been written.`,
            type: "OVERDUE_MEETING_ALERT",
            link,
          });
        }

        if (meeting.ownerId) {
          rows.push({
            userId: meeting.ownerId,
            title: "Reminder: overdue meeting report",
            message: `The meeting with lead "${leadName}" was due ${hoursSinceMeeting} hours ago. Please complete the meeting and write the report.`,
            type: "OVERDUE_MEETING_ALERT",
            link: `/sales?search=${encodeURIComponent(leadName)}`,
          });
        }
      }

      await createManyChunked(rows);
      createdCount += rows.length;
    }

    // ========== 3. Alerts 30 minutes before a meeting ==========
    const thirtyMinsFromNow = new Date(now.getTime() + 30 * 60 * 1000);

    const upcomingMeetings = await prisma.meeting.findMany({
      where: {
        status: "SCHEDULED",
        scheduledAt: {
          gt: now,
          lte: thirtyMinsFromNow,
        },
      },
      include: {
        lead: { select: { id: true, name: true } },
      },
    });

    {
      const links = upcomingMeetings.map(
        (m: any) => `/sales?search=${encodeURIComponent(m.lead?.name || "Unknown")}`
      );
      const unnotified = await filterUnnotifiedLinks("UPCOMING_MEETING_ALERT", links);
      const rows: NotificationRow[] = [];

      for (const meeting of upcomingMeetings) {
        const leadName = meeting.lead?.name || "Unknown";
        const link = `/sales?search=${encodeURIComponent(leadName)}`;
        if (!unnotified.has(link)) continue;
        if (!meeting.ownerId) continue;

        rows.push({
          userId: meeting.ownerId,
          title: "⏳ Upcoming meeting reminder",
          message: `You have a meeting with lead "${leadName}" starting in less than 30 minutes. Get ready!`,
          type: "UPCOMING_MEETING_ALERT",
          link,
        });
      }

      await createManyChunked(rows);
      createdCount += rows.length;
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

    {
      const candidates = staleTeleLeads.filter((lead: any) => !!lead.assignedToId);
      const links = candidates.map(
        (lead: any) => `/admin/customers?search=${encodeURIComponent(lead.name)}`
      );
      const unnotified = await filterUnnotifiedLinks("STALE_TELE_LEAD_ALERT", links);
      const rows: NotificationRow[] = [];

      for (const lead of candidates) {
        const link = `/admin/customers?search=${encodeURIComponent(lead.name)}`;
        if (!unnotified.has(link)) continue;

        const employeeName = lead.assignedTo?.name || "Unknown";
        const hoursSinceUpload = lead.createdAt
          ? Math.round((Date.now() - new Date(lead.createdAt).getTime()) / (1000 * 60 * 60))
          : 0;

        for (const admin of admins) {
          rows.push({
            userId: admin.id,
            title: "New lead with no action from Tele-Sales",
            message: `Lead "${lead.name}" has been assigned to employee "${employeeName}" for ${hoursSinceUpload} hours and no action has been taken.`,
            type: "STALE_TELE_LEAD_ALERT",
            link,
          });
        }

        rows.push({
          userId: lead.assignedToId,
          title: "Reminder: pending new lead",
          message: `Lead "${lead.name}" was assigned to you ${hoursSinceUpload} hours ago and no action has been taken. Please reach out to them.`,
          type: "STALE_TELE_LEAD_ALERT",
          link: `/tele-sales?search=${encodeURIComponent(lead.name)}`,
        });
      }

      await createManyChunked(rows);
      createdCount += rows.length;
    }

    return NextResponse.json({
      count: createdCount,
      staleLeads: staleLeads.length,
      overdueMeetings: overdueMeetings.length,
      staleTeleLeads: staleTeleLeads.length,
      message: `${createdCount} notification(s) sent`,
    });
  } catch (error) {
    console.error("Stale leads check error:", error);
    return NextResponse.json({ error: "Failed to check stale leads" }, { status: 500 });
  }
}
