-- Adds reminderSentAt to FollowUp so the "your follow-up is due" check
-- (run on every /tele-sales and /sales dashboard load) can tell whether a
-- notification has already been created for a given follow-up, instead of
-- re-notifying the employee on every page load.
--
-- Safe to run on the live production DB: adds a single nullable column,
-- no data migration, no locking concerns.

ALTER TABLE "FollowUp" ADD COLUMN "reminderSentAt" TIMESTAMP(3);
