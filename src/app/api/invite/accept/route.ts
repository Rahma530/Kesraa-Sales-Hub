import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import bcrypt from "bcryptjs";

const acceptSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

// POST /api/invite/accept — public route (no session required). An
// employee uses their invite link to set their own password for the
// first time.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = acceptSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { inviteToken: parsed.data.token },
  });

  if (!user) {
    return NextResponse.json(
      { error: "This invite link is invalid or has already been used." },
      { status: 404 }
    );
  }

  if (!user.inviteTokenExpiresAt || user.inviteTokenExpiresAt < new Date()) {
    return NextResponse.json(
      { error: "This invite link has expired. Ask your admin to resend it." },
      { status: 410 }
    );
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      inviteToken: null,
      inviteTokenExpiresAt: null,
    },
  });

  return NextResponse.json({ success: true, username: user.username });
}
