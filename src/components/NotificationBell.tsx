"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { playNotificationSound } from "@/lib/audio";

export type AppNotification = {
  id: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  createdAt: string;
  link?: string | null;
};

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // DashboardShell (and this bell inside it) is rendered per-page rather
  // than in a shared layout, so it fully remounts on every page/tab
  // navigation. null means "we don't know the previous count yet" —
  // the comparison in checkUnreadCount only plays the sound once we
  // actually have a previous value to compare against, so the first
  // check after any remount never treats pre-existing unread
  // notifications as newly arrived.
  const prevUnreadRef = useRef<number | null>(null);

  // IMPORTANT: this used to re-fetch the *entire* notification list (every
  // row, no limit) every 10 seconds, in every open tab — that was the
  // multi-megabyte, multi-second request that was starving the database's
  // connection pool. The full list only matters once the dropdown is
  // actually opened, or once we know (from the cheap count below) that
  // something genuinely changed. So the 10s poll now hits a lightweight
  // /count endpoint (a fast indexed COUNT, no row data), and only triggers
  // a full fetchNotifications() when the number actually goes up.
  useEffect(() => {
    fetchNotifications(); // once, so the dropdown has content if opened immediately
    checkUnreadCount();
    const interval = setInterval(checkUnreadCount, 10000);
    const handleRefresh = () => fetchNotifications();
    window.addEventListener("refreshNotifications", handleRefresh);

    return () => {
      clearInterval(interval);
      window.removeEventListener("refreshNotifications", handleRefresh);
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const checkUnreadCount = async () => {
    try {
      const res = await fetch(`/api/notifications/count?t=${new Date().getTime()}`);
      if (res.ok) {
        const data = await res.json();
        const newCount: number = data.unreadCount ?? 0;
        const isFirstCheckForThisMount = prevUnreadRef.current === null;

        if (!isFirstCheckForThisMount && newCount > prevUnreadRef.current!) {
          // Something new actually arrived — now it's worth paying for the
          // full list (and the sound/refresh that go with it).
          playNotificationSound();
          fetchNotifications();
        }
        prevUnreadRef.current = newCount;
        setUnreadCount(newCount);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchNotifications = async () => {
    try {
      const res = await fetch(`/api/notifications?t=${new Date().getTime()}`);
      if (res.ok) {
        const data = await res.json();
        const newFetched: AppNotification[] = data.notifications || [];

        setNotifications((prev) => {
          const hasNewAssignment = newFetched.some(
            (n) => n.type === "ASSIGNMENT" && !prev.find((p) => p.id === n.id)
          );

          if (hasNewAssignment) {
            setTimeout(() => router.refresh(), 100);
          }

          return newFetched;
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleNotificationClick = async (notif: AppNotification) => {
    if (!notif.isRead) {
      setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, isRead: true } : n));
      setUnreadCount((prev) => Math.max(0, prev - 1));
      try {
        await fetch("/api/notifications/mark-read", {
          method: "POST",
          body: JSON.stringify({ id: notif.id }),
          headers: { "Content-Type": "application/json" }
        });
      } catch (e) {
        console.error(e);
      }
    }

    if (notif.link) {
      router.push(notif.link);
      setIsOpen(false);
    }
  };

  const handleToggleOpen = () => {
    const nextOpen = !isOpen;
    setIsOpen(nextOpen);
    if (nextOpen) {
      // Always refresh the list contents right as it's opened, so it's
      // never more than a click away from being current — without that
      // costing anything on every 10s poll in between opens.
      fetchNotifications();
    }
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <div
        className="cursor-pointer hover:bg-white/5 p-2 rounded-full transition-colors relative"
        onClick={handleToggleOpen}
      >
        <Bell size={24} className="text-slate-200" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-0 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[11px] font-bold text-white border-2 border-[#0f1523]">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </div>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-80 bg-[#161f33] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden flex flex-col">
          <div className="p-3 border-b border-white/10 bg-white/5">
            <h3 className="text-white font-bold text-sm">Notifications ({unreadCount})</h3>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="text-center text-slate-400 text-sm py-6">No notifications</p>
            ) : (
              notifications.map((notif) => (
                <div 
                  key={notif.id} 
                  className={`p-4 border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer ${notif.isRead ? 'opacity-70' : 'bg-accent-deep/10'}`}
                  onClick={() => handleNotificationClick(notif)}
                >
                  <div className="flex justify-between items-start mb-1">
                    <h4 className={`text-sm pr-2 ${notif.isRead ? 'text-slate-300 font-medium' : 'text-white font-bold'}`}>{notif.title}</h4>
                    <span className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${notif.isRead ? 'bg-emerald-500' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]'}`}></span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed mb-2">{notif.message}</p>
                  <p className="text-[10px] text-slate-500">
                    {new Date(notif.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
