-- Adds the columns needed for the real meeting-recording integration
-- (Google Calendar meeting links + Fireflies transcription/summary +
-- Gemini translation/recommendations), replacing the fabricated data the
-- old "invite-ai" button used to write.
--
-- Safe to run on the live production DB: six new nullable columns, no
-- data migration, no locking concerns.

ALTER TABLE "Meeting" ADD COLUMN "meetingLink" TEXT;
ALTER TABLE "Meeting" ADD COLUMN "calendarEventId" TEXT;
ALTER TABLE "Meeting" ADD COLUMN "firefliesMeetingId" TEXT;
ALTER TABLE "Meeting" ADD COLUMN "aiTranslation" TEXT;
ALTER TABLE "Meeting" ADD COLUMN "aiRecommendations" TEXT;

CREATE INDEX "Meeting_firefliesMeetingId_idx" ON "Meeting"("firefliesMeetingId");
