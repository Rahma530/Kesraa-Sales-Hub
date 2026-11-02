-- Forgot-password flow: lets an employee who already activated their
-- account (has a passwordHash) request a reset link emailed to their own
-- account email, instead of needing the admin.

ALTER TABLE "User" ADD COLUMN "passwordResetToken" TEXT;
ALTER TABLE "User" ADD COLUMN "passwordResetTokenExpiresAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "User_passwordResetToken_key" ON "User"("passwordResetToken");
