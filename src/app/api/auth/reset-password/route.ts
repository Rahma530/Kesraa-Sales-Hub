import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import bcrypt from "bcryptjs";

const resetSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

// POST /api/auth/reset-password — public route (no session required). An
// employee who forgot their password uses the link emailed to them to set
// a new one.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = resetSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { passwordResetToken: parsed.data.token },
  });

  if (!user) {
    return NextResponse.json(
      { error: "This reset link is invalid or has already been used." },
      { status: 404 }
    );
  }

  if (!user.passwordResetTokenExpiresAt || user.passwordResetTokenExpiresAt < new Date()) {
    return NextResponse.json(
      { error: "This reset link has expired. Please request a new one." },
      { status: 410 }
    );
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      passwordResetToken: null,
      passwordResetTokenExpiresAt: null,
    },
  });

  return NextResponse.json({ success: true, username: user.username });
}
