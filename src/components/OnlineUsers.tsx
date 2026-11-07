"use client";

import { useEffect, useState, useRef } from "react";
import { Users } from "lucide-react";

export type OnlineUser = {
  id: string;
  name: string;
  role: string;
  lastActiveAt: string;
};

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Admin",
  HEAD_OF_SALES: "Head of Sales",
  HEAD_OF_TELE_SALES: "Head of Tele-Sales",
  TELE_SALES: "Tele-Sales",
  SALES: "Sales",
};

export default function OnlineUsers({ currentUserRole }: { currentUserRole?: string }) {
  const [users, setUsers] = useState<OnlineUser[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchOnlineUsers();
    // Poll every 30 seconds
    const interval = setInterval(fetchOnlineUsers, 30000);
    
    return () => clearInterval(interval);
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

  const fetchOnlineUsers = async () => {
    try {
      const res = await fetch(`/api/users/online?t=${new Date().getTime()}`);
      if (res.ok) {
        const data = await res.json();
        let fetchedUsers = data.onlineUsers || [];
        
        // If the employee is Tele-Sales, only show online Sales employees (so they know who to transfer leads to)
        if (currentUserRole === "TELE_SALES") {
          fetchedUsers = fetchedUsers.filter((u: any) => u.role === "SALES");
        }
        
        setUsers(fetchedUsers);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const onlineCount = users.length;

  return (
    <div className="relative" ref={wrapperRef}>
      <div 
        className="cursor-pointer hover:bg-white/5 p-2 rounded-full transition-colors relative"
        onClick={() => setIsOpen(!isOpen)}
        title="Employees currently online"
      >
        <Users size={24} className="text-slate-200" />
        {onlineCount > 0 && (
          <span className="absolute top-1 right-0 flex h-5 w-5 items-center justify-center rounded-full bg-green-500 text-[11px] font-bold text-white border-2 border-[#0f1523]">
            {onlineCount > 99 ? '99+' : onlineCount}
          </span>
        )}
        {onlineCount === 0 && (
          <span className="absolute top-1 right-0 flex h-3 w-3 rounded-full bg-slate-500 border-2 border-[#0f1523]"></span>
        )}
      </div>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-72 bg-[#161f33] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden flex flex-col">
          <div className="p-3 border-b border-white/10 bg-white/5">
            <h3 className="text-white font-bold text-sm">Online Now ({onlineCount})</h3>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {users.length === 0 ? (
              <p className="text-center text-slate-400 text-sm py-6">No one is online right now</p>
            ) : (
              users.map((u) => (
                <div key={u.id} className="p-3 border-b border-white/5 flex items-center gap-3">
                  <div className="relative">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/50 text-white font-bold text-sm">
                      {u.name.charAt(0)}
                    </div>
                    <span className="absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-[#161f33]" />
                  </div>
                  <div>
                    <p className="text-sm text-white font-medium">{u.name}</p>
                    <p className="text-[11px] text-slate-400">{ROLE_LABELS[u.role] || u.role}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
