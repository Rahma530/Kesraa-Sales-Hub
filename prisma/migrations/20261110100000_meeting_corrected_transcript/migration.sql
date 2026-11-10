-- Adds Meeting.correctedTranscript: a Gemini-corrected copy of the raw
-- Fireflies transcript (fixes code-switched Arabic/English words and
-- unclear speech-to-text artifacts, without summarizing), shown instead of
-- the raw transcript once it's ready.
--
-- Nullable, no data migration, no locking concerns. Existing meetings keep
-- NULL here and fall back to displaying their raw `transcript` until they
-- get a corrected copy.

ALTER TABLE "Meeting" ADD COLUMN "correctedTranscript" TEXT;
