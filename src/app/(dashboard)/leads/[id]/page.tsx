import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { isManagementRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import DashboardShell from "@/components/DashboardShell";
import StatusBadge from "@/components/StatusBadge";
import TierBadge from "@/components/TierBadge";
import MeetingAskPanel from "@/components/MeetingAskPanel";
import { User, Phone, Mail, Building2, Calendar, Bot, ClipboardList } from "lucide-react";

export const dynamic = "force-dynamic";

function formatDateTime(date: Date) {
  return date.toLocaleString("en-US", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function LeadDashboardPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const lead = await prisma.lead.findUnique({
    where: { id: params.id },
    include: {
      assignedTo: { select: { name: true } },
      meetings: { orderBy: { scheduledAt: "desc" }, include: { owner: { select: { name: true } } } },
    },
  });

  if (!lead) notFound();

  // Same access rule as editing a lead's details: management roles see
  // everything, everyone else only sees leads assigned to them.
  if (!isManagementRole(session.user.role) && lead.assignedToId !== session.user.id) {
    redirect("/unauthorized");
  }

  return (
    <DashboardShell title={lead.name}>
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Basic lead info */}
        <div className="glass-panel p-6">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-12 h-12 shrink-0 rounded-full bg-accent/20 flex items-center justify-center text-accent-soft">
                <User size={20} />
              </div>
              <div className="min-w-0">
                <h2 className="font-bold text-white text-lg truncate" dir="auto">{lead.name}</h2>
                <p className="text-sm text-slate-400 truncate" dir="auto">{lead.company || "—"}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <TierBadge tier={lead.tier} />
              <StatusBadge status={lead.status} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5 text-sm">
            <div className="flex items-center gap-2 text-slate-300">
              <Phone size={14} className="text-slate-500 shrink-0" />
              <span dir="ltr">{lead.phone}</span>
            </div>
            {lead.email && (
              <div className="flex items-center gap-2 text-slate-300">
                <Mail size={14} className="text-slate-500 shrink-0" />
                <span className="truncate" dir="ltr">{lead.email}</span>
              </div>
            )}
            {lead.company && (
              <div className="flex items-center gap-2 text-slate-300">
                <Building2 size={14} className="text-slate-500 shrink-0" />
                <span className="truncate">{lead.company}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-slate-300">
              <User size={14} className="text-slate-500 shrink-0" />
              <span>{lead.assignedTo?.name || "Unassigned"}</span>
            </div>
          </div>

          {(lead.need || lead.interestReason || lead.notes) && (
            <div className="mt-4 pt-4 border-t border-white/5 space-y-2 text-sm text-slate-300" dir="auto">
              {lead.need && <p><span className="text-slate-500">Need: </span>{lead.need}</p>}
              {lead.interestReason && <p><span className="text-slate-500">Interest: </span>{lead.interestReason}</p>}
              {lead.notes && <p><span className="text-slate-500">Notes: </span>{lead.notes}</p>}
            </div>
          )}
        </div>

        {/* Meeting history */}
        <div>
          <h3 className="text-sm font-bold text-slate-300 mb-3 flex items-center gap-2">
            <ClipboardList size={16} /> Meeting History ({lead.meetings.length})
          </h3>

          {lead.meetings.length === 0 ? (
            <div className="glass-panel p-6 text-center text-slate-500 text-sm">
              No meetings yet for this lead
            </div>
          ) : (
            <div className="space-y-4">
              {lead.meetings.map((meeting: (typeof lead.meetings)[number]) => (
                <div key={meeting.id} className="glass-panel p-5">
                  <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                    <p className="text-sm font-bold text-white flex items-center gap-1.5">
                      <Calendar size={14} className="text-slate-500" />
                      {formatDateTime(meeting.scheduledAt)}
                    </p>
                    <span className="text-[11px] text-slate-500">
                      {meeting.owner?.name} · {meeting.status}
                    </span>
                  </div>

                  {meeting.result && (
                    <p className="text-[12px] text-slate-300 leading-relaxed bg-[#0b101a] p-2.5 rounded-lg border border-white/5 mb-3">
                      {meeting.result}
                    </p>
                  )}

                  {/* No "watch recording" link — we delete the recording from
                      Fireflies right after saving our own copy (storage cleanup),
                      so that link would just 404 once processing is done. */}

                  {(meeting.aiTranslation || meeting.aiAnalysis || meeting.aiRecommendations) && (
                    <div className="border-t border-white/5 pt-3 space-y-3">
                      <h4 className="text-xs font-bold text-emerald-300 flex items-center gap-1">
                        <Bot size={14} /> AI Summary
                      </h4>

                      {meeting.aiTranslation ? (
                        <div>
                          <p className="text-[10px] text-slate-400 mb-1" dir="rtl">الملخص:</p>
                          <div dir="rtl" className="text-[12px] text-slate-300 leading-relaxed bg-[#0b101a] p-2.5 rounded-lg border border-white/5 whitespace-pre-wrap">
                            {meeting.aiTranslation}
                          </div>
                        </div>
                      ) : meeting.aiAnalysis && (
                        <div>
                          <p className="text-[10px] text-slate-400 mb-1">Summary (unprocessed):</p>
                          <div className="text-[12px] text-slate-300 leading-relaxed bg-[#0b101a] p-2.5 rounded-lg border border-white/5 whitespace-pre-wrap">
                            {meeting.aiAnalysis}
                          </div>
                        </div>
                      )}

                      {meeting.aiRecommendations && (
                        <div>
                          <p className="text-[10px] text-slate-400 mb-1" dir="rtl">اقتراحات المتابعة:</p>
                          <div dir="rtl" className="text-[12px] text-slate-300 leading-relaxed bg-[#0b101a] p-2.5 rounded-lg border border-white/5 whitespace-pre-wrap">
                            {meeting.aiRecommendations}
                          </div>
                        </div>
                      )}

                      {meeting.transcript && (
                        <>
                          <details>
                            <summary className="text-[11px] text-slate-500 cursor-pointer hover:text-slate-300">
                              Show full transcript
                              {meeting.correctedTranscript && (
                                <span className="text-slate-600"> (مصحح بواسطة AI)</span>
                              )}
                            </summary>
                            <div className="text-[11px] text-slate-400 leading-relaxed bg-[#0b101a] p-2.5 rounded-lg border border-white/5 whitespace-pre-wrap mt-2 max-h-64 overflow-y-auto">
                              {meeting.correctedTranscript || meeting.transcript}
                            </div>
                          </details>

                          {/* Free-form Q&A over this meeting's own transcript —
                              for going back to a specific point without
                              re-reading the whole thing. */}
                          <MeetingAskPanel meetingId={meeting.id} />
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
