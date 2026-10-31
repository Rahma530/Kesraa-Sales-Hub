"use client";

import { useEffect } from "react";

// Mirrors StaleLeadsChecker's pattern, but scoped to the logged-in
// employee's own follow-ups (Tele-Sales or Sales) instead of admin-wide
// checks. Mounted on /tele-sales and /sales so each employee gets a
// "your follow-up is due" notification once the scheduled date/time
// arrives, next time they load their dashboard.
export default function FollowUpReminderChecker() {
  useEffect(() => {
    fetch("/api/follow-ups/check-due", { method: "POST" })
      .then(() => {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("refreshNotifications"));
        }
      })
      .catch(() => {
        // Silently fail - this is a background check
      });
  }, []);

  return null;
}
