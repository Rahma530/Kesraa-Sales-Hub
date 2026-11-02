import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== "ADMIN" && session.user.role !== "HEAD_OF_SALES" && session.user.role !== "HEAD_OF_TELE_SALES")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const { leadIds } = await req.json();

    if (!Array.isArray(leadIds) || leadIds.length === 0) {
      return NextResponse.json({ error: "No leads provided" }, { status: 400 });
    }

    await prisma.lead.deleteMany({
      where: {
        id: { in: leadIds },
      },
    });

    return NextResponse.json({ success: true, count: leadIds.length });
  } catch (error: any) {
    console.error("Bulk delete error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
