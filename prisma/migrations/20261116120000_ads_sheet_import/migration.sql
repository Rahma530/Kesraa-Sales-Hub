-- Ads Google Sheet import module:
--
-- 1. Lead.acquisitionType / Lead.platform — ad-attribution fields, only
--    populated for leads pulled in from the Ads sheet (nullable, no data
--    migration needed for existing rows).
-- 2. AdsSheetConfig — single-row settings table holding the linked sheet
--    URL, always read/written via id = "singleton" (upsert).

ALTER TABLE "Lead" ADD COLUMN "acquisitionType" TEXT;
ALTER TABLE "Lead" ADD COLUMN "platform" TEXT;

CREATE TABLE "AdsSheetConfig" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "sheetUrl" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "lastSyncedAt" TIMESTAMP(3),
    "lastSyncCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdsSheetConfig_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AdsSheetConfig" ADD CONSTRAINT "AdsSheetConfig_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
