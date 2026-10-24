-- Adds progress-tracking columns to UploadBatch so large uploads can be
-- processed in the background while the admin UI polls their status.
ALTER TABLE "UploadBatch" ADD COLUMN "processedLeads" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "UploadBatch" ADD COLUMN "skippedLeads" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "UploadBatch" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'DONE';
ALTER TABLE "UploadBatch" ADD COLUMN "errorMessage" TEXT;

CREATE INDEX "UploadBatch_status_idx" ON "UploadBatch"("status");

-- Prevents duplicate phone numbers at the database level (safety net under
-- concurrent uploads, not just application-level checks).
--
-- IMPORTANT — before applying this migration on a live database, check for
-- existing duplicates first, since the CREATE UNIQUE INDEX below will fail
-- if any are found:
--
--   SELECT phone, COUNT(*) FROM "Lead" GROUP BY phone HAVING COUNT(*) > 1;
--
-- If that returns rows, resolve them manually (merge or delete the extras)
-- before re-running this migration.
CREATE UNIQUE INDEX "Lead_phone_key" ON "Lead"("phone");
