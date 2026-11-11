"use client";

import { useState, useEffect } from "react";
import LeadTable from "@/components/LeadTable";
import TodoList from "@/components/TodoList";
import LeadUploadForm from "@/components/LeadUploadForm";

export default function SalesClient({ leads }: { leads: any[] }) {
  const [activeTab, setActiveTab] = useState<"all" | "new" | "meetings_today" | "no_answer" | "followup" | "won" | "lost">("all");

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Filter for Today's Meetings
  const todaysMeetings = leads.filter(l =>
    l.meetings?.some((m: any) =>
      m.status === "SCHEDULED" &&
      new Date(m.scheduledAt) >= today &&
      new Date(m.scheduledAt) < tomorrow
    )
  );

  const newLeads        = leads.filter(l => l.salesStatus === "NEW");
  const noAnswerLeads   = leads.filter(l => l.salesStatus === "NO_ANSWER" || l.salesStatus === "NOT_AVAILABLE");
  const followupLeads   = leads.filter(l => l.salesStatus === "NEEDS_FOLLOWUP");
  const wonLeads        = leads.filter(l => l.salesStatus === "CLOSED_WON");
  const lostLeads       = leads.filter(l => l.salesStatus === "CLOSED_LOST");

  let displayedLeads = leads;
  if (activeTab === "new")           displayedLeads = newLeads;
  if (activeTab === "meetings_today") displayedLeads = todaysMeetings;
  if (activeTab === "no_answer")     displayedLeads = noAnswerLeads;
  if (activeTab === "followup")      displayedLeads = followupLeads;
  if (activeTab === "won")           displayedLeads = wonLeads;
  if (activeTab === "lost")          displayedLeads = lostLeads;

  const [notifiedMeetings, setNotifiedMeetings] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Check every minute for upcoming meetings
    const interval = setInterval(() => {
      const now = new Date();
      leads.forEach(lead => {
        lead.meetings?.forEach((m: any) => {
          if (m.status === "SCHEDULED" && !notifiedMeetings.has(m.id)) {
            const meetingTime = new Date(m.scheduledAt);
            const diffMs = meetingTime.getTime() - now.getTime();
            const diffMins = Math.floor(diffMs / 60000);
            
            // If meeting is within exactly 15 minutes or 0 minutes
            if ((diffMins <= 15 && diffMins > 0) || diffMins === 0) {
              // Trigger a global custom event to show a toast, or just alert?
              // Since we want in-system toast, let's use the NotificationBell or window event.
              if (typeof window !== "undefined") {
                const event = new CustomEvent("addToast", { 
                  detail: { 
                    type: "warning", 
                    message: `Reminder: you have a meeting with lead ${lead.name} in ${diffMins === 0 ? 'now!' : diffMins + ' minutes'}`
                  } 
                });
                window.dispatchEvent(event);
                
                // Play sound
                const playNotificationSound = require("@/lib/audio").playNotificationSound;
                if (playNotificationSound) playNotificationSound();
                
                setNotifiedMeetings(prev => new Set(prev).add(m.id));
              }
            }
          }
        });
      });
    }, 60000); // every 60 seconds
    
    return () => clearInterval(interval);
  }, [leads, notifiedMeetings]);

  return (
    <div>
      <LeadUploadForm />
      <div className="h-5" />
      <TodoList leads={leads} isSalesView={true} />

      <div className="mb-6 flex space-x-2 space-x-reverse overflow-x-auto border-b border-white/10 pb-2">
        {[
          { key: "all",           label: `All (${leads.length})`,                   color: "accent" },
          { key: "new",           label: `New (${newLeads.length})`,              color: "blue" },
          { key: "meetings_today",label: `Today's Meetings (${todaysMeetings.length})`, color: "accent" },
          { key: "no_answer",     label: `No Answer/Not Available (${noAnswerLeads.length})`,color: "yellow" },
          { key: "followup",      label: `Needs Follow-up (${followupLeads.length})`, color: "purple" },
          { key: "won",           label: `Won (${wonLeads.length})`,              color: "won" },
          { key: "lost",          label: `Lost (${lostLeads.length})`,             color: "lost" },
        ].map(tab => (
          <button
            key={tab.key}
            className={`shrink-0 rounded-xl px-4 py-2 text-sm font-medium transition-all ${
              activeTab === tab.key
                ? "bg-accent/20 text-accent-soft border border-accent/30"
                : "text-slate-400 hover:bg-white/5 hover:text-white"
            }`}
            onClick={() => setActiveTab(tab.key as any)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <LeadTable leads={displayedLeads} isSalesView={true} canHoldMeetings />
    </div>
  );
}
