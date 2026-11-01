import crypto from "crypto";

// How long an invite link stays valid before an admin has to resend it.
export const INVITE_TOKEN_TTL_DAYS = 7;

/** A URL-safe random token used to identify one invite link. */
export function generateInviteToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function getInviteExpiry(): Date {
  return new Date(Date.now() + INVITE_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
}

/** Builds the full invite link an admin can copy and send to an employee. */
export function buildInviteLink(token: string, requestOrigin?: string): string {
  const base = process.env.NEXTAUTH_URL || requestOrigin || "";
  return `${base.replace(/\/$/, "")}/accept-invite/${token}`;
}
