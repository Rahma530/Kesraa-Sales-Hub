"use client";

import { useState } from "react";
import LeadTable from "@/components/LeadTable";
import TodoList from "@/components/TodoList";
import LeadUploadForm from "@/components/LeadUploadForm";

export default function TeleSalesClient({ leads, salesTeam }: { leads: any[], salesTeam: any[] }) {
  const [activeTab, setActiveTab] = useState<"today" | "all" | "transferred">("all");

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const todaysLeads = leads.filter(l => 
    l.followUps?.some((f: any) => 
      !f.isCompleted && 
      new Date(f.scheduledDate) >= today && 
      new Date(f.scheduledDate) < tomorrow
    ) || l.status === "NEW" // Also show new unhandled leads
  );

  const transferredLeads = leads.filter(l => l.status === "TRANSFERRED_TO_SALES");

  let displayedLeads = leads;
  if (activeTab === "today") displayedLeads = todaysLeads;
  if (activeTab === "transferred") displayedLeads = transferredLeads;

  return (
    <div>
      <LeadUploadForm />
      <div className="h-5" />
      <TodoList leads={leads} />

      <div className="mb-6 flex space-x-2 space-x-reverse overflow-x-auto border-b border-white/10 pb-2">
        <button
          className={`shrink-0 rounded-xl px-4 py-2 text-sm font-medium transition-all ${
            activeTab === "all"
              ? "bg-accent/20 text-accent-soft"
              : "text-slate-400 hover:bg-white/5 hover:text-white"
          }`}
          onClick={() => setActiveTab("all")}
        >
          All Leads ({leads.length})
        </button>
        <button
          className={`shrink-0 rounded-xl px-4 py-2 text-sm font-medium transition-all ${
            activeTab === "today"
              ? "bg-accent/20 text-accent-soft"
              : "text-slate-400 hover:bg-white/5 hover:text-white"
          }`}
          onClick={() => setActiveTab("today")}
        >
          Today's Follow-ups & New ({todaysLeads.length})
        </button>
        <button
          className={`shrink-0 rounded-xl px-4 py-2 text-sm font-medium transition-all ${
            activeTab === "transferred"
              ? "bg-status-won/20 text-status-won"
              : "text-slate-400 hover:bg-white/5 hover:text-white"
          }`}
          onClick={() => setActiveTab("transferred")}
        >
          Transferred to Sales ({transferredLeads.length})
        </button>
      </div>

      <LeadTable leads={displayedLeads} allowTransfer salesTeam={salesTeam} />
    </div>
  );
}
