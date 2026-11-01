"use client";

import { useMemo } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { CheckCircle2, ClipboardList, Handshake, Phone, AlertTriangle } from "lucide-react";

export default function TodoList({ leads, isSalesView = false }: { leads: any[], isSalesView?: boolean }) {
  const tasks = useMemo(() => {
    const now = new Date();
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    
    let allTasks: any[] = [];

    leads.forEach((lead) => {
      // Add FollowUps
      lead.followUps?.forEach((f: any) => {
        const d = new Date(f.scheduledDate);
        if (d <= endOfToday && !f.isCompleted) {
          allTasks.push({
            id: `f-${f.id}`,
            leadId: lead.id,
            leadName: lead.name,
            leadPhone: lead.phone,
            type: "FOLLOWUP",
            date: d,
            notes: f.notes,
            isOverdue: d < new Date(now.getTime() - 1000 * 60 * 15) // Overdue if 15 mins passed
          });
        }
      });

      // Add Meetings
      lead.meetings?.forEach((m: any) => {
        const d = new Date(m.scheduledAt);
        if (d <= endOfToday && m.status === "SCHEDULED") {
          allTasks.push({
            id: `m-${m.id}`,
            leadId: lead.id,
            leadName: lead.name,
            leadPhone: lead.phone,
            type: "MEETING",
            date: d,
            notes: m.notes,
            isOverdue: d < new Date(now.getTime() - 1000 * 60 * 15)
          });
        }
      });
    });

    return allTasks.sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [leads]);

  if (tasks.length === 0) {
    return (
      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-5 mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <CheckCircle2 size={28} className="text-emerald-400" />
          <div>
            <h3 className="text-emerald-400 font-bold text-lg">No overdue or scheduled tasks for today!</h3>
            <p className="text-emerald-500/70 text-sm">You're on top of all your tasks. Great work!</p>
          </div>
        </div>
      </div>
    );
  }

  const overdueCount = tasks.filter(t => t.isOverdue).length;

  return (
    <div className="bg-[#121826] border border-white/5 rounded-3xl p-6 mb-6 shadow-2xl relative overflow-hidden">
      {overdueCount > 0 && <div className="absolute top-0 right-0 w-full h-1 bg-rose-500"></div>}
      
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <span className="bg-accent/20 text-accent-soft p-2.5 rounded-xl"><ClipboardList size={20} /></span>
          <div>
            <h3 className="text-xl font-bold text-white">Today's Tasks & Follow-ups</h3>
            <p className="text-slate-400 text-sm">
              You have {tasks.length} tasks remaining
              {overdueCount > 0 && <span className="text-rose-400 font-bold"> ({overdueCount} of them overdue!)</span>}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {tasks.map(task => {
          const timeString = format(task.date, "hh:mm a");
          const isMeeting = task.type === "MEETING";
          return (
            <div key={task.id} className={`p-4 rounded-2xl border transition-all ${task.isOverdue ? 'bg-rose-500/10 border-rose-500/30' : 'bg-[#182032] border-white/10 hover:border-accent/30'}`}>
              <div className="flex items-center justify-between mb-3">
                <span className={`text-xs font-bold px-2.5 py-1 rounded-md flex items-center gap-1 ${isMeeting ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'}`}>
                  {isMeeting ? <><Handshake size={12} /> Meeting (Sales)</> : <><Phone size={12} /> Follow-up Call</>}
                </span>
                <span className={`text-xs font-bold flex items-center gap-1 ${task.isOverdue ? 'text-rose-400' : 'text-slate-400'}`}>
                  {task.isOverdue ? <><AlertTriangle size={12} /> Overdue ({timeString})</> : timeString}
                </span>
              </div>
              
              <Link href={`?search=${task.leadPhone}`} className="block group">
                <h4 className="text-white font-bold text-[15px] group-hover:text-accent-soft transition-colors mb-1 truncate">{task.leadName}</h4>
                <p className="text-sm text-slate-400 mb-2 truncate" dir="ltr">{task.leadPhone}</p>
                {task.notes && (
                  <p className="text-xs text-slate-500 bg-white/5 p-2 rounded-lg truncate" title={task.notes}>{task.notes}</p>
                )}
              </Link>

              <div className="mt-4 flex gap-2">
                {/* WhatsApp temporarily disabled — see DashboardNav.tsx for why */}
                <Link
                  href={`?search=${task.leadPhone}`}
                  className="flex-1 bg-accent hover:bg-accent text-white text-xs font-bold py-2.5 rounded-xl text-center transition-colors"
                >
                  Open Lead ↗
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
