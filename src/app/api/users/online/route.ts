import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/enums";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Update current user's lastActiveAt
    await prisma.user.update({
      where: { id: session.user.id },
      data: { lastActiveAt: new Date() },
    });

    // Get users who were active in the last 2 minutes
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
    const onlineUsers = await prisma.user.findMany({
      where: {
        lastActiveAt: { gte: twoMinutesAgo },
        role: { in: [Role.SALES, Role.TELE_SALES, Role.HEAD_OF_SALES, Role.HEAD_OF_TELE_SALES, Role.ADMIN] },
      },
      select: {
        id: true,
        name: true,
        role: true,
        lastActiveAt: true,
      },
      orderBy: { lastActiveAt: 'desc' },
    });

    return NextResponse.json({ onlineUsers });
  } catch (error) {
    console.error("Online users error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
