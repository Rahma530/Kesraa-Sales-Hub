"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { CheckCircle2, Eye, Handshake, Phone, AlertTriangle, User } from "lucide-react";

export default function AdminTodoList({ followUps, meetings }: { followUps: any[], meetings: any[] }) {
  const [filterEmployee, setFilterEmployee] = useState<string>("ALL");

  const tasks = useMemo(() => {
    const now = new Date();
    
    let allTasks: any[] = [];

    followUps.forEach((f: any) => {
      const d = new Date(f.scheduledDate);
      allTasks.push({
        id: `f-${f.id}`,
        leadId: f.lead.id,
        leadName: f.lead.name,
        leadPhone: f.lead.phone,
        assignedTo: f.lead.assignedTo?.name || "Unassigned",
        type: "FOLLOWUP",
        date: d,
        notes: f.notes,
        isOverdue: d < new Date(now.getTime() - 1000 * 60 * 15) // Overdue if 15 mins passed
      });
    });

    meetings.forEach((m: any) => {
      const d = new Date(m.scheduledAt);
      allTasks.push({
        id: `m-${m.id}`,
        leadId: m.lead.id,
        leadName: m.lead.name,
        leadPhone: m.lead.phone,
        assignedTo: m.lead.assignedTo?.name || "Unassigned",
        type: "MEETING",
        date: d,
        notes: m.notes,
        isOverdue: d < new Date(now.getTime() - 1000 * 60 * 15)
      });
    });

    return allTasks.sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [followUps, meetings]);

  const uniqueEmployees = Array.from(new Set(tasks.map(t => t.assignedTo)));

  const filteredTasks = tasks.filter(t => filterEmployee === "ALL" || t.assignedTo === filterEmployee);
  
  if (tasks.length === 0) {
    return (
      <div className="bg-[#121826] border border-white/5 rounded-3xl p-6 mb-6 shadow-2xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <CheckCircle2 size={28} className="text-emerald-400" />
          <div>
            <h3 className="text-emerald-400 font-bold text-lg">No tasks or meetings scheduled for today</h3>
            <p className="text-slate-400 text-sm">The team has no pending tasks today.</p>
          </div>
        </div>
      </div>
    );
  }

  const overdueCount = filteredTasks.filter(t => t.isOverdue).length;

  return (
    <div className="bg-[#121826] border border-white/5 rounded-3xl p-6 mb-6 shadow-2xl relative overflow-hidden">
      {overdueCount > 0 && <div className="absolute top-0 right-0 w-full h-1 bg-rose-500"></div>}
      
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-5 gap-4">
        <div className="flex items-center gap-3">
          <span className="bg-accent/20 text-accent-soft p-2.5 rounded-xl"><Eye size={20} /></span>
          <div>
            <h3 className="text-xl font-bold text-white">Team Task Monitoring (Today)</h3>
            <p className="text-slate-400 text-sm">
              {filteredTasks.length} tasks remaining in total
              {overdueCount > 0 && <span className="text-rose-400 font-bold"> ({overdueCount} of them overdue!)</span>}
            </p>
          </div>
        </div>

        <select
          value={filterEmployee}
          onChange={(e) => setFilterEmployee(e.target.value)}
          className="bg-[#182032] border border-white/10 rounded-xl px-4 py-2 text-sm text-white outline-none focus:border-accent/50"
        >
          <option value="ALL">All Employees</option>
          {uniqueEmployees.map(emp => (
            <option key={emp} value={emp}>{emp}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredTasks.map(task => {
          const timeString = format(task.date, "hh:mm a");
          const isMeeting = task.type === "MEETING";
          return (
            <div key={task.id} className={`p-4 rounded-2xl border transition-all ${task.isOverdue ? 'bg-rose-500/10 border-rose-500/30' : 'bg-[#182032] border-white/10'}`}>
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-md flex items-center gap-1 ${isMeeting ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'}`}>
                  {isMeeting ? <><Handshake size={11} /> Meeting</> : <><Phone size={11} /> Call</>}
                </span>
                <span className={`text-[10px] font-bold flex items-center gap-1 ${task.isOverdue ? 'text-rose-400' : 'text-slate-400'}`}>
                  {task.isOverdue ? <><AlertTriangle size={11} /> Overdue ({timeString})</> : timeString}
                </span>
              </div>
              
              <div className="mb-2 border-b border-white/5 pb-2">
                <p className="text-xs text-slate-500 mb-1">Assigned Employee:</p>
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-accent flex items-center justify-center text-white"><User size={11} /></div>
                  <span className="text-sm font-bold text-white">{task.assignedTo}</span>
                </div>
              </div>

              <Link href={`/admin/customers?search=${task.leadPhone}`} className="block group">
                <h4 className="text-accent-soft font-bold text-[14px] group-hover:text-accent-soft transition-colors truncate">{task.leadName}</h4>
                <p className="text-xs text-slate-400 mb-2 truncate" dir="ltr">{task.leadPhone}</p>
                {task.notes && (
                  <p className="text-[11px] text-slate-500 bg-white/5 p-2 rounded-lg truncate" title={task.notes}>{task.notes}</p>
                )}
              </Link>
            </div>
          );
        })}
        {filteredTasks.length === 0 && (
          <div className="col-span-full text-center py-8 text-slate-500 text-sm">
            No tasks match the selected filter
          </div>
        )}
      </div>
    </div>
  );
}
