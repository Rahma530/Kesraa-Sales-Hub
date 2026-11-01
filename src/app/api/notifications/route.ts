import { NextResponse } from "next/server";
export const dynamic = 'force-dynamic';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userId = session.user.id;

    // Fetch DB notifications
    const dbNotifs = await (prisma as any).notification.findMany({
      where: { userId, isRead: false },
      orderBy: { createdAt: "desc" },
    });

    // Fetch pending follow-ups for today or earlier
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    
    const pendingFollowUps = await prisma.followUp.findMany({
      where: {
        createdById: userId,
        isCompleted: false,
        scheduledDate: { lte: endOfToday },
      },
      include: { lead: { select: { name: true } } },
      orderBy: { scheduledDate: "asc" },
    });

    // Transform follow-ups into notification format
    const followUpNotifs = pendingFollowUps.map(f => ({
      id: `followup-${f.id}`,
      title: "Follow-up required",
      message: `You have a follow-up with lead ${f.lead?.name || "Unnamed"} - ${f.notes}`,
      type: "FOLLOW_UP",
      isRead: false,
      createdAt: f.scheduledDate,
      link: f.lead?.name ? `?search=${encodeURIComponent(f.lead.name)}&status=NEEDS_FOLLOWUP` : null,
    }));

    const allNotifications = [...dbNotifs, ...followUpNotifs].sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    });

    return NextResponse.json({ notifications: allNotifications });
  } catch (error) {
    console.error("Notifications error:", error);
    return NextResponse.json({ error: "Failed to fetch notifications" }, { status: 500 });
  }
}
