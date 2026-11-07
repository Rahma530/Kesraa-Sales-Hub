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
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const unreadCount = notifications.filter(n => !n.isRead).length;
  const prevUnreadRef = useRef(0);

  useEffect(() => {
    if (unreadCount > prevUnreadRef.current) {
      playNotificationSound();
    }
    prevUnreadRef.current = unreadCount;
  }, [unreadCount]);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 10000); // Check every 10 seconds for real-time feel
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

  const fetchNotifications = async () => {
    try {
      const res = await fetch(`/api/notifications?t=${new Date().getTime()}`);
      if (res.ok) {
        const data = await res.json();
        const newFetched = data.notifications || [];
        
        setNotifications((prev) => {
          const hasNewAssignment = newFetched.some((n: any) => 
            n.type === "ASSIGNMENT" && !prev.find((p) => p.id === n.id)
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

  return (
    <div className="relative" ref={wrapperRef}>
      <div 
        className="cursor-pointer hover:bg-white/5 p-2 rounded-full transition-colors relative"
        onClick={() => setIsOpen(!isOpen)}
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
