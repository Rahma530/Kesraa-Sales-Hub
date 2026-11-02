import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { sendEmail } from "@/lib/email";
import {
  generatePasswordResetToken,
  getPasswordResetExpiry,
  buildPasswordResetLink,
} from "@/lib/password-reset-token";

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

// Always the same generic response, whether or not the email exists in the
// system — otherwise this endpoint could be used to check which emails are
// registered.
const GENERIC_RESPONSE = {
  success: true,
  message: "If an account exists for this email, a password reset link has been sent to it.",
};

// POST /api/auth/forgot-password — public route (no session required).
export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = forgotPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });

  // Only send a reset email for an active account that has already been
  // activated (has a password). An account still on the invite flow
  // doesn't have a password to reset — it uses its invite link instead.
  if (user && user.isActive && user.passwordHash) {
    const passwordResetToken = generatePasswordResetToken();
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken,
        passwordResetTokenExpiresAt: getPasswordResetExpiry(),
      },
    });

    const resetLink = buildPasswordResetLink(passwordResetToken, req.nextUrl.origin);

    await sendEmail({
      to: user.email,
      subject: "Reset your Kesra CRM password",
      html: `
        <div style="font-family: sans-serif; color: #1a1a1a;">
          <h2>Reset your password</h2>
          <p>Hi ${user.name},</p>
          <p>We received a request to reset your Kesra CRM password. Click the button below to choose a new one. This link expires in 1 hour.</p>
          <p>
            <a href="${resetLink}" style="display: inline-block; background: #7b2ff7; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
              Reset Password
            </a>
          </p>
          <p>If you didn't request this, you can safely ignore this email.</p>
        </div>
      `,
    });
  }

  return NextResponse.json(GENERIC_RESPONSE);
}
