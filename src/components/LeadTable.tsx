"use client";

import { Fragment, useMemo, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import StatusBadge from "@/components/StatusBadge";
import TierBadge from "@/components/TierBadge";
import { playNotificationSound } from "@/lib/audio";

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
  { value: "NEW", label: "جديد" },
  { value: "CONTACTED", label: "تم التواصل" },
  { value: "NO_ANSWER", label: "لم يتم الرد" },
  { value: "NEEDS_FOLLOWUP", label: "يحتاج متابعة" },
  { value: "INTERESTED", label: "مهتم" },
  { value: "NOT_INTERESTED", label: "غير مهتم" },
];

const SALES_STATUS_OPTIONS = [
  { value: "NEW", label: "جديد" },
  { value: "NO_ANSWER", label: "لا يرد" },
  { value: "NOT_AVAILABLE", label: "غير متاح" },
  { value: "NEEDS_FOLLOWUP", label: "يحتاج متابعة" },
  { value: "MEETING_SCHEDULED", label: "تم تأكيد مقابلة" },
  { value: "MEETING_DONE", label: "تمت المقابلة" },
  { value: "INTERESTED", label: "مهتم" },
  { value: "NOT_INTERESTED", label: "غير مهتم" },
  { value: "CLOSED_WON", label: "صفقة ناجحة (Won)" },
  { value: "CLOSED_LOST", label: "صفقة خاسرة (Lost)" },
];
const TIER_OPTIONS = ["WARM", "HOT", "COLD"];
const MEETING_STATUS_OPTIONS = [
  { value: "SCHEDULED", label: "مجدول" },
  { value: "DONE", label: "تم" },
  { value: "POSTPONED", label: "تأجل" },
  { value: "CANCELLED", label: "أُلغي" },
];

function formatDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("ar-EG", {
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
}: {
  leads: LeadRow[];
  showAssignee?: boolean;
  allowTransfer?: boolean;
  canDelete?: boolean;
  salesTeam?: SalesOption[];
  employees?: { id: string; name: string; role: string }[];
  isSalesView?: boolean;
  allowExport?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [openId, setOpenId] = useState<string | null>(null);
  const [modalMode, setModalMode] = useState<"edit" | "details" | "status" | "task" | "transfer" | "meeting-result" | "upload-contract">("details");
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // AI Invite Modal
  const [aiInviteModalOpen, setAiInviteModalOpen] = useState(false);
  const [aiInviteLeadId, setAiInviteLeadId] = useState<string | null>(null);
  const [aiInviteProvider, setAiInviteProvider] = useState<string>("");
  const [aiInviteUrl, setAiInviteUrl] = useState("");
  const [aiInviteLoading, setAiInviteLoading] = useState(false);

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
    setWaMessage(`أهلاً بك يا ${name}، معك فريق كَسرة AI.`);
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
      setWaSendError("تم إرسال الرسالة بنجاح ✓");
    } catch(e:any) {
      setWaSendError(e.message || "خطأ في الإرسال");
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
      if (!res.ok) throw new Error(data.error ?? "حدث خطأ");
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

  async function handleAddLead() {
    if (!newLead.name || !newLead.phone) return showToast("الاسم ورقم الهاتف مطلوبين");
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
    { id: "ALL", label: "الكل", count: counts.ALL, bg: "bg-[#182032] text-slate-300 border border-white/5", badge: "bg-white/10 text-slate-300" },
    { id: "NEW", label: "جديد", count: counts.NEW, bg: "bg-[#182032] text-slate-300 border border-white/5", badge: "bg-blue-500/20 text-blue-400" },
    { id: "NEEDS_FOLLOWUP", label: "متابعة", count: counts.NEEDS_FOLLOWUP, bg: "bg-[#182032] text-slate-300 border border-white/5", badge: "bg-yellow-500/20 text-yellow-500" },
    { id: "CONTACTED", label: "تم التواصل", count: counts.CONTACTED, bg: "bg-[#182032] text-slate-300 border border-white/5", badge: "bg-emerald-500/20 text-emerald-500" },
    { id: "INTERESTED", label: "مهتم", count: counts.INTERESTED, bg: "bg-[#182032] text-slate-300 border border-white/5", badge: "bg-green-500/20 text-green-400" },
    { id: "NOT_INTERESTED", label: "غير مهتم", count: counts.NOT_INTERESTED, bg: "bg-[#182032] text-slate-300 border border-white/5", badge: "bg-red-500/20 text-red-400" },
    { id: "NO_ANSWER", label: "غير متاح", count: counts.NO_ANSWER, bg: "bg-[#182032] text-slate-300 border border-white/5", badge: "bg-rose-500/20 text-rose-500" },
    { id: "TRANSFERRED_TO_SALES", label: "تم التحويل", count: counts.TRANSFERRED_TO_SALES, bg: "bg-[#182032] text-slate-300 border border-white/5", badge: "bg-purple-500/20 text-purple-400" },
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
    const headers = ["الاسم", "رقم الهاتف", "الحالة", "التقييم", "الموظف", "التاريخ", "الشركة", "الاحتياج"];
    const csvData = filtered.map(l => [
      l.name,
      l.phone,
      (isSalesView ? SALES_STATUS_OPTIONS : STATUS_LABELS_FOR_SELECT).find(s => s.value === (isSalesView ? l.salesStatus : l.status))?.label || l.status,
      l.tier,
      l.assignedTo?.name || "غير معين",
      new Date(l.createdAt).toLocaleDateString("ar-EG"),
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
    showToast("تم بدء التصدير بنجاح!", "success");
  };

  const AVATAR_COLORS = [
    "bg-indigo-500", "bg-blue-500", "bg-emerald-500", "bg-orange-400", "bg-pink-500", "bg-yellow-500", "bg-purple-500"
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
          <span className="text-xl">{toast.type === 'error' ? '⚠️' : '✅'}</span>
          <p className="font-semibold">{toast.text}</p>
        </div>
      )}

      {/* Header & Controls */}
      <div className="flex flex-col gap-4 mb-6 mt-4">
        {/* Title & Count */}
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-white">جميع العملاء</h2>
          <span className="bg-[#1f2937] text-slate-300 px-3 py-1 rounded-full text-xs font-bold shadow-inner">{leads.length}</span>
        </div>

        {/* Search & Filters & Add Button */}
        <div className="flex flex-col md:flex-row items-center justify-between w-full gap-4">
          <div className="flex flex-col md:flex-row items-center gap-3 w-full md:w-auto">
            {/* Search Input */}
            <div className="relative w-full md:w-[360px]">
              <input
                type="text"
                placeholder="بحث بالاسم، الهاتف، أو الحالة..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-[#1e293b] border border-slate-700/50 text-slate-200 text-base rounded-xl pl-4 pr-12 py-3.5 outline-none focus:border-indigo-500/50 transition-colors placeholder:text-slate-400 shadow-sm"
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
                    <option value="ALL">كل الموظفين</option>
                    <option value="UNASSIGNED">غير معين (جديد)</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.name} ({emp.role === "TELE_SALES" ? "تيلي" : "سيلز"})</option>
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
                <option value="ALL">الكل (الأحدث أولاً)</option>
                <option value="NEW_LEADS">العملاء الجدد</option>
                <option value="OLD_LEADS">العملاء القدامى (شهر+)</option>
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
                تصدير إكسيل 📥
              </button>
            )}
            {!isSalesView && (
              <button 
                onClick={() => setShowAddModal(true)}
                className="bg-[#3b82f6] hover:bg-blue-600 text-white px-4 py-3.5 rounded-xl text-base font-medium transition-colors flex items-center gap-2 shadow-sm w-full md:w-auto justify-center"
              >
                إضافة عميل جديد
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
          {leads.length === 0 ? "لا يوجد عملاء حاليًا" : "لا يوجد نتائج مطابقة للبحث"}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {filtered.map((lead) => {
            const latestActivity = lead.activities?.[0];
            const isSelected = openId === lead.id;
            const avatarColor = getAvatarColor(lead.id);

            return (
              <div key={lead.id} className="bg-[#121826] rounded-2xl p-5 flex flex-col gap-4 relative border border-white/5 hover:border-white/10 transition-colors shadow-lg group overflow-hidden">
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3 min-w-0 flex-1 overflow-hidden">
                    <div className={`w-12 h-12 shrink-0 rounded-full ${avatarColor} flex items-center justify-center text-white text-xl shadow-inner`}>
                      👤
                    </div>
                    <div className="min-w-0 flex-1 overflow-hidden">
                      <h3 className="font-bold text-white text-[15px] truncate" title={lead.name}>{lead.name}</h3>
                      <p className="text-[11px] text-slate-400 mt-0.5 truncate" title={lead.company || ""}>{lead.company || "—"}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2.5">
                    <div className="relative">
                      <button 
                        onClick={(e) => { e.stopPropagation(); setOpenDropdown(openDropdown === lead.id ? null : lead.id); }}
                        className="text-slate-500 hover:text-white transition-colors p-1"
                        title="الإجراءات"
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
                              <span>✏️</span> {isSalesView ? "تفاصيل وملاحظات السيلز" : "تعديل البيانات"}
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); setOpenId(lead.id); setModalMode("status"); setOpenDropdown(null); }} className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 hover:bg-white/5 hover:text-white transition-colors text-right w-full">
                              <span>⏱️</span> أكشن مع العميل
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); setOpenId(lead.id); setModalMode("task"); setOpenDropdown(null); }} className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 hover:bg-white/5 hover:text-white transition-colors text-right w-full">
                              <span>📅</span> إضافة متابعة مع العميل
                            </button>

                            {isSalesView && (
                              <button onClick={(e) => { e.stopPropagation(); setOpenId(lead.id); setModalMode("meeting-result"); setOpenDropdown(null); }} className="flex items-center gap-3 px-4 py-2.5 text-sm text-emerald-400 hover:bg-emerald-500/20 transition-colors text-right w-full border-t border-white/5 font-semibold">
                                <span>📝</span> تقرير بعد الميتنج
                              </button>
                            )}

                            {isSalesView && (
                              <button onClick={(e) => { e.stopPropagation(); setOpenId(lead.id); setModalMode("upload-contract"); setOpenDropdown(null); }} className="flex items-center gap-3 px-4 py-2.5 text-sm text-blue-400 hover:bg-blue-500/20 transition-colors text-right w-full border-t border-white/5 font-semibold">
                                <span>📄</span> رفع عقد العميل
                              </button>
                            )}

                            {allowTransfer && (
                              <button onClick={(e) => { e.stopPropagation(); setOpenId(lead.id); setModalMode("transfer"); setOpenDropdown(null); }} className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 hover:bg-indigo-500/20 hover:text-indigo-400 transition-colors text-right w-full">
                                <span>👥</span> تحويل إلى موظف سيلز
                              </button>
                            )}
                            {canDelete && (
                              <button onClick={(e) => { 
                                e.stopPropagation();
                                if (confirm(`متأكد إنك عاوز تحذف العميل نهائيًا؟`)) {
                                  call(`/api/leads/${lead.id}`, "DELETE").catch(() => {});
                                }
                                setOpenDropdown(null);
                              }} className="flex items-center gap-3 px-4 py-2.5 text-sm text-status-hot hover:bg-rose-500/10 transition-colors text-right w-full border-t border-white/5 mt-1 pt-2.5">
                                <span>🗑️</span> حذف العميل
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
                          مع: {lead.assignedTo.name}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Details */}
                <div className="space-y-3 mt-1 flex-1">
                  <div className="flex items-center gap-3 text-xs text-slate-300">
                    <span className="text-slate-500 text-sm">📞</span>
                    <span dir="ltr" className="text-slate-300 font-medium tracking-wide">{lead.phone}</span>
                  </div>
                  {(lead.storeUrl || lead.socialMediaUrl) && (
                    <div className="flex items-start gap-3 text-xs text-slate-300 overflow-hidden">
                      <span className="text-slate-500 text-sm mt-0.5">🔗</span>
                      <div className="flex flex-col min-w-0 flex-1 gap-1.5">
                        {lead.storeUrl && lead.storeUrl.split(',').filter(Boolean).map((url, idx) => (
                          <a key={idx} href={url} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300 transition-colors truncate w-full block" dir="ltr" title={`المتجر ${idx + 1}`}>
                            {url}
                          </a>
                        ))}
                        {lead.socialMediaUrl && lead.socialMediaUrl.split(',').filter(Boolean).map((url, idx) => (
                          <a key={idx} href={url} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300 transition-colors truncate w-full block" dir="ltr" title={`سوشيال ميديا ${idx + 1}`}>
                            {url}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex items-start gap-3 text-xs text-slate-300">
                    <span className="text-slate-500 text-sm mt-0.5">🗓️</span>
                    <span className="text-slate-400 truncate w-full block mt-0.5">
                      {latestActivity ? `آخر تواصل: ${formatDateTime(latestActivity.createdAt)}` : "لم يتم التواصل بعد"}
                    </span>
                  </div>
                  {/* Show Meeting Date and Notes if any meeting exists */}
                  {lead.meetings?.[0] && (
                    lead.meetings[0].status === "DONE" ? (
                      <div className="mt-4 bg-emerald-500/10 border border-emerald-500/20 p-3 rounded-xl space-y-3">
                        <div>
                          <p className="text-xs text-emerald-400 font-bold mb-2">✅ نتيجة المقابلة: {formatDateTime(lead.meetings[0].scheduledAt)}</p>
                          {lead.meetings[0].result && <p className="text-[11px] text-slate-300 leading-relaxed bg-[#0b101a] p-2.5 rounded-lg border border-white/5">{lead.meetings[0].result}</p>}
                        </div>

                        {(lead.meetings[0].recordingUrl || lead.meetings[0].aiAnalysis || lead.meetings[0].transcript) && (
                          <div className="border-t border-emerald-500/20 pt-3 space-y-3">
                            <h4 className="text-xs font-bold text-emerald-300 flex items-center gap-1"><span>🤖</span> تسجيل وتحليل الذكاء الاصطناعي</h4>
                            
                            {lead.meetings[0].recordingUrl && (
                              <a href={lead.meetings[0].recordingUrl} target="_blank" className="flex items-center justify-center gap-2 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 py-2 rounded-lg text-[11px] font-bold transition-colors">
                                <span>▶️</span> مشاهدة تسجيل الميتنج
                              </a>
                            )}
                            
                            {lead.meetings[0].aiAnalysis && (
                              <div>
                                <p className="text-[10px] text-slate-400 mb-1">الملخص والتحليل:</p>
                                <div className="text-[11px] text-slate-300 leading-relaxed bg-[#0b101a] p-2.5 rounded-lg border border-white/5 whitespace-pre-wrap max-h-32 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10">
                                  {lead.meetings[0].aiAnalysis}
                                </div>
                              </div>
                            )}

                            {lead.meetings[0].transcript && (
                              <div>
                                <p className="text-[10px] text-slate-400 mb-1">السكريبت بالكامل:</p>
                                <div className="text-[11px] text-slate-300 leading-relaxed bg-[#0b101a] p-2.5 rounded-lg border border-white/5 whitespace-pre-wrap max-h-32 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10">
                                  {lead.meetings[0].transcript}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="mt-4 bg-purple-500/10 border border-purple-500/20 p-3 rounded-xl">
                        <p className="text-xs text-purple-400 font-bold mb-2">📅 ميعاد المقابلة: {formatDateTime(lead.meetings[0].scheduledAt)}</p>
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
                      لا يوجد ملاحظات أو احتياجات
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
                    التفاصيل
                  </button>
                  <button 
                    onClick={(e) => {
                      e.preventDefault();
                      setAiInviteProvider("جوجل ميت (Google Meet)");
                      setAiInviteLeadId(lead.id);
                      setAiInviteUrl("");
                      setAiInviteModalOpen(true);
                      window.open("https://meet.google.com/new", "_blank");
                    }}
                    className="bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 rounded-xl w-10 flex items-center justify-center transition-colors"
                    title="ميتنج جوجل"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>
                  </button>
                  <button 
                    onClick={(e) => {
                      e.preventDefault();
                      setAiInviteProvider("زوم (Zoom)");
                      setAiInviteLeadId(lead.id);
                      setAiInviteUrl("");
                      setAiInviteModalOpen(true);
                      window.open("https://zoom.us/meeting/schedule", "_blank");
                    }}
                    className="bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 text-blue-400 rounded-xl w-10 flex items-center justify-center transition-colors"
                    title="ميتنج زوم"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M16 10.655V8.5A1.5 1.5 0 0 0 14.5 7h-11A1.5 1.5 0 0 0 2 8.5v8A1.5 1.5 0 0 0 3.5 18h11a1.5 1.5 0 0 0 1.5-1.5v-2.155l4.636 3.161A.5.5 0 0 0 22 17.094V7.906a.5.5 0 0 0-.78-.415L16 10.655z"/></svg>
                  </button>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      const jitsiUrl = `https://meet.jit.si/Telesales_${lead.phone}_${Math.floor(Date.now() / 1000)}`;
                      localStorage.setItem(`jitsi_${lead.id}`, jitsiUrl);
                      call(`/api/leads/${lead.id}/invite-ai`, "POST", {
                        meetingUrl: jitsiUrl
                      }).then(() => {
                        setTimeout(() => window.location.reload(), 1000); // Reload to show AI data
                      }).catch(() => {});
                      window.open(jitsiUrl, "_blank");
                    }}
                    className="bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 text-indigo-400 rounded-xl w-10 flex items-center justify-center transition-colors"
                    title="Jitsi (ميتنج أوتوماتيك)"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15.6 11.6L22 7v10l-6.4-4.5v-1z"/><circle cx="8" cy="12" r="5"/></svg>
                  </button>
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
                <span className="text-green-400">💬</span> واتساب — {waTargetName}
              </h3>
              <button onClick={() => setWaModalOpen(false)} className="text-slate-400 hover:text-white transition-colors">✕</button>
            </div>

            <div className="p-6">
              {/* Disconnected — show connect button */}
              {waStatus === "DISCONNECTED" && (
                <div className="text-center py-6">
                  <p className="text-slate-300 mb-4">الواتساب غير مرتبط. اضغط لتوليد رمز QR.</p>
                  <button
                    onClick={() => fetch("/api/whatsapp/status", { method: "POST" })}
                    className="bg-green-600 hover:bg-green-500 text-white font-bold py-3 px-8 rounded-xl transition-colors"
                  >
                    توليد رمز QR للربط
                  </button>
                </div>
              )}

              {/* Initializing */}
              {waStatus === "INITIALIZING" && (
                <div className="text-center py-8">
                  <div className="w-12 h-12 border-4 border-green-500/20 border-t-green-500 rounded-full animate-spin mx-auto mb-4"></div>
                  <p className="text-green-400 font-bold">جاري تجهيز رمز QR... يرجى الانتظار</p>
                  <p className="text-sm text-slate-400 mt-2">قد تستغرق بضع ثواني</p>
                </div>
              )}

              {/* QR Ready */}
              {waStatus === "QR_READY" && waQr && (
                <div className="text-center">
                  <p className="text-white font-bold mb-4">📱 امسح هذا الرمز من موبايلك</p>
                  <div className="bg-white p-3 rounded-2xl inline-block mb-4 shadow-xl">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={waQr} alt="WhatsApp QR" width={220} height={220} />
                  </div>
                  <div className="text-right text-sm text-slate-300 space-y-2 bg-white/5 p-3 rounded-xl border border-white/10">
                    <p>1️⃣ افتح <strong>واتساب</strong> على هاتفك</p>
                    <p>2️⃣ ادخل <strong>الإعدادات</strong> → <strong>الأجهزة المرتبطة</strong></p>
                    <p>3️⃣ اضغط <strong>ربط جهاز</strong> وامسح الرمز</p>
                  </div>
                </div>
              )}

              {/* Connected — show message box */}
              {waStatus === "CONNECTED" && (
                <div>
                  <div className="flex items-center gap-2 mb-4 text-green-400 font-bold">
                    <span>✅</span> متصل — إرسال رسالة إلى {waTargetName}
                  </div>
                  <textarea
                    className="w-full h-28 bg-[#0e1320] border border-white/10 rounded-xl p-3 text-white text-sm focus:outline-none focus:border-green-500 resize-none mb-3"
                    value={waMessage}
                    onChange={(e) => setWaMessage(e.target.value)}
                    placeholder="اكتب رسالتك..."
                  />
                  {waSendError && <p className="text-red-400 text-xs mb-3">{waSendError}</p>}
                  <button
                    onClick={handleSendWaMessage}
                    disabled={waSending || !waMessage.trim()}
                    className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-3 rounded-xl disabled:opacity-50 transition-colors"
                  >
                    {waSending ? "جاري الإرسال..." : "إرسال الرسالة 🚀"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* AI Invite Modal */}
      {aiInviteModalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
          <div className="bg-[#0f1523] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col overflow-hidden">
            <div className="p-5 border-b border-white/10 flex justify-between items-center bg-indigo-900/20">
              <h3 className="text-white font-bold text-lg flex items-center gap-2">
                <span className="text-indigo-400">🤖</span> دعوة البوت لـ {aiInviteProvider}
              </h3>
              <button onClick={() => setAiInviteModalOpen(false)} className="text-slate-400 hover:text-white transition-colors">✕</button>
            </div>
            <div className="p-6">
              <p className="text-slate-300 text-sm mb-4 leading-relaxed">
                تم فتح صفحة {aiInviteProvider} في نافذة جديدة. 
                بعد إنشاء الاجتماع هناك، يرجى نسخ الرابط ولصقه هنا لدعوة البوت لتسجيل المكالمة:
              </p>
              <input
                type="text"
                dir="ltr"
                className="w-full bg-[#0e1320] border border-white/10 rounded-xl p-3 text-white text-sm focus:outline-none focus:border-indigo-500 mb-4"
                placeholder="https://meet.google.com/xxx-xxxx-xxx"
                value={aiInviteUrl}
                onChange={(e) => setAiInviteUrl(e.target.value)}
              />
              <button
                onClick={async () => {
                  if (!aiInviteUrl.trim() || !aiInviteLeadId) return;
                  setAiInviteLoading(true);
                  try {
                    await fetch(`/api/leads/${aiInviteLeadId}/invite-ai`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ meetingUrl: aiInviteUrl })
                    });
                    setAiInviteModalOpen(false);
                    setTimeout(() => window.location.reload(), 1000);
                  } catch (e) {
                    setAiInviteLoading(false);
                  }
                }}
                disabled={aiInviteLoading || !aiInviteUrl.trim()}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl disabled:opacity-50 transition-colors"
              >
                {aiInviteLoading ? "جاري دعوة البوت..." : "دعوة البوت الآن 🚀"}
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
            <button onClick={() => { setOpenId(null); if(searchParams.get("leadId")) router.replace(window.location.pathname, {scroll: false}); }} className="absolute top-5 left-5 w-8 h-8 flex items-center justify-center rounded-full bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 transition-colors">✕</button>
            <h2 className="text-xl font-bold text-white mb-6 border-b border-white/5 pb-4">
              {modalMode === "edit" ? "بيانات العميل" :
               modalMode === "status" ? "أكشن مع العميل" :
               modalMode === "task" ? "إضافة متابعة مع العميل" :
               modalMode === "transfer" ? "تحويل العميل إلى موظف Sales" :
               modalMode === "meeting-result" ? "تقرير المقابلة" :
               "تفاصيل العميل"}: {leads.find(l => l.id === openId)?.name}
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
                if (confirm(`متأكد إنك عاوز تحذف العميل نهائيًا؟`)) {
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
            <button onClick={() => setShowAddModal(false)} className="absolute top-5 left-5 w-8 h-8 flex items-center justify-center rounded-full bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 transition-colors">✕</button>
            <h3 className="text-lg font-bold text-white mb-6 border-b border-white/5 pb-4">إضافة عميل جديد يدويًا</h3>
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-slate-300 mb-1">اسم العميل *</p>
                <input
                  className="w-full bg-[#1e293b] border border-slate-700/50 text-slate-200 text-sm rounded-xl px-4 py-3 outline-none focus:border-indigo-500/50 transition-colors placeholder:text-slate-500"
                  placeholder="الاسم"
                  value={newLead.name}
                  onChange={(e) => setNewLead({ ...newLead, name: e.target.value })}
                />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-300 mb-1">رقم الهاتف *</p>
                <input
                  className="w-full bg-[#1e293b] border border-slate-700/50 text-slate-200 text-sm rounded-xl px-4 py-3 outline-none focus:border-indigo-500/50 transition-colors placeholder:text-slate-500"
                  placeholder="رقم الهاتف"
                  value={newLead.phone}
                  onChange={(e) => setNewLead({ ...newLead, phone: e.target.value })}
                />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-300 mb-1">الشركة (اختياري)</p>
                <input
                  className="w-full bg-[#1e293b] border border-slate-700/50 text-slate-200 text-sm rounded-xl px-4 py-3 outline-none focus:border-indigo-500/50 transition-colors placeholder:text-slate-500"
                  placeholder="الشركة"
                  value={newLead.company}
                  onChange={(e) => setNewLead({ ...newLead, company: e.target.value })}
                />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-300 mb-1">الاحتياج (اختياري)</p>
                <input
                  className="w-full bg-[#1e293b] border border-slate-700/50 text-slate-200 text-sm rounded-xl px-4 py-3 outline-none focus:border-indigo-500/50 transition-colors placeholder:text-slate-500"
                  placeholder="الاحتياج"
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
                إلغاء
              </button>
              <button
                onClick={handleAddLead}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl text-sm font-medium transition-colors"
                disabled={busy || !newLead.name || !newLead.phone}
              >
                {busy ? "جاري الإضافة..." : "إضافة العميل"}
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
        
      // Auto-fill Jitsi link if it exists
      const savedJitsi = localStorage.getItem(`jitsi_${lead.id}`);
      if (savedJitsi && !meetingNotes.includes(savedJitsi)) {
        setMeetingNotes(prev => prev ? `${prev}\n\nرابط الميتنج الفوري: ${savedJitsi}` : `رابط الميتنج الفوري: ${savedJitsi}`);
      }
    }
  }, [mode, allowTransfer, lead.id]); // only re-run when mode changes

  return (
    <div className="space-y-6">
      {mode === "edit" && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <p className="mb-1 text-xs text-slate-500">الاسم</p>
            <input
              className="input-field text-sm w-full py-3"
              placeholder="الاسم"
              value={edit.name}
              onChange={(e) => setEdit({ ...edit, name: e.target.value })}
            />
          </div>
          <div>
            <p className="mb-1 text-xs text-slate-500">الهاتف</p>
            <input
              className="input-field text-sm w-full py-3"
              placeholder="الهاتف"
              dir="ltr"
              value={edit.phone}
              onChange={(e) => setEdit({ ...edit, phone: e.target.value })}
            />
          </div>
          <div>
            <p className="mb-1 text-xs text-slate-500">الإيميل</p>
            <input
              className="input-field text-sm w-full py-3"
              placeholder="الإيميل"
              dir="ltr"
              value={edit.email}
              onChange={(e) => setEdit({ ...edit, email: e.target.value })}
            />
          </div>
          <div>
            <p className="mb-1 text-xs text-slate-500">الشركة</p>
            <input
              className="input-field text-sm w-full py-3"
              placeholder="الشركة"
              value={edit.company}
              onChange={(e) => setEdit({ ...edit, company: e.target.value })}
            />
          </div>
          <div>
            <p className="mb-1 text-xs text-slate-500">الاحتياج</p>
            <input
              className="input-field text-sm w-full py-3"
              placeholder="الاحتياج"
              value={edit.need}
              onChange={(e) => setEdit({ ...edit, need: e.target.value })}
            />
          </div>
          <div>
            <p className="mb-1 text-xs text-slate-500">حالة العميل</p>
            <select
              className="input-field text-sm w-full py-3"
              value={edit.tier}
              onChange={(e) => setEdit({ ...edit, tier: e.target.value })}
            >
              {TIER_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s === "HOT" ? "Hot 🔥" : s === "WARM" ? "Warm" : s === "COLD" ? "Cold ❄️" : "عادي"}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-3">
            <p className="mb-1 text-xs text-slate-500">ملاحظات التيلي سيلز</p>
            <textarea
              className="input-field text-sm w-full py-3 opacity-80 cursor-not-allowed"
              placeholder="لا يوجد"
              rows={2}
              value={edit.notes}
              disabled
            />
          </div>
          {isSalesView && (
            <div className="sm:col-span-3">
              <p className="mb-1 text-xs text-purple-400 font-bold">ملاحظات السيلز (خاصة بك)</p>
              <textarea
                className="input-field text-sm w-full py-3 border-purple-500/30 focus:border-purple-500"
                placeholder="اكتب ملاحظاتك وتقييمك للمقابلة هنا..."
                rows={4}
                value={edit.salesNotes}
                onChange={(e) => setEdit({ ...edit, salesNotes: e.target.value })}
              />
            </div>
          )}
          <div className="sm:col-span-3">
            <p className="mb-1 text-xs text-slate-500">لينك المتجر / الموقع</p>
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
                      فتح ↗
                    </a>
                  )}
                  {storeUrls.length > 1 && (
                    <button
                      onClick={() => setStoreUrls(storeUrls.filter((_, i) => i !== idx))}
                      className="btn-ghost px-4 py-3 text-sm text-status-hot"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={() => setStoreUrls([...storeUrls, ""])}
              className="mt-3 text-sm font-semibold text-accent-soft hover:text-accent transition-colors"
            >
              + إضافة رابط آخر
            </button>
          </div>
          <div className="sm:col-span-3">
            <p className="mb-1 text-xs text-slate-500">روابط حسابات السوشيال ميديا</p>
            <div className="space-y-3">
              {socialMediaUrls.map((url, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    className="input-field text-sm flex-1 py-3"
                    placeholder="أدخل الرابط هنا..."
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
                      فتح ↗
                    </a>
                  )}
                  {socialMediaUrls.length > 1 && (
                    <button
                      onClick={() => setSocialMediaUrls(socialMediaUrls.filter((_, i) => i !== idx))}
                      className="btn-ghost px-4 py-3 text-sm text-status-hot"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={() => setSocialMediaUrls([...socialMediaUrls, ""])}
              className="mt-3 text-sm font-semibold text-accent-soft hover:text-accent transition-colors"
            >
              + إضافة رابط آخر
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
              {saved ? "تم الحفظ بنجاح ✓" : "حفظ التعديلات"}
            </button>
            {canDelete && (
              <button disabled={busy} onClick={onDelete} className="btn-ghost text-sm py-3 px-6 text-status-hot">
                حذف العميل نهائيًا
              </button>
            )}
          </div>
        </div>
      )}

      {mode === "status" && (
        <div className="space-y-4 max-w-sm mx-auto">
          <p className="text-sm font-semibold text-slate-400 mb-2">أكشن مع العميل</p>
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
            <p className="text-sm font-semibold text-slate-400">تحديث الحالة</p>
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
            <h3 className="text-lg font-bold text-accent-soft mb-4">إضافة متابعة</h3>
            <input
              type="datetime-local"
              className="input-field text-sm py-3 w-full"
              value={followUpDate}
              onChange={(e) => setFollowUpDate(e.target.value)}
            />
            <div className="space-y-1 mt-2">
              <p className="text-xs text-slate-500">ملاحظات المتابعة</p>
              <textarea
                rows={3}
                placeholder="اكتب ملاحظات المتابعة هنا..."
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
              {saved ? "تم حفظ المتابعة بنجاح ✓" : "حفظ المتابعة"}
            </button>
          </div>
        </div>
      )}

      {mode === "meeting-result" && isSalesView && (
        <div className="space-y-4 max-w-sm mx-auto">
          <div className="space-y-2 mt-2">
            <p className="text-sm font-semibold text-slate-400">نتيجة المقابلة وملاحظات السيلز</p>
            <textarea
              rows={4}
              placeholder="اكتب ماذا حدث في المقابلة وأي تفاصيل تهم المشرف..."
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
            {saved ? "تم حفظ التقرير بنجاح ✓" : "إنهاء المقابلة وحفظ التقرير"}
          </button>
        </div>
      )}

      {mode === "upload-contract" && isSalesView && (
        <div className="space-y-4 max-w-sm mx-auto">
          <div className="space-y-2 mt-2">
            <p className="text-sm font-semibold text-slate-400">رفع العقد الخاص بالعميل</p>
            {lead.contractUrl && (
              <div className="flex flex-col gap-2 mb-4 mt-2">
                {lead.contractUrl.split(',').filter(Boolean).map((url, idx) => (
                  <a key={idx} href={url} target="_blank" className="flex items-center justify-center gap-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 rounded-xl py-2.5 px-4 text-sm font-semibold transition-colors">
                    <span>📄</span> عرض العقد رقم {idx + 1}
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
            {uploading ? "جاري الرفع..." : saved ? "تم رفع العقد بنجاح ✓" : "رفع الملف"}
          </button>
        </div>
      )}

      {mode === "transfer" && allowTransfer && (
        <div className="space-y-6 max-w-md mx-auto">
          <h3 className="text-lg font-bold text-indigo-400 mb-4 border-b border-white/5 pb-2">تحويل العميل إلى موظف Sales</h3>
          
          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-400">تحويل إلى Sales</p>
            <select
              className="input-field text-sm py-3 w-full"
              value={selectedSales}
              onChange={(e) => setSelectedSales(e.target.value)}
            >
              <option value="">اختر موظف Sales</option>
              {salesTeam?.map((s) => {
                // If they are in the live online list, show green, else if they have a very recent static lastActiveAt show yellow, else grey
                let dot = onlineSalesIds.includes(s.id) ? "🟢" : "⚫";
                if (dot === "⚫" && s.lastActiveAt) {
                  const diff = (Date.now() - new Date(s.lastActiveAt).getTime()) / 1000 / 60;
                  if (diff < 60) dot = "🟡";
                }

                return (
                  <option key={s.id} value={s.id}>
                    {dot} {s.name}
                  </option>
                );
              })}
            </select>
          </div>

          <div className="space-y-2 pt-2">
            <p className="text-sm font-semibold text-slate-400">تحديد Meeting جديد</p>
            <input
              type="datetime-local"
              className="input-field text-sm py-3 w-full"
              value={meetingDate}
              onChange={(e) => setMeetingDate(e.target.value)}
            />
          </div>

          <div className="space-y-1 pt-2">
            <p className="text-xs text-slate-500">ملاحظات للـ Sales عن العميل</p>
            <textarea
              rows={3}
              placeholder="اكتب ما يحتاج موظف Sales يعرفه عن العميل..."
              className="input-field text-sm resize-none py-3 w-full"
              value={meetingNotes}
              onChange={(e) => setMeetingNotes(e.target.value)}
            />
          </div>

          <div className="space-y-1 pt-2">
            <p className="text-xs text-amber-400 font-semibold">📝 ملاحظات ما حصل بعد الميتنج (تُحفظ في ملف العميل)</p>
            <textarea
              rows={3}
              placeholder="نتيجة المقابلة، ردود فعل العميل، أي معلومة مهمة للـ Sales..."
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
                setTransferError("يجب ملء جميع البيانات (موظف السيلز، موعد المقابلة، وملاحظات العميل) لإتمام التحويل.");
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
            {saved ? "تم إدخال البيانات وتحويل العميل بنجاح ✓" : "حفظ البيانات وتحويل العميل"}
          </button>
        </div>
      )}

      {mode === "details" && (
        <div className="space-y-6">
          <div className="bg-[#182032] border border-white/5 rounded-2xl p-6">
            <h3 className="text-lg font-bold text-accent-soft mb-6 flex items-center gap-2">
              <span>📋</span> سجل الأنشطة (History)
            </h3>
            
            {lead.activities && lead.activities.length > 0 ? (
              <div className="relative border-r-2 border-white/10 pr-6 space-y-6">
                {lead.activities.map((a) => (
                  <div key={a.id} className="relative">
                    <span className="absolute -right-[31px] top-1.5 w-3.5 h-3.5 rounded-full bg-indigo-500 ring-4 ring-[#0f1523]"></span>
                    <div className="bg-[#121826] border border-white/5 rounded-xl p-4 shadow-sm hover:border-white/10 transition-colors">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-2 gap-2">
                        <span className="text-sm font-bold text-indigo-400">{a.user?.name || "النظام"}</span>
                        <span className="text-xs font-medium text-slate-500 bg-white/5 px-2 py-1 rounded-md" dir="ltr">{formatDateTime(a.createdAt)}</span>
                      </div>
                      <p className="text-sm text-slate-300 leading-relaxed">{a.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-sm text-slate-500">لا يوجد سجل أنشطة حتى الآن</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
