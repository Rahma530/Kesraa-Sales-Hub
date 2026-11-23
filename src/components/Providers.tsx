"use client";

import { SessionProvider, useSession } from "next-auth/react";
import { useEffect } from "react";

// Pings the server every few minutes so lastActiveAt stays fresh (powers
// the "online now" indicator). Split out from Providers so it can read
// useSession() — it has to live *inside* SessionProvider to do that.
function Heartbeat() {
  // status is "loading" during the first client-side check, then either
  // "authenticated" or "unauthenticated". We only want to ping once we
  // know there's an actual session — otherwise this fires on every page
  // load (login page included, and the brief instant before the session
  // cookie is readable on any page) and logs a harmless-but-noisy 401 in
  // the console every single time.
  const { status } = useSession();

  useEffect(() => {
    if (status !== "authenticated") return;

    const send = () => fetch("/api/user/heartbeat", { method: "POST" }).catch(() => {});
    send(); // once immediately, now that we know we're logged in

    const interval = setInterval(send, 1000 * 60 * 3); // then every 3 minutes
    return () => clearInterval(interval);
  }, [status]);

  return null;
}

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <Heartbeat />
      {children}
    </SessionProvider>
  );
}
