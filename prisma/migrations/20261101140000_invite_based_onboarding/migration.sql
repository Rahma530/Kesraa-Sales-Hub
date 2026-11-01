-- Invitation-based onboarding: new employees are created without a
-- password. They receive an invite link (copied/sent by the admin, not
-- auto-emailed) that lets them set their own password.

ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;
ALTER TABLE "User" ADD COLUMN "inviteToken" TEXT;
ALTER TABLE "User" ADD COLUMN "inviteTokenExpiresAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "User_inviteToken_key" ON "User"("inviteToken");
