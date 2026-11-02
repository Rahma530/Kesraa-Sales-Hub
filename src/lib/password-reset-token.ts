import crypto from "crypto";

// Shorter-lived than an invite link — this is for someone who already has
// an active account and just forgot their password.
export const PASSWORD_RESET_TOKEN_TTL_MINUTES = 60;

export function generatePasswordResetToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function getPasswordResetExpiry(): Date {
  return new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MINUTES * 60 * 1000);
}

/** Builds the link emailed to the employee to reset their password. */
export function buildPasswordResetLink(token: string, requestOrigin?: string): string {
  const base = process.env.NEXTAUTH_URL || requestOrigin || "";
  return `${base.replace(/\/$/, "")}/reset-password/${token}`;
}
