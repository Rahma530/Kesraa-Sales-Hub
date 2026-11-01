-- These columns exist in prisma/schema.prisma (Meeting.recordingUrl,
-- Meeting.transcript, Meeting.aiAnalysis, Lead.contractUrl) but were never
-- captured in a migration — they were likely added locally with
-- `prisma db push` at some point, which updates a dev database directly
-- without writing a migration file. The production database never got
-- them, which crashed the admin dashboard with:
--   "The column `Meeting.recordingUrl` does not exist in the current database."
--
-- Safe to run on the live production DB: four nullable columns, no data
-- migration, no locking concerns.

ALTER TABLE "Meeting" ADD COLUMN "recordingUrl" TEXT;
ALTER TABLE "Meeting" ADD COLUMN "transcript" TEXT;
ALTER TABLE "Meeting" ADD COLUMN "aiAnalysis" TEXT;
ALTER TABLE "Lead" ADD COLUMN "contractUrl" TEXT;
