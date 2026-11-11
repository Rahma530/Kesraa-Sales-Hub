"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import StatusBadge from "@/components/StatusBadge";
import TierBadge from "@/components/TierBadge";
import MeetingAskPanel from "@/components/MeetingAskPanel";
import { LeadActions } from "@/components/LeadTable";
import {
  User,
  Phone,
  Mail,
  Building2,
  Calendar,
  Bot,
  ClipboardList,
  FileText,
  Users,
  Send,
  Link2,
} from "lucide-react";

type SalesOption = { id: string; name: string; lastActiveAt?: string | null };

function formatDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-US", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

type Mode = "edit" | "status" | "task" | "meeting-result" | "upload-contract" | "transfer" | "details";

export default function LeadDetailClient({
  lead,
  isSalesView,
  allowTransfer,
  canDelete,
  salesTeam,
}: {
  lead: any;
  isSalesView: boolean;
  allowTransfer: boolean;
  canDelete: boolean;
  salesTeam: SalesOption[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [postingComment, setPostingComment] = useState(false);

  const tabs: { key: Mode; label: string; show: boolean }[] = [
    { key: "edit", label: isSalesView ? "Sales Details & Notes" : "Edit Details", show: true },
    { key: "status", label: "Lead Action", show: true },
    { key: "task", label: "Add Follow-up", show: true },
    { key: "meeting-result", label: "Post-Meeting Report", show: isSalesView },
    { key: "upload-contract", label: "Upload Contract", show: isSalesView },
    { key: "transfer", label: "Transfer to Sales Rep", show: allowTransfer },
    { key: "details", label: "Comments & History", show: true },
  ];

  const [activeTab, setActiveTab] = useState<Mode>("edit");

  async function call(url: string, method: string, body?: any) {
    setBusy(true);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "An error occurred");
      router.refresh();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("refreshNotifications"));
      }
      return data;
    } catch (e: any) {
      setToast(e.message);
      setTimeout(() => setToast(null), 4000);
      throw e;
    } finally {
      setBusy(false);
    }
  }

  async function postComment() {
    if (!comment.trim()) return;
    setPostingComment(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}/activity`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: comment.trim(), type: "COMMENT" }),
      });
      if (!res.ok) throw new Error("Failed to add comment");
      setComment("");
      router.refresh();
    } catch (e: any) {
      setToast(e.message);
      setTimeout(() => setToast(null), 4000);
    } finally {
      setPostingComment(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {toast && (
        <div className="fixed bottom-6 right-6 z-[100] px-6 py-4 rounded-2xl shadow-2xl bg-rose-950/90 text-rose-200 border border-rose-500/30">
          <p className="font-semibold">{toast}</p>
        </div>
      )}

      {/* Overview card — all the lead's stored data in one place */}
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
            <StatusBadge status={isSalesView ? lead.salesStatus : lead.status} />
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
            <Users size={14} className="text-slate-500 shrink-0" />
            <span>{lead.assignedTo?.name || "Unassigned"}</span>
          </div>
          {lead.storeUrl &&
            lead.storeUrl.split(",").filter(Boolean).map((url: string, idx: number) => (
              <a key={idx} href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-accent-soft hover:underline truncate">
                <Link2 size={14} className="shrink-0" />
                <span className="truncate" dir="ltr">{url}</span>
              </a>
            ))}
          {lead.socialMediaUrl &&
            lead.socialMediaUrl.split(",").filter(Boolean).map((url: string, idx: number) => (
              <a key={idx} href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-accent-soft hover:underline truncate">
                <Link2 size={14} className="shrink-0" />
                <span className="truncate" dir="ltr">{url}</span>
              </a>
            ))}
          {lead.contractUrl &&
            lead.contractUrl.split(",").filter(Boolean).map((url: string, idx: number) => (
              <a key={idx} href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-emerald-300 hover:underline truncate">
                <FileText size={14} className="shrink-0" />
                <span className="truncate">View Contract #{idx + 1}</span>
              </a>
            ))}
        </div>

        {(lead.need || lead.interestReason || lead.notes || (isSalesView && lead.salesNotes)) && (
          <div className="mt-4 pt-4 border-t border-white/5 space-y-2 text-sm text-slate-300" dir="auto">
            {lead.need && <p><span className="text-slate-500">Need: </span>{lead.need}</p>}
            {lead.interestReason && <p><span className="text-slate-500">Interest: </span>{lead.interestReason}</p>}
            {lead.notes && <p><span className="text-slate-500">Tele-Sales Notes: </span>{lead.notes}</p>}
            {isSalesView && lead.salesNotes && (
              <p className="text-purple-300"><span className="text-purple-400/70 font-semibold">Sales Notes: </span>{lead.salesNotes}</p>
            )}
          </div>
        )}
      </div>

      {/* Actions — everything that used to live behind the 3-dot menu, now on the page */}
      <div className="glass-panel p-6">
        <div className="flex gap-2 overflow-x-auto border-b border-white/5 pb-3 mb-5">
          {tabs.filter((t) => t.show).map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`shrink-0 rounded-xl px-4 py-2 text-sm font-medium transition-all ${
                activeTab === t.key
                  ? "bg-accent/20 text-accent-soft"
                  : "text-slate-400 hover:bg-white/5 hover:text-white"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <LeadActions
          lead={lead}
          mode={activeTab}
          busy={busy}
          allowTransfer={allowTransfer}
          canDelete={canDelete}
          salesTeam={salesTeam}
          isSalesView={isSalesView}
          onStatus={(status) => call(`/api/leads/${lead.id}/status`, "PATCH", { status })}
          onTier={(tier) => call(`/api/leads/${lead.id}/status`, "PATCH", { tier })}
          onFollowUp={(payload) => call(`/api/leads/${lead.id}/followup`, "POST", payload)}
          onCompleteFollowUp={(followUpId, isCompleted) =>
            call(`/api/leads/${lead.id}/followup`, "PATCH", { followUpId, isCompleted })
          }
          onMeeting={(payload) => call(`/api/leads/${lead.id}/meeting`, "POST", payload)}
          onMeetingUpdate={(payload) => call(`/api/leads/${lead.id}/meeting`, "PATCH", payload)}
          onTransfer={(salesEmployeeId) =>
            call(`/api/leads/${lead.id}/transfer`, "POST", { salesEmployeeId })
          }
          onEditDetails={(payload) => call(`/api/leads/${lead.id}`, "PATCH", payload)}
          onDelete={() => {
            if (confirm("Are you sure you want to permanently delete this lead?")) {
              call(`/api/leads/${lead.id}`, "DELETE")
                .then(() => router.push(isSalesView ? "/sales" : "/tele-sales"))
                .catch(() => {});
            }
          }}
        />

        {/* Add a comment — the Comments & History tab shows the full log already;
            this lets the viewer add to it without leaving the page. */}
        {activeTab === "details" && (
          <div className="mt-6 pt-6 border-t border-white/5 flex items-start gap-3">
            <textarea
              rows={2}
              placeholder="Write a comment or note about this lead..."
              className="input-field text-sm resize-none py-3 w-full"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
            <button
              disabled={postingComment || !comment.trim()}
              onClick={postComment}
              className="btn-primary text-sm py-3 px-5 flex items-center gap-2 shrink-0"
            >
              <Send size={14} /> {postingComment ? "Sending..." : "Add"}
            </button>
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
            {lead.meetings.map((meeting: any) => (
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
  );
}
