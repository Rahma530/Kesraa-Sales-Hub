-- Speeds up the stale-leads dedup check (was doing a full table scan per
-- candidate lead/meeting).
CREATE INDEX "Notification_type_link_idx" ON "Notification"("type", "link");

-- Throttle table: lets the stale-leads background check record "I already
-- ran recently" so it doesn't redo its full scan on every single page
-- visit/tab.
CREATE TABLE "SystemCheckState" (
    "key" TEXT NOT NULL,
    "lastRunAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemCheckState_pkey" PRIMARY KEY ("key")
);
