import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST /api/follow-ups/check-due
//
// Finds this employee's own follow-ups (Tele-Sales or Sales — whoever
// created the follow-up) whose scheduledDate has arrived or passed, that
// aren't completed yet and haven't already triggered a notification, and
// creates a "your follow-up is due" Notification for each one.
//
// Run from the client on every /tele-sales and /sales dashboard load
// (FollowUpReminderChecker), same pattern as the admin-only StaleLeadsChecker.
// Intentionally scoped to the logged-in user's own follow-ups only — no
// role check beyond "is logged in", since Tele-Sales and Sales both create
// follow-ups (see permissions.ts CREATE_FOLLOWUP) and should only ever see
// their own.
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  const dueFollowUps = await prisma.followUp.findMany({
    where: {
      createdById: session.user.id,
      isCompleted: false,
      reminderSentAt: null,
      scheduledDate: { lte: now },
    },
    include: {
      lead: { select: { id: true, name: true, phone: true } },
    },
  });

  if (dueFollowUps.length === 0) {
    return NextResponse.json({ created: 0 });
  }

  await prisma.$transaction([
    prisma.notification.createMany({
      data: dueFollowUps.map((fu) => ({
        userId: session.user.id,
        title: "حان وقت المتابعة",
        message: `حان وقت متابعة العميل ${fu.lead.name} (${fu.lead.phone})${fu.notes ? ` — ${fu.notes}` : ""}`,
        type: "FOLLOWUP_DUE",
        link: `?search=${fu.lead.phone}`,
      })),
    }),
    prisma.followUp.updateMany({
      where: { id: { in: dueFollowUps.map((fu) => fu.id) } },
      data: { reminderSentAt: now },
    }),
  ]);

  return NextResponse.json({ created: dueFollowUps.length });
}
