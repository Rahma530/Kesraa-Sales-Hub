"use client";

import { Fragment, useMemo, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import StatusBadge from "@/components/StatusBadge";
import TierBadge from "@/components/TierBadge";
import { playNotificationSound } from "@/lib/audio";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  User,
  Pencil,
  Clock,
  Calendar,
  CalendarClock,
  FileText,
  Users,
  Trash2,
  Phone,
  Link2,
  Bot,
  MessageCircle,
  Smartphone,
  X,
  ClipboardList,
} from "lucide-react";

type SalesOption = { id: string; name: string; lastActiveAt?: Date | string | null };

export interface FollowUpRow {
  id: string;
  scheduledDate: string;
  notes: string;
  isCompleted: boolean;
}

export interface MeetingRow {
  id: string;
  scheduledAt: string;
  status: string;
  result: string | null;
  notes: string | null;
  recordingUrl?: string | null;
  transcript?: string | null;
  aiAnalysis?: string | null;
  aiTranslation?: string | null;
  aiRecommendations?: string | null;
}

export interface ActivityRow {
  id: string;
  type: string;
  message: string;
  createdAt: string;
  user?: { name: string } | null;
}

export interface LeadRow {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  company: string | null;
  need?: string | null;
  interestReason?: string | null;
  notes?: string | null;
  salesNotes?: string | null;
  storeUrl?: string | null;
  socialMediaUrl?: string | null;
  contractUrl?: string | null;
  status: string;
  salesStatus: string;
  tier: string;
  assignedTo: { id: string; name: string; role: string } | null;
  currentStage: string;
  createdAt: string;
  updatedAt: string;
  followUps?: FollowUpRow[];
  meetings?: MeetingRow[];
  activities?: ActivityRow[];
}

const STATUS_LABELS_FOR_SELECT: { value: string; label: string }[] = [
  { value: "NEW", label: "New" },
  { value: "CONTACTED", label: "Contacted" },
  { value: "NO_ANSWER", label: "No Answer" },
  { value: "NEEDS_FOLLOWUP", label: "Needs Follow-up" },
  { value: "INTERESTED", label: "Interested" },
  { value: "NOT_INTERESTED", label: "Not Interested" },
];

const SALES_STATUS_OPTIONS = [
  { value: "NEW", label: "New" },
  { value: "NO_ANSWER", label: "No Answer" },
  { value: "NOT_AVAILABLE", label: "Not Available" },
  { value: "NEEDS_FOLLOWUP", label: "Needs Follow-up" },
  { value: "MEETING_SCHEDULED", label: "Meeting Scheduled" },
  { value: "MEETING_DONE", label: "Meeting Done" },
  { value: "INTERESTED", label: "Interested" },
  { value: "NOT_INTERESTED", label: "Not Interested" },
  { value: "CLOSED_WON", label: "Closed (Won)" },
  { value: "CLOSED_LOST", label: "Closed (Lost)" },
];
const TIER_OPTIONS = ["WARM", "HOT", "COLD"];
const MEETING_STATUS_OPTIONS = [
  { value: "SCHEDULED", label: "Scheduled" },
  { value: "DONE", label: "Done" },
  { value: "POSTPONED", label: "Postponed" },
  { value: "CANCELLED", label: "Cancelled" },
];

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

export default function LeadTable({
  leads,
  showAssignee,
  allowTransfer,
  canDelete,
  salesTeam,
  employees,
  isSalesView,
  allowExport,
  canHoldMeetings,
}: {
  leads: LeadRow[];
  showAssignee?: boolean;
  allowTransfer?: boolean;
  canDelete?: boolean;
  salesTeam?: SalesOption[];
  employees?: { id: string; name: string; role: string }[];
  isSalesView?: boolean;
  allowExport?: boolean;
  // Only the employee who actually holds the meeting (Sales, or Admin/Heads
  // reviewing on their behalf) should see the "create meeting" / "join a
  // meeting now" controls. Tele-Sales schedules a meeting date and hands
  // the lead off to Sales via the Transfer modal — they never join the
  // meeting themselves, so these buttons stay hidden for them.
  canHoldMeetings?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [openId, setOpenId] = useState<string | null>(null);
  const [modalMode, setModalMode] = useState<"edit" | "details" | "status" | "task" | "transfer" | "meeting-result" | "upload-contract">("details");
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // "Create Meeting" — the real flow: creates a Google Meet link via
  // Calendar API and invites the Fireflies recording bot to it. Replaces
  // the old fake "AI Invite" modal, which just asked the employee to paste
  // a link and then wrote a fabricated transcript (see PR fixing that bug).
  const [createMeetingLoadingFor, setCreateMeetingLoadingFor] = useState<string | null>(null);
  const [createMeetingResultOpen, setCreateMeetingResultOpen] = useState(false);
  const [createMeetingLink, setCreateMeetingLink] = useState<string | null>(null);
  const [createMeetingWarning, setCreateMeetingWarning] = useState<string | null>(null);
  const [createMeetingError, setCreateMeetingError] = useState<string | null>(null);

  // WhatsApp modal
  const [waModalOpen, setWaModalOpen] = useState(false);
  const [waTargetPhone, setWaTargetPhone] = useState("");
  const [waTargetName, setWaTargetName] = useState("");
  const [waStatus, setWaStatus] = useState<"DISCONNECTED"|"INITIALIZING"|"QR_READY"|"CONNECTED">("DISCONNECTED");
  const [waQr, setWaQr] = useState<string|null>(null);
  const [waMessage, setWaMessage] = useState("");
  const [waSending, setWaSending] = useState(false);
  const [waSendError, setWaSendError] = useState("");

  // Poll WhatsApp status when modal is open
  useEffect(() => {
    if (!waModalOpen) return;
    const poll = async () => {
      try {
        const res = await fetch(`/api/whatsapp/status?t=${Date.now()}`);
        if (res.ok) {
          const data = await res.json();
          setWaStatus(data.status);
          setWaQr(data.qrCodeBase64);
        }
      } catch {}
    };
    poll();
    const iv = setInterval(poll, 3000);
    return () => clearInterval(iv);
  }, [waModalOpen]);

  const handleStartWa = async (phone: string, name: string) => {
    setWaTargetPhone(phone);
    setWaTargetName(name);
    setWaMessage(`Hi ${name}, this is the Kesra AI team.`);
    setWaSendError("");
    setWaModalOpen(true);
    // Trigger initialization if disconnected
    const st = await fetch(`/api/whatsapp/status?t=${Date.now()}`).then(r=>r.json()).catch(()=>({}));
    if (st.status === "DISCONNECTED") {
      await fetch("/api/whatsapp/status", { method: "POST" });
    }
  };

  const handleSendWaMessage = async () => {
    if (!waMessage.trim()) return;
    setWaSending(true);
    setWaSendError("");
    try {
      let phone = waTargetPhone.replace(/\\D/g, "");
      // Format Saudi Numbers (966)
      if (phone.startsWith("05")) {
        phone = "966" + phone.substring(1);
      } else if (phone.startsWith("5") && phone.length === 9) {
        phone = "966" + phone;
      } else if (!phone.startsWith("966")) {
        // Fallback for other numbers, just ensure it doesn't fail
        if (phone.startsWith("0")) phone = "966" + phone.substring(1);
        else phone = "966" + phone;
      }

      const res = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, message: waMessage }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setWaModalOpen(false);
      // Wait, since this is in CustomerDetailClient, we don't have showToast. 
      // But we can just use setWaSendError or a small state.
      // We will pass showToast down as a prop if we want.
      setWaSendError("Message sent successfully");
    } catch(e:any) {
      setWaSendError(e.message || "Error sending message");
    } finally {
      setWaSending(false);
    }
  };

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [filterAssignee, setFilterAssignee] = useState<string>("ALL");

  useEffect(() => {
    const q = searchParams.get("search");
    const statusParam = searchParams.get("status");
    
    if (q || statusParam) {
      if (q) setSearch(q);
      if (statusParam) setFilterStatus(statusParam);
      
      // Clean the URL immediately so refreshing doesn't keep the filters
      router.replace(window.location.pathname, { scroll: false });
    }
  }, [searchParams, router]);
  const [dateFilter, setDateFilter] = useState("ALL");

  const [showAddModal, setShowAddModal] = useState(false);
  const [newLead, setNewLead] = useState({ name: "", phone: "", company: "", need: "" });

  const [toast, setToast] = useState<{ text: string, type: 'error' | 'success' } | null>(null);

  const showToast = (text: string, type: 'error' | 'success' = 'error') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 4000);
  };

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
      showToast(e.message, 'error');
      throw e;
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateMeeting(leadId: string) {
    setCreateMeetingLoadingFor(leadId);
    setCreateMeetingError(null);
    try {
      const res = await fetch(`/api/leads/${leadId}/meeting/create-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to create the meeting");

      setCreateMeetingLink(data.meetingLink ?? null);
      setCreateMeetingWarning(data.recordingWarning ?? null);
      setCreateMeetingResultOpen(true);
      router.refresh();
    } catch (e: any) {
      setCreateMeetingError(e.message ?? "Failed to create the meeting");
      showToast(e.message ?? "Failed to create the meeting", "error");
    } finally {
      setCreateMeetingLoadingFor(null);
    }
  }

  async function handleAddLead() {
    if (!newLead.name || !newLead.phone) return showToast("Name and phone number are required");
    await call("/api/leads", "POST", newLead);
    setShowAddModal(false);
    setNewLead({ name: "", phone: "", company: "", need: "" });
  }

  const counts = useMemo(() => ({
    ALL: leads.length,
    NEW: leads.filter(l => l.status === "NEW").length,
    NEEDS_FOLLOWUP: leads.filter(l => l.status === "NEEDS_FOLLOWUP").length,
    CONTACTED: leads.filter(l => l.status === "CONTACTED").length,
    NO_ANSWER: leads.filter(l => l.status === "NO_ANSWER").length,
    INTERESTED: leads.filter(l => l.status === "INTERESTED").length,
    NOT_INTERESTED: leads.filter(l => l.status === "NOT_INTERESTED").length,
    TRANSFERRED_TO_SALES: leads.filter(l => l.status === "TRANSFERRED_TO_SALES").length,
  }), [leads]);

  const tabs = [
    { id: "ALL", label: "All", count: counts.ALL, bg: "bg-[#182032] text-slate-300 border border-white/5", badge: "bg-white/10 text-slate-300" },
    { id: "NEW", label: "New", count: counts.NEW, bg: "bg-[#182032] text-slate-300 border border-white/5", badge: "bg-blue-500/20 text-blue-400" },
    { id: "NEEDS_FOLLOWUP", label: "Follow-up", count: counts.NEEDS_FOLLOWUP, bg: "bg-[#182032] text-slate-300 border border-white/5", badge: "bg-yellow-500/20 text-yellow-500" },
    { id: "CONTACTED", label: "Contacted", count: counts.CONTACTED, bg: "bg-[#182032] text-slate-300 border border-white/5", badge: "bg-emerald-500/20 text-emerald-500" },
    { id: "INTERESTED", label: "Interested", count: counts.INTERESTED, bg: "bg-[#182032] text-slate-300 border border-white/5", badge: "bg-green-500/20 text-green-400" },
    { id: "NOT_INTERESTED", label: "Not Interested", count: counts.NOT_INTERESTED, bg: "bg-[#182032] text-slate-300 border border-white/5", badge: "bg-red-500/20 text-red-400" },
    { id: "NO_ANSWER", label: "No Answer", count: counts.NO_ANSWER, bg: "bg-[#182032] text-slate-300 border border-white/5", badge: "bg-rose-500/20 text-rose-500" },
    { id: "TRANSFERRED_TO_SALES", label: "Transferred to Sales", count: counts.TRANSFERRED_TO_SALES, bg: "bg-[#182032] text-slate-300 border border-white/5", badge: "bg-purple-500/20 text-purple-400" },
  ];

  const filtered = useMemo(() => {
    let list = leads;
    if (filterStatus !== "ALL") {
      list = list.filter((l) => l.status === filterStatus);
    }

    if (filterAssignee !== "ALL") {
      if (filterAssignee === "UNASSIGNED") {
        list = list.filter((l) => !l.assignedTo);
      } else {
        list = list.filter((l) => l.assignedTo?.id === filterAssignee);
      }
    }

    const now = new Date();
    if (dateFilter === "NEW_LEADS") {
      list = list.filter((l) => {
        const diffDays = (now.getTime() - new Date(l.createdAt).getTime()) / (1000 * 3600 * 24);
        return diffDays <= 7;
      });
    } else if (dateFilter === "OLD_LEADS") {
      list = list.filter((l) => {
        const diffDays = (now.getTime() - new Date(l.createdAt).getTime()) / (1000 * 3600 * 24);
        return diffDays > 30;
      });
    }

    // sort by newest by default
    list = [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((lead) =>
      [lead.name, lead.phone, lead.company, lead.email, lead.assignedTo?.name]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(q))
    );
  }, [leads, search, filterStatus, filterAssignee, dateFilter]);

  const handleExport = () => {
    const headers = ["Name", "Phone", "Status", "Tier", "Employee", "Date", "Company", "Need"];
    const csvData = filtered.map(l => [
      l.name,
      l.phone,
      (isSalesView ? SALES_STATUS_OPTIONS : STATUS_LABELS_FOR_SELECT).find(s => s.value === (isSalesView ? l.salesStatus : l.status))?.label || l.status,
      l.tier,
      l.assignedTo?.name || "Unassigned",
      new Date(l.createdAt).toLocaleDateString("en-US"),
      l.company || "",
      l.need || ""
    ]);
    
    // Add BOM (\uFEFF) for Arabic Excel support
    const csvContent = "\uFEFF" + [headers, ...csvData].map(row => 
      row.map(item => `"${(item || "").toString().replace(/"/g, '""')}"`).join(",")
    ).join("\n");
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Leads_Export_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showToast("Export started successfully!", "success");
  };

  const AVATAR_COLORS = [
    "bg-accent", "bg-blue-500", "bg-emerald-500", "bg-orange-400", "bg-pink-500", "bg-yellow-500", "bg-purple-500"
  ];
  function getAvatarColor(id: string) {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      hash = id.charCodeAt(i) + ((hash << 5) - hash);
    }
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
  }

  return (
    <div className="w-full">
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-[100] px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom-5 fade-in duration-300 border ${
          toast.type === 'error' ? 'bg-rose-950/90 text-rose-200 border-rose-500/30' : 'bg-emerald-950/90 text-emerald-200 border-emerald-500/30'
        }`}>
          <span className="text-xl">{toast.type === 'error' ? <AlertTriangle size={20} /> : <CheckCircle2 size={20} />}</span>
          <p className="font-semibold">{toast.text}</p>
        </div>
      )}

      {/* Header & Controls */}
      <div className="flex flex-col gap-4 mb-6 mt-4">
        {/* Title & Count */}
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-white">All Leads</h2>
          <span className="bg-[#1f2937] text-slate-300 px-3 py-1 rounded-full text-xs font-bold shadow-inner">{leads.length}</span>
        </div>

        {/* Search & Filters & Add Button */}
        <div className="flex flex-col md:flex-row items-center justify-between w-full gap-4">
          <div className="flex flex-col md:flex-row items-center gap-3 w-full md:w-auto">
            {/* Search Input */}
            <div className="relative w-full md:w-[360px]">
              <input
                type="text"
                placeholder="Search by name, phone, or status..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-[#1e293b] border border-slate-700/50 text-slate-200 text-base rounded-xl pl-4 pr-12 py-3.5 outline-none focus:border-accent/50 transition-colors placeholder:text-slate-400 shadow-sm"
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
              </div>
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto">
              {/* Filter Dropdown */}
              <div className="relative w-full md:w-56">
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="w-full bg-[#1e293b] border border-slate-700/50 text-slate-200 text-base rounded-xl pl-4 pr-10 py-3.5 outline-none shadow-sm hover:border-slate-600 transition-colors appearance-none cursor-pointer"
                >
                  {tabs.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.label} ({t.count})
                    </option>
                  ))}
                </select>
                <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </div>
              </div>

              {/* Employee Filter */}
              {employees && employees.length > 0 && (
                <div className="relative w-full md:w-48">
                  <select
                    value={filterAssignee}
                    onChange={(e) => setFilterAssignee(e.target.value)}
                    className="w-full bg-[#1e293b] border border-slate-700/50 text-slate-200 text-base rounded-xl pl-4 pr-10 py-3.5 outline-none shadow-sm hover:border-slate-600 transition-colors appearance-none cursor-pointer"
                  >
                    <option value="ALL">All Employees</option>
                    <option value="UNASSIGNED">Unassigned (New)</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.name} ({emp.role === "TELE_SALES" ? "Tele-Sales" : "Sales"})</option>
                    ))}
                  </select>
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                  </div>
                </div>
              )}

              {/* Sort Dropdown */}
              <select 
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="bg-[#1e293b] border border-slate-700/50 text-slate-200 text-base rounded-xl px-5 py-3.5 outline-none shadow-sm hover:border-slate-600 transition-colors hidden md:block cursor-pointer"
              >
                <option value="ALL">All (Newest First)</option>
                <option value="NEW_LEADS">New Leads</option>
                <option value="OLD_LEADS">Older Leads (1mo+)</option>
              </select>
            </div>
          </div>

          {/* Add New Lead & Export Buttons */}
          <div className="flex items-center gap-2 w-full md:w-auto">
            {allowExport && (
              <button 
                onClick={handleExport}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-3.5 rounded-xl text-base font-medium transition-colors flex items-center gap-2 shadow-sm w-full md:w-auto justify-center"
              >
                <Download size={16} /> Export Excel
              </button>
            )}
            {!isSalesView && (
              <button 
                onClick={() => setShowAddModal(true)}
                className="bg-[#3b82f6] hover:bg-blue-600 text-white px-4 py-3.5 rounded-xl text-base font-medium transition-colors flex items-center gap-2 shadow-sm w-full md:w-auto justify-center"
              >
                Add New Lead
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="p-16 text-center text-sm text-slate-500 bg-[#121826] rounded-2xl border border-white/5">
          {leads.length === 0 ? "No leads yet" : "No results match your search"}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map((lead) => {
            const latestActivity = lead.activities?.[0];
            const isSelected = openId === lead.id;
            const avatarColor = getAvatarColor(lead.id);

            return (
              <div key={lead.id} className="bg-[#121826] rounded-2xl p-5 flex flex-col gap-4 relative border border-white/5 hover:border-white/10 transition-colors shadow-lg group overflow-hidden">
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3 min-w-0 flex-1 overflow-hidden">
                    <div className={`w-12 h-12 shrink-0 rounded-full ${avatarColor} flex items-center justify-center text-white shadow-inner`}>
                      <User size={20} />
                    </div>
                    <div className="min-w-0 flex-1 overflow-hidden">
                      <Link href={`/leads/${lead.id}`} dir="auto" className="font-bold text-white text-[15px] truncate text-right block hover:text-accent-soft hover:underline transition-colors" title={lead.name}>{lead.name}</Link>
                      <p dir="auto" className="text-[11px] text-slate-400 mt-0.5 truncate text-right" title={lead.company || ""}>{lead.company || "—"}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2.5">
                    <div className="relative">
                      <button 
                        onClick={(e) => { e.stopPropagation(); setOpenDropdown(openDropdown === lead.id ? null : lead.id); }}
                        className="text-slate-500 hover:text-white transition-colors p-1"
                        title="Actions"
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="1"></circle>
                          <circle cx="12" cy="5" r="1"></circle>
                          <circle cx="12" cy="19" r="1"></circle>
                        </svg>
                      </button>
                      
                      {openDropdown === lead.id && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setOpenDropdown(null); }}></div>
                          <div className="absolute left-0 mt-2 w-56 bg-[#0f1523] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden flex flex-col py-1">

                            <button onClick={(e) => { e.stopPropagation(); setOpenId(lead.id); setModalMode("edit"); setOpenDropdown(null); }} className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 hover:bg-white/5 hover:text-white transition-colors text-right w-full">
                              <Pencil size={14} /> {isSalesView ? "Sales Details & Notes" : "Edit Details"}
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); setOpenId(lead.id); setModalMode("status"); setOpenDropdown(null); }} className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 hover:bg-white/5 hover:text-white transition-colors text-right w-full">
                              <Clock size={14} /> Lead Action
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); setOpenId(lead.id); setModalMode("task"); setOpenDropdown(null); }} className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 hover:bg-white/5 hover:text-white transition-colors text-right w-full">
                              <Calendar size={14} /> Add Follow-up
                            </button>

                            {isSalesView && (
                              <button onClick={(e) => { e.stopPropagation(); setOpenId(lead.id); setModalMode("meeting-result"); setOpenDropdown(null); }} className="flex items-center gap-3 px-4 py-2.5 text-sm text-emerald-400 hover:bg-emerald-500/20 transition-colors text-right w-full border-t border-white/5 font-semibold">
                                <FileText size={14} /> Post-Meeting Report
                              </button>
                            )}

                            {isSalesView && (
                              <button onClick={(e) => { e.stopPropagation(); setOpenId(lead.id); setModalMode("upload-contract"); setOpenDropdown(null); }} className="flex items-center gap-3 px-4 py-2.5 text-sm text-blue-400 hover:bg-blue-500/20 transition-colors text-right w-full border-t border-white/5 font-semibold">
                                <FileText size={14} /> Upload Contract
                              </button>
                            )}

                            {allowTransfer && (
                              <button onClick={(e) => { e.stopPropagation(); setOpenId(lead.id); setModalMode("transfer"); setOpenDropdown(null); }} className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 hover:bg-accent/20 hover:text-accent-soft transition-colors text-right w-full">
                                <Users size={14} /> Transfer to Sales Rep
                              </button>
                            )}
                            {canDelete && (
                              <button onClick={(e) => {
                                e.stopPropagation();
                                if (confirm(`Are you sure you want to permanently delete this lead?`)) {
                                  call(`/api/leads/${lead.id}`, "DELETE").catch(() => {});
                                }
                                setOpenDropdown(null);
                              }} className="flex items-center gap-3 px-4 py-2.5 text-sm text-status-hot hover:bg-rose-500/10 transition-colors text-right w-full border-t border-white/5 mt-1 pt-2.5">
                                <Trash2 size={14} /> Delete Lead
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-row-reverse">
                      <StatusBadge status={isSalesView ? lead.salesStatus : lead.status} />
                      <TierBadge tier={lead.tier} />
                    </div>
                    <div className="flex flex-col items-end gap-1.5 mt-1">
                      {showAssignee && lead.assignedTo?.name && (
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${lead.assignedTo.role === "SALES" ? "bg-purple-500/10 text-purple-400 border-purple-500/20" : "bg-blue-500/10 text-blue-400 border-blue-500/20"}`}>
                          With: {lead.assignedTo.name}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Details */}
                <div className="space-y-3 mt-1 flex-1">
                  <div className="flex items-center gap-3 text-xs text-slate-300">
                    <Phone size={14} className="text-slate-500" />
                    <span dir="ltr" className="text-slate-300 font-medium tracking-wide">{lead.phone}</span>
                  </div>
                  {(lead.storeUrl || lead.socialMediaUrl) && (
                    <div className="flex items-start gap-3 text-xs text-slate-300 overflow-hidden">
                      <Link2 size={14} className="text-slate-500 mt-0.5" />
                      <div className="flex flex-col min-w-0 flex-1 gap-1.5">
                        {lead.storeUrl && lead.storeUrl.split(',').filter(Boolean).map((url, idx) => (
                          <a key={idx} href={url} target="_blank" rel="noopener noreferrer" className="text-accent-soft hover:text-accent-soft transition-colors truncate w-full block" dir="ltr" title={`Store ${idx + 1}`}>
                            {url}
                          </a>
                        ))}
                        {lead.socialMediaUrl && lead.socialMediaUrl.split(',').filter(Boolean).map((url, idx) => (
                          <a key={idx} href={url} target="_blank" rel="noopener noreferrer" className="text-accent-soft hover:text-accent-soft transition-colors truncate w-full block" dir="ltr" title={`Social Media ${idx + 1}`}>
                            {url}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex items-start gap-3 text-xs text-slate-300">
                    <CalendarClock size={14} className="text-slate-500 mt-0.5" />
                    <span className="text-slate-400 truncate w-full block mt-0.5">
                      {latestActivity ? `Last contact: ${formatDateTime(latestActivity.createdAt)}` : "No contact yet"}
                    </span>
                  </div>
                  {/* Show Meeting Date and Notes if any meeting exists */}
                  {lead.meetings?.[0] && (
                    lead.meetings[0].status === "DONE" ? (
                      <div className="mt-4 bg-emerald-500/10 border border-emerald-500/20 p-3 rounded-xl space-y-3">
                        <div>
                          <p className="text-xs text-emerald-400 font-bold mb-2 flex items-center gap-1.5"><CheckCircle2 size={14} /> Meeting result: {formatDateTime(lead.meetings[0].scheduledAt)}</p>
                          {lead.meetings[0].result && <p className="text-[11px] text-slate-300 leading-relaxed bg-[#0b101a] p-2.5 rounded-lg border border-white/5">{lead.meetings[0].result}</p>}
                        </div>

                        {(lead.meetings[0].aiAnalysis || lead.meetings[0].aiTranslation || lead.meetings[0].transcript) && (
                          <div className="border-t border-emerald-500/20 pt-3 space-y-3">
                            <h4 className="text-xs font-bold text-emerald-300 flex items-center gap-1"><Bot size={14} /> AI Analysis</h4>

                            {/* No "watch recording" link — we delete the recording from
                                Fireflies right after saving our own copy (storage cleanup),
                                so that link would just 404 once processing is done. */}

                            {/* Show the Gemini-corrected Arabic summary as the primary
                                summary. Only fall back to Fireflies' raw (English,
                                uncorrected) summary when Gemini hasn't produced one yet —
                                e.g. still processing, or the Gemini call failed. The raw
                                transcript is intentionally not shown here (too noisy for
                                a quick glance); it's available on the lead's full page. */}
                            {lead.meetings[0].aiTranslation ? (
                              <div>
                                <p className="text-[10px] text-slate-400 mb-1" dir="rtl">الملخص:</p>
                                <div dir="rtl" className="text-[11px] text-slate-300 leading-relaxed bg-[#0b101a] p-2.5 rounded-lg border border-white/5 whitespace-pre-wrap max-h-32 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10">
                                  {lead.meetings[0].aiTranslation}
                                </div>
                              </div>
                            ) : lead.meetings[0].aiAnalysis && (
                              <div>
                                <p className="text-[10px] text-slate-400 mb-1">Summary & Analysis:</p>
                                <div className="text-[11px] text-slate-300 leading-relaxed bg-[#0b101a] p-2.5 rounded-lg border border-white/5 whitespace-pre-wrap max-h-32 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10">
                                  {lead.meetings[0].aiAnalysis}
                                </div>
                              </div>
                            )}

                            {lead.meetings[0].aiRecommendations && (
                              <div>
                                <p className="text-[10px] text-slate-400 mb-1" dir="rtl">اقتراحات المتابعة:</p>
                                <div dir="rtl" className="text-[11px] text-slate-300 leading-relaxed bg-[#0b101a] p-2.5 rounded-lg border border-white/5 whitespace-pre-wrap max-h-32 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10">
                                  {lead.meetings[0].aiRecommendations}
                                </div>
                              </div>
                            )}

                            <Link href={`/leads/${lead.id}`} className="block text-center text-[11px] text-accent-soft hover:underline pt-1">
                              عرض كل الاجتماعات والتفاصيل الكاملة
                            </Link>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="mt-4 bg-purple-500/10 border border-purple-500/20 p-3 rounded-xl">
                        <p className="text-xs text-purple-400 font-bold mb-2 flex items-center gap-1.5"><Calendar size={14} /> Meeting time: {formatDateTime(lead.meetings[0].scheduledAt)}</p>
                        {lead.meetings[0].notes && <p className="text-[11px] text-slate-300 leading-relaxed bg-[#0b101a] p-2.5 rounded-lg border border-white/5">{lead.meetings[0].notes}</p>}
                      </div>
                    )
                  )}

                  {/* Notes box exactly like screenshot */}
                  {lead.notes ? (
                    <div className="mt-4 bg-[#182032] border border-white/5 p-3 rounded-xl text-xs text-slate-300 text-center truncate shadow-inner font-medium" title={lead.notes}>
                      {lead.notes}
                    </div>
                  ) : lead.need ? (
                    <div className="mt-4 bg-[#182032] border border-white/5 p-3 rounded-xl text-xs text-slate-300 text-center truncate shadow-inner font-medium" title={lead.need}>
                      {lead.need}
                    </div>
                  ) : (
                    <div className="mt-4 bg-[#182032] border border-white/5 p-3 rounded-xl text-[11px] text-slate-500 text-center shadow-inner font-medium">
                      No notes or needs
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="mt-2 pt-4 flex gap-2 border-t border-white/[0.03]">
                  {/* WhatsApp temporarily disabled — see DashboardNav.tsx for why */}
                  <button
                    onClick={() => { setOpenId(lead.id); setModalMode("details"); }}
                    className="flex-1 bg-[#1f2937] hover:bg-[#374151] text-slate-300 rounded-xl py-3 text-[13px] transition-colors font-semibold"
                  >
                    Details
                  </button>
                  {canHoldMeetings && (
                    <>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          handleCreateMeeting(lead.id);
                        }}
                        disabled={createMeetingLoadingFor === lead.id}
                        className="bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 text-purple-400 rounded-xl w-10 flex items-center justify-center transition-colors disabled:opacity-50"
                        title="Create Meeting (real Google Meet link + AI recording)"
                      >
                        {createMeetingLoadingFor === lead.id ? (
                          <div className="w-4 h-4 border-2 border-purple-400/30 border-t-purple-400 rounded-full animate-spin" />
                        ) : (
                          <Bot size={18} />
                        )}
                      </button>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          // Just opens Google Meet's "new meeting" page — no
                          // backend call here. Use "Create Meeting" above for
                          // a real link with the AI recording bot invited.
                          window.open("https://meet.google.com/new", "_blank");
                        }}
                        className="bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 rounded-xl w-10 flex items-center justify-center transition-colors"
                        title="Google Meeting (manual, no recording)"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>
                      </button>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          window.open("https://zoom.us/meeting/schedule", "_blank");
                        }}
                        className="bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 text-blue-400 rounded-xl w-10 flex items-center justify-center transition-colors"
                        title="Zoom Meeting (manual, no recording)"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M16 10.655V8.5A1.5 1.5 0 0 0 14.5 7h-11A1.5 1.5 0 0 0 2 8.5v8A1.5 1.5 0 0 0 3.5 18h11a1.5 1.5 0 0 0 1.5-1.5v-2.155l4.636 3.161A.5.5 0 0 0 22 17.094V7.906a.5.5 0 0 0-.78-.415L16 10.655z"/></svg>
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* WhatsApp Internal Modal */}
      {waModalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
          <div className="bg-[#0f1523] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col overflow-hidden">
            {/* Header */}
            <div className="p-5 border-b border-white/10 flex justify-between items-center">
              <h3 className="text-white font-bold text-lg flex items-center gap-2">
                <MessageCircle size={18} className="text-green-400" /> WhatsApp — {waTargetName}
              </h3>
              <button onClick={() => setWaModalOpen(false)} className="text-slate-400 hover:text-white transition-colors"><X size={18} /></button>
            </div>

            <div className="p-6">
              {/* Disconnected — show connect button */}
              {waStatus === "DISCONNECTED" && (
                <div className="text-center py-6">
                  <p className="text-slate-300 mb-4">WhatsApp is not linked. Click to generate a QR code.</p>
                  <button
                    onClick={() => fetch("/api/whatsapp/status", { method: "POST" })}
                    className="bg-green-600 hover:bg-green-500 text-white font-bold py-3 px-8 rounded-xl transition-colors"
                  >
                    Generate QR Code to Link
                  </button>
                </div>
              )}

              {/* Initializing */}
              {waStatus === "INITIALIZING" && (
                <div className="text-center py-8">
                  <div className="w-12 h-12 border-4 border-green-500/20 border-t-green-500 rounded-full animate-spin mx-auto mb-4"></div>
                  <p className="text-green-400 font-bold">Preparing QR code... please wait</p>
                  <p className="text-sm text-slate-400 mt-2">This may take a few seconds</p>
                </div>
              )}

              {/* QR Ready */}
              {waStatus === "QR_READY" && waQr && (
                <div className="text-center">
                  <p className="text-white font-bold mb-4 flex items-center justify-center gap-1.5"><Smartphone size={16} /> Scan this code with your phone</p>
                  <div className="bg-white p-3 rounded-2xl inline-block mb-4 shadow-xl">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={waQr} alt="WhatsApp QR" width={220} height={220} />
                  </div>
                  <div className="text-right text-sm text-slate-300 space-y-2 bg-white/5 p-3 rounded-xl border border-white/10">
                    <p>1. Open <strong>WhatsApp</strong> on your phone</p>
                    <p>2. Go to <strong>Settings</strong> → <strong>Linked Devices</strong></p>
                    <p>3. Tap <strong>Link a Device</strong> and scan the code</p>
                  </div>
                </div>
              )}

              {/* Connected — show message box */}
              {waStatus === "CONNECTED" && (
                <div>
                  <div className="flex items-center gap-2 mb-4 text-green-400 font-bold">
                    <CheckCircle2 size={16} /> Connected — Send message to {waTargetName}
                  </div>
                  <textarea
                    className="w-full h-28 bg-[#0e1320] border border-white/10 rounded-xl p-3 text-white text-sm focus:outline-none focus:border-green-500 resize-none mb-3"
                    value={waMessage}
                    onChange={(e) => setWaMessage(e.target.value)}
                    placeholder="Write your message..."
                  />
                  {waSendError && <p className="text-red-400 text-xs mb-3">{waSendError}</p>}
                  <button
                    onClick={handleSendWaMessage}
                    disabled={waSending || !waMessage.trim()}
                    className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-3 rounded-xl disabled:opacity-50 transition-colors"
                  >
                    {waSending ? "Sending..." : "Send Message"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Meeting — result modal (real Google Meet link, created via
          Calendar API, with the Fireflies recording bot already invited) */}
      {createMeetingResultOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
          <div className="bg-[#0f1523] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col overflow-hidden">
            <div className="p-5 border-b border-white/10 flex justify-between items-center bg-accent-deep/20">
              <h3 className="text-white font-bold text-lg flex items-center gap-2">
                <Bot size={18} className="text-accent-soft" /> Meeting Created
              </h3>
              <button onClick={() => setCreateMeetingResultOpen(false)} className="text-slate-400 hover:text-white transition-colors"><X size={18} /></button>
            </div>
            <div className="p-6">
              {createMeetingWarning && (
                <div className="mb-4 bg-amber-500/10 border border-amber-500/20 text-amber-300 text-sm rounded-xl p-3">
                  The meeting link was created, but the recording bot could not join: {createMeetingWarning}.
                  You can still hold the meeting — it just won&apos;t be recorded automatically.
                </div>
              )}
              <p className="text-slate-300 text-sm mb-3">
                A real Google Meet link was created and the AI recording bot has been invited to join automatically.
                The transcript and AI summary will appear on this lead once the meeting ends.
              </p>
              <div className="flex items-center gap-2 bg-[#0e1320] border border-white/10 rounded-xl p-3 mb-4">
                <input
                  readOnly
                  dir="ltr"
                  value={createMeetingLink ?? ""}
                  className="flex-1 bg-transparent text-white text-sm focus:outline-none"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <button
                  onClick={() => createMeetingLink && navigator.clipboard.writeText(createMeetingLink)}
                  className="text-xs bg-white/5 hover:bg-white/10 text-slate-300 rounded-lg px-2 py-1 transition-colors"
                >
                  Copy
                </button>
              </div>
              <button
                onClick={() => createMeetingLink && window.open(createMeetingLink, "_blank")}
                className="w-full bg-accent hover:bg-accent text-white font-bold py-3 rounded-xl transition-colors"
              >
                Open Meeting Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal for Details */}
      {openId && leads.some(l => l.id === openId) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => { setOpenId(null); if(searchParams.get("leadId")) router.replace(window.location.pathname, {scroll: false}); }}>
          <div 
            className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-3xl bg-[#0f1523] border border-[#1b2438] p-6 shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button onClick={() => { setOpenId(null); if(searchParams.get("leadId")) router.replace(window.location.pathname, {scroll: false}); }} className="absolute top-5 left-5 w-8 h-8 flex items-center justify-center rounded-full bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 transition-colors"><X size={16} /></button>
            <h2 className="text-xl font-bold text-white mb-6 border-b border-white/5 pb-4">
              {modalMode === "edit" ? "Lead Information" :
               modalMode === "status" ? "Lead Action" :
               modalMode === "task" ? "Add Follow-up" :
               modalMode === "transfer" ? "Transfer Lead to Sales" :
               modalMode === "meeting-result" ? "Meeting Report" :
               "Lead Details"}: {leads.find(l => l.id === openId)?.name}
            </h2>
            <LeadActions
              lead={leads.find(l => l.id === openId)!}
              mode={modalMode}
              busy={busy}
              allowTransfer={allowTransfer}
              canDelete={canDelete}
              salesTeam={salesTeam}
              onStatus={(status) => call(`/api/leads/${openId}/status`, "PATCH", { status })}
              onTier={(tier) => call(`/api/leads/${openId}/status`, "PATCH", { tier })}
              onFollowUp={(payload) => call(`/api/leads/${openId}/followup`, "POST", payload)}
              onCompleteFollowUp={(followUpId, isCompleted) =>
                call(`/api/leads/${openId}/followup`, "PATCH", { followUpId, isCompleted })
              }
              onMeeting={(payload) => call(`/api/leads/${openId}/meeting`, "POST", payload)}
              onMeetingUpdate={(payload) =>
                call(`/api/leads/${openId}/meeting`, "PATCH", payload)
              }
              onTransfer={(salesEmployeeId) =>
                call(`/api/leads/${openId}/transfer`, "POST", { salesEmployeeId })
              }
              onEditDetails={(payload) => call(`/api/leads/${openId}`, "PATCH", payload)}
              onDelete={() => {
                if (confirm(`Are you sure you want to permanently delete this lead?`)) {
                  call(`/api/leads/${openId}`, "DELETE")
                    .then(() => setOpenId(null))
                    .catch(() => {});
                }
              }}
              isSalesView={isSalesView}
            />
          </div>
        </div>
      )}

      {/* Add Lead Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setShowAddModal(false)}>
          <div className="w-full max-w-md rounded-3xl bg-[#0f1523] border border-[#1b2438] p-6 shadow-2xl relative" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setShowAddModal(false)} className="absolute top-5 left-5 w-8 h-8 flex items-center justify-center rounded-full bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 transition-colors"><X size={16} /></button>
            <h3 className="text-lg font-bold text-white mb-6 border-b border-white/5 pb-4">Add New Lead Manually</h3>
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-slate-300 mb-1">Lead Name *</p>
                <input
                  className="w-full bg-[#1e293b] border border-slate-700/50 text-slate-200 text-sm rounded-xl px-4 py-3 outline-none focus:border-accent/50 transition-colors placeholder:text-slate-500"
                  placeholder="Name"
                  value={newLead.name}
                  onChange={(e) => setNewLead({ ...newLead, name: e.target.value })}
                />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-300 mb-1">Phone Number *</p>
                <input
                  className="w-full bg-[#1e293b] border border-slate-700/50 text-slate-200 text-sm rounded-xl px-4 py-3 outline-none focus:border-accent/50 transition-colors placeholder:text-slate-500"
                  placeholder="Phone Number"
                  value={newLead.phone}
                  onChange={(e) => setNewLead({ ...newLead, phone: e.target.value })}
                />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-300 mb-1">Company (optional)</p>
                <input
                  className="w-full bg-[#1e293b] border border-slate-700/50 text-slate-200 text-sm rounded-xl px-4 py-3 outline-none focus:border-accent/50 transition-colors placeholder:text-slate-500"
                  placeholder="Company"
                  value={newLead.company}
                  onChange={(e) => setNewLead({ ...newLead, company: e.target.value })}
                />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-300 mb-1">Need (optional)</p>
                <input
                  className="w-full bg-[#1e293b] border border-slate-700/50 text-slate-200 text-sm rounded-xl px-4 py-3 outline-none focus:border-accent/50 transition-colors placeholder:text-slate-500"
                  placeholder="Need"
                  value={newLead.need}
                  onChange={(e) => setNewLead({ ...newLead, need: e.target.value })}
                />
              </div>
            </div>
            <div className="mt-8 flex justify-end gap-3">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white transition-colors"
                disabled={busy}
              >
                Cancel
              </button>
              <button
                onClick={handleAddLead}
                className="bg-accent hover:bg-accent text-white px-6 py-2.5 rounded-xl text-sm font-medium transition-colors"
                disabled={busy || !newLead.name || !newLead.phone}
              >
                {busy ? "Adding..." : "Add Lead"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LeadActions({
  lead,
  mode,
  busy,
  allowTransfer,
  canDelete,
  salesTeam,
  onStatus,
  onTier,
  onFollowUp,
  onCompleteFollowUp,
  onMeeting,
  onMeetingUpdate,
  onTransfer,
  onEditDetails,
  onDelete,
  isSalesView,
}: {
  lead: LeadRow;
  mode: "edit" | "details" | "status" | "task" | "transfer" | "meeting-result" | "upload-contract";
  busy: boolean;
  allowTransfer?: boolean;
  canDelete?: boolean;
  salesTeam?: SalesOption[];
  onStatus: (status: string) => void;
  onTier: (tier: string) => void;
  onFollowUp: (payload: { scheduledDate?: string; notes?: string }) => void;
  onCompleteFollowUp: (followUpId: string, isCompleted: boolean) => void;
  onMeeting: (payload: { scheduledAt: string; notes?: string }) => any;
  onMeetingUpdate: (payload: {
    meetingId: string;
    status?: string;
    result?: string;
  }) => void;
  onTransfer: (salesEmployeeId: string) => any;
  onEditDetails: (payload: Record<string, string>) => any;
  onDelete: () => void;
  isSalesView?: boolean;
}) {
  const [followUpDate, setFollowUpDate] = useState("");
  const [followUpNotes, setFollowUpNotes] = useState("");
  const [transferError, setTransferError] = useState("");
  const [meetingDate, setMeetingDate] = useState("");
  const [meetingNotes, setMeetingNotes] = useState("");
  const [meetingResultNotes, setMeetingResultNotes] = useState("");
  const [selectedSales, setSelectedSales] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [storeUrls, setStoreUrls] = useState<string[]>(
    lead.storeUrl ? lead.storeUrl.split(',').filter(Boolean) : [""]
  );
  const [socialMediaUrls, setSocialMediaUrls] = useState<string[]>(
    lead.socialMediaUrl ? lead.socialMediaUrl.split(',').filter(Boolean) : [""]
  );
  const [edit, setEdit] = useState({
    name: lead.name,
    phone: lead.phone,
    email: lead.email ?? "",
    company: lead.company ?? "",
    need: lead.need ?? "",
    interestReason: lead.interestReason ?? "",
    notes: lead.notes ?? "",
    salesNotes: lead.salesNotes ?? "",
    storeUrl: lead.storeUrl ?? "",
    socialMediaUrl: lead.socialMediaUrl ?? "",
    tier: (lead.tier === "LEAD" || !lead.tier) ? "WARM" : lead.tier,
  });

  const latestMeeting = lead.meetings?.[0];
  const [meetingStatus, setMeetingStatus] = useState(latestMeeting?.status ?? "SCHEDULED");
  const [meetingResult, setMeetingResult] = useState(latestMeeting?.result ?? "");

  const pendingFollowUps = (lead.followUps ?? []).filter((f) => !f.isCompleted);

  const [onlineSalesIds, setOnlineSalesIds] = useState<string[]>([]);

  useEffect(() => {
    if (mode === "transfer" && allowTransfer) {
      fetch('/api/users/online?t=' + Date.now())
        .then(res => res.json())
        .then(data => {
          if (data.onlineUsers) {
            setOnlineSalesIds(data.onlineUsers.map((u: any) => u.id));
          }
        })
        .catch(() => {});
    }
  }, [mode, allowTransfer, lead.id]); // only re-run when mode changes

  return (
    <div className="space-y-6">
      {mode === "edit" && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <p className="mb-1 text-xs text-slate-500">Name</p>
            <input
              className="input-field text-sm w-full py-3"
              placeholder="Name"
              value={edit.name}
              onChange={(e) => setEdit({ ...edit, name: e.target.value })}
            />
          </div>
          <div>
            <p className="mb-1 text-xs text-slate-500">Phone</p>
            <input
              className="input-field text-sm w-full py-3"
              placeholder="Phone"
              dir="ltr"
              value={edit.phone}
              onChange={(e) => setEdit({ ...edit, phone: e.target.value })}
            />
          </div>
          <div>
            <p className="mb-1 text-xs text-slate-500">Email</p>
            <input
              className="input-field text-sm w-full py-3"
              placeholder="Email"
              dir="ltr"
              value={edit.email}
              onChange={(e) => setEdit({ ...edit, email: e.target.value })}
            />
          </div>
          <div>
            <p className="mb-1 text-xs text-slate-500">Company</p>
            <input
              className="input-field text-sm w-full py-3"
              placeholder="Company"
              value={edit.company}
              onChange={(e) => setEdit({ ...edit, company: e.target.value })}
            />
          </div>
          <div>
            <p className="mb-1 text-xs text-slate-500">Need</p>
            <input
              className="input-field text-sm w-full py-3"
              placeholder="Need"
              value={edit.need}
              onChange={(e) => setEdit({ ...edit, need: e.target.value })}
            />
          </div>
          <div>
            <p className="mb-1 text-xs text-slate-500">Lead Tier</p>
            <select
              className="input-field text-sm w-full py-3"
              value={edit.tier}
              onChange={(e) => setEdit({ ...edit, tier: e.target.value })}
            >
              {TIER_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s === "HOT" ? "Hot" : s === "WARM" ? "Warm" : s === "COLD" ? "Cold" : "Normal"}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-3">
            <p className="mb-1 text-xs text-slate-500">Tele-Sales Notes</p>
            <textarea
              className="input-field text-sm w-full py-3 opacity-80 cursor-not-allowed"
              placeholder="None"
              rows={2}
              value={edit.notes}
              disabled
            />
          </div>
          {isSalesView && (
            <div className="sm:col-span-3">
              <p className="mb-1 text-xs text-purple-400 font-bold">Sales Notes (private to you)</p>
              <textarea
                className="input-field text-sm w-full py-3 border-purple-500/30 focus:border-purple-500"
                placeholder="Write your notes and meeting assessment here..."
                rows={4}
                value={edit.salesNotes}
                onChange={(e) => setEdit({ ...edit, salesNotes: e.target.value })}
              />
            </div>
          )}
          <div className="sm:col-span-3">
            <p className="mb-1 text-xs text-slate-500">Store / Website Link</p>
            <div className="space-y-3">
              {storeUrls.map((url, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    className="input-field text-sm flex-1 py-3"
                    placeholder="https://example.com"
                    dir="ltr"
                    type="url"
                    value={url}
                    onChange={(e) => {
                      const newUrls = [...storeUrls];
                      newUrls[idx] = e.target.value;
                      setStoreUrls(newUrls);
                    }}
                  />
                  {url && (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-ghost px-4 py-3 text-sm text-accent-soft whitespace-nowrap"
                    >
                      Open ↗
                    </a>
                  )}
                  {storeUrls.length > 1 && (
                    <button
                      onClick={() => setStoreUrls(storeUrls.filter((_, i) => i !== idx))}
                      className="btn-ghost px-4 py-3 text-sm text-status-hot"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={() => setStoreUrls([...storeUrls, ""])}
              className="mt-3 text-sm font-semibold text-accent-soft hover:text-accent transition-colors"
            >
              + Add Another Link
            </button>
          </div>
          <div className="sm:col-span-3">
            <p className="mb-1 text-xs text-slate-500">Social Media Account Links</p>
            <div className="space-y-3">
              {socialMediaUrls.map((url, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    className="input-field text-sm flex-1 py-3"
                    placeholder="Enter the link here..."
                    dir="ltr"
                    type="url"
                    value={url}
                    onChange={(e) => {
                      const newUrls = [...socialMediaUrls];
                      newUrls[idx] = e.target.value;
                      setSocialMediaUrls(newUrls);
                    }}
                  />
                  {url && (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-ghost px-4 py-3 text-sm text-accent-soft whitespace-nowrap"
                    >
                      Open ↗
                    </a>
                  )}
                  {socialMediaUrls.length > 1 && (
                    <button
                      onClick={() => setSocialMediaUrls(socialMediaUrls.filter((_, i) => i !== idx))}
                      className="btn-ghost px-4 py-3 text-sm text-status-hot"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={() => setSocialMediaUrls([...socialMediaUrls, ""])}
              className="mt-3 text-sm font-semibold text-accent-soft hover:text-accent transition-colors"
            >
              + Add Another Link
            </button>
          </div>
          <div className="flex gap-3 sm:col-span-3 mt-2">
            <button
              disabled={busy || !edit.name || !edit.phone || saved}
              onClick={async () => {
                try {
                  const { tier, ...restEdit } = edit;
                  await onEditDetails({ ...restEdit, storeUrl: storeUrls.filter(Boolean).join(','), socialMediaUrl: socialMediaUrls.filter(Boolean).join(',') });
                  if (tier !== lead.tier) {
                    await onTier(tier);
                  }
                  setSaved(true);
                  setTimeout(() => setSaved(false), 2000);
                } catch (e) {
                  // error handled by call function
                }
              }}
              className={`text-sm py-3 px-6 flex-1 transition-colors ${saved ? 'bg-emerald-500 text-white rounded-xl shadow-lg font-semibold' : 'btn-primary'}`}
            >
              {saved ? "Saved successfully" : "Save Changes"}
            </button>
            {canDelete && (
              <button disabled={busy} onClick={onDelete} className="btn-ghost text-sm py-3 px-6 text-status-hot">
                Permanently Delete Lead
              </button>
            )}
          </div>
        </div>
      )}

      {mode === "status" && (
        <div className="space-y-4 max-w-sm mx-auto">
          <p className="text-sm font-semibold text-slate-400 mb-2">Lead Action</p>
          <select
            disabled={busy}
            defaultValue={isSalesView ? lead.salesStatus : lead.status}
            onChange={(e) => onStatus(e.target.value)}
            className="input-field text-sm py-3 w-full"
          >
            {(isSalesView ? SALES_STATUS_OPTIONS : STATUS_LABELS_FOR_SELECT).map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {mode === "task" && (
        <div className="space-y-8 max-w-lg mx-auto">
          <div className="space-y-2 mb-6">
            <p className="text-sm font-semibold text-slate-400">Update Status</p>
            <select
              disabled={busy}
              defaultValue={isSalesView ? lead.salesStatus : lead.status}
              onChange={(e) => onStatus(e.target.value)}
              className="input-field text-sm py-3 w-full"
            >
              {(isSalesView ? SALES_STATUS_OPTIONS : STATUS_LABELS_FOR_SELECT).map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-3 pb-6">
            <h3 className="text-lg font-bold text-accent-soft mb-4">Add Follow-up</h3>
            <input
              type="datetime-local"
              className="input-field text-sm py-3 w-full"
              value={followUpDate}
              onChange={(e) => setFollowUpDate(e.target.value)}
            />
            <div className="space-y-1 mt-2">
              <p className="text-xs text-slate-500">Follow-up Notes</p>
              <textarea
                rows={3}
                placeholder="Write follow-up notes here..."
                className="input-field text-sm resize-none py-3 w-full"
                value={followUpNotes}
                onChange={(e) => setFollowUpNotes(e.target.value)}
              />
            </div>
            <button
              disabled={busy || saved}
              onClick={async () => {
                try {
                  await onFollowUp({ scheduledDate: followUpDate ? new Date(followUpDate).toISOString() : undefined, notes: followUpNotes });
                  setFollowUpDate("");
                  setFollowUpNotes("");
                  setSaved(true);
                  setTimeout(() => setSaved(false), 2000);
                } catch (e) {
                  // handle
                }
              }}
              className={`w-full text-sm py-3 mt-4 transition-colors ${saved ? 'bg-emerald-500 text-white rounded-xl shadow-lg font-semibold' : 'btn-primary'}`}
            >
              {saved ? "Follow-up saved successfully" : "Save Follow-up"}
            </button>
          </div>
        </div>
      )}

      {mode === "meeting-result" && isSalesView && (
        <div className="space-y-4 max-w-sm mx-auto">
          <div className="space-y-2 mt-2">
            <p className="text-sm font-semibold text-slate-400">Meeting Result & Sales Notes</p>
            <textarea
              rows={4}
              placeholder="Write what happened in the meeting and any details relevant to the supervisor..."
              className="input-field text-sm resize-none py-3 w-full"
              value={meetingResult}
              onChange={(e) => setMeetingResult(e.target.value)}
            />
          </div>
          <button
            disabled={busy || saved || !meetingResult.trim()}
            onClick={async () => {
              try {
                if (lead.meetings?.[0]) {
                  await onMeetingUpdate({
                    meetingId: lead.meetings[0].id,
                    status: "DONE",
                    result: meetingResult
                  });
                }
                // Always save to salesNotes too so it's visible on the lead
                await onEditDetails({ salesNotes: meetingResult });
                await onStatus("MEETING_DONE");
                setSaved(true);
                setTimeout(() => {
                  setSaved(false);
                }, 2000);
              } catch (e) {
                // handle error
              }
            }}
            className={`w-full text-sm py-3 mt-4 transition-colors ${saved ? 'bg-emerald-500 text-white rounded-xl shadow-lg font-semibold' : 'btn-primary'}`}
          >
            {saved ? "Report saved successfully" : "Finish Meeting & Save Report"}
          </button>
        </div>
      )}

      {mode === "upload-contract" && isSalesView && (
        <div className="space-y-4 max-w-sm mx-auto">
          <div className="space-y-2 mt-2">
            <p className="text-sm font-semibold text-slate-400">Upload Lead's Contract</p>
            {lead.contractUrl && (
              <div className="flex flex-col gap-2 mb-4 mt-2">
                {lead.contractUrl.split(',').filter(Boolean).map((url, idx) => (
                  <a key={idx} href={url} target="_blank" className="flex items-center justify-center gap-2 bg-accent/10 hover:bg-accent/20 text-accent-soft border border-accent/20 rounded-xl py-2.5 px-4 text-sm font-semibold transition-colors">
                    <FileText size={14} /> View Contract #{idx + 1}
                  </a>
                ))}
              </div>
            )}
            <input
              type="file"
              accept=".pdf,image/*"
              className="input-field text-sm w-full py-2"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  setUploadFile(e.target.files[0]);
                }
              }}
            />
          </div>
          <button
            disabled={busy || saved || uploading || !uploadFile}
            onClick={async () => {
              try {
                setUploading(true);
                const formData = new FormData();
                formData.append("file", uploadFile!);
                const res = await fetch(`/api/leads/${lead.id}/upload`, {
                  method: "POST",
                  body: formData,
                });
                const data = await res.json();
                if (data.success) {
                  await onEditDetails({ contractUrl: data.contractUrl });
                  setSaved(true);
                  setTimeout(() => setSaved(false), 2000);
                }
              } catch (e) {
                // handle error
              } finally {
                setUploading(false);
              }
            }}
            className={`w-full text-sm py-3 mt-4 transition-colors ${saved ? 'bg-emerald-500 text-white rounded-xl shadow-lg font-semibold' : 'btn-primary'}`}
          >
            {uploading ? "Uploading..." : saved ? "Contract uploaded successfully" : "Upload File"}
          </button>
        </div>
      )}

      {mode === "transfer" && allowTransfer && (
        <div className="space-y-6 max-w-md mx-auto">
          <h3 className="text-lg font-bold text-accent-soft mb-4 border-b border-white/5 pb-2">Transfer Lead to Sales</h3>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-400">Transfer to Sales</p>
            <select
              className="input-field text-sm py-3 w-full"
              value={selectedSales}
              onChange={(e) => setSelectedSales(e.target.value)}
            >
              <option value="">Select Sales Rep</option>
              {salesTeam?.map((s) => {
                // If they are in the live online list, show "online", else if they have a very recent static lastActiveAt show "recently active", else nothing
                // Note: <option> can only hold plain text, so this is a text label, not a colored dot.
                let statusLabel = onlineSalesIds.includes(s.id) ? "Online now" : "";
                if (!statusLabel && s.lastActiveAt) {
                  const diff = (Date.now() - new Date(s.lastActiveAt).getTime()) / 1000 / 60;
                  if (diff < 60) statusLabel = "Recently active";
                }

                return (
                  <option key={s.id} value={s.id}>
                    {s.name}{statusLabel ? ` (${statusLabel})` : ""}
                  </option>
                );
              })}
            </select>
          </div>

          <div className="space-y-2 pt-2">
            <p className="text-sm font-semibold text-slate-400">Schedule New Meeting</p>
            <input
              type="datetime-local"
              className="input-field text-sm py-3 w-full"
              value={meetingDate}
              onChange={(e) => setMeetingDate(e.target.value)}
            />
          </div>

          <div className="space-y-1 pt-2">
            <p className="text-xs text-slate-500">Notes for Sales about the lead</p>
            <textarea
              rows={3}
              placeholder="Write what the sales rep needs to know about the lead..."
              className="input-field text-sm resize-none py-3 w-full"
              value={meetingNotes}
              onChange={(e) => setMeetingNotes(e.target.value)}
            />
          </div>

          <div className="space-y-1 pt-2">
            <p className="text-xs text-amber-400 font-semibold flex items-center gap-1.5"><FileText size={14} /> Additional notes about the lead&apos;s interest (saved to the lead&apos;s file)</p>
            <textarea
              rows={3}
              placeholder="Lead's interest level, background info, anything important for Sales to know before the meeting..."
              className="input-field text-sm resize-none py-3 w-full border-amber-500/30 focus:border-amber-500/60"
              value={meetingResultNotes}
              onChange={(e) => setMeetingResultNotes(e.target.value)}
            />
          </div>

          {transferError && (
            <div className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/20 p-3 rounded-xl mt-4">
              {transferError}
            </div>
          )}

          <button
            disabled={busy}
            onClick={async () => {
              setTransferError("");
              if (!selectedSales || !meetingDate || !meetingNotes.trim()) {
                setTransferError("All fields must be filled (sales rep, meeting date, and lead notes) to complete the transfer.");
                return;
              }
              try {
                if (meetingDate) {
                  await onMeeting({
                    scheduledAt: new Date(meetingDate).toISOString(),
                    notes: meetingNotes,
                  });
                }
                if (meetingResultNotes.trim()) {
                  await onEditDetails({ interestReason: meetingResultNotes.trim() });
                }
                if (selectedSales) {
                  await onTransfer(selectedSales);
                }
                
                // Trigger sound and success state
                playNotificationSound();
                setSaved(true);
                setTimeout(() => setSaved(false), 2000);

                setMeetingDate("");
                setMeetingNotes("");
                setMeetingResultNotes("");
                setSelectedSales("");
              } catch(e) {}
            }}
            className={`w-full text-sm py-3 mt-4 transition-colors ${saved ? 'bg-emerald-500 text-white rounded-xl shadow-lg font-semibold' : 'btn-primary'}`}
          >
            {saved ? "Data saved and lead transferred successfully" : "Save Data & Transfer Lead"}
          </button>
        </div>
      )}

      {mode === "details" && (
        <div className="space-y-6">
          <div className="bg-[#182032] border border-white/5 rounded-2xl p-6">
            <h3 className="text-lg font-bold text-accent-soft mb-6 flex items-center gap-2">
              <ClipboardList size={14} /> Activity Log (History)
            </h3>
            
            {lead.activities && lead.activities.length > 0 ? (
              <div className="relative border-r-2 border-white/10 pr-6 space-y-6">
                {lead.activities.map((a) => (
                  <div key={a.id} className="relative">
                    <span className="absolute -right-[31px] top-1.5 w-3.5 h-3.5 rounded-full bg-accent ring-4 ring-[#0f1523]"></span>
                    <div className="bg-[#121826] border border-white/5 rounded-xl p-4 shadow-sm hover:border-white/10 transition-colors">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-2 gap-2">
                        <span className="text-sm font-bold text-accent-soft">{a.user?.name || "System"}</span>
                        <span className="text-xs font-medium text-slate-500 bg-white/5 px-2 py-1 rounded-md" dir="ltr">{formatDateTime(a.createdAt)}</span>
                      </div>
                      <p className="text-sm text-slate-300 leading-relaxed">{a.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-sm text-slate-500">No activity recorded yet</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
