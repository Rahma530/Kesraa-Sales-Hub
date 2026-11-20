import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/notifications/count
//
// Lightweight companion to /api/notifications. NotificationBell polls this
// every ~10s instead of re-fetching the full notification list every cycle
// — it only needs to know whether the badge number changed. Both counts
// use indexed where-clauses (@@index([userId, isRead]) on Notification,
// and an index on FollowUp.isCompleted/scheduledDate), so this stays cheap
// and fast even when the full list would be large.
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userId = session.user.id;
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    const [dbUnreadCount, dueFollowUpCount] = await Promise.all([
      (prisma as any).notification.count({ where: { userId, isRead: false } }),
      prisma.followUp.count({
        where: {
          createdById: userId,
          isCompleted: false,
          scheduledDate: { lte: endOfToday },
        },
      }),
    ]);

    return NextResponse.json({ unreadCount: dbUnreadCount + dueFollowUpCount });
  } catch (error) {
    console.error("Notifications count error:", error);
    return NextResponse.json({ error: "Failed to fetch notification count" }, { status: 500 });
  }
}
