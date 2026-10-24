"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import StatusBadge from "@/components/StatusBadge";
import TierBadge from "@/components/TierBadge";
import LeadTable from "@/components/LeadTable";

type Employee = { id: string; name: string; role: string; lastActiveAt?: Date | null };
type Lead = {
  id: string;
  name: string;
  phone: string;
  company?: string | null;
  need?: string | null;
  status: string;
  tier: string;
  assignedTo?: Employee | null;
  createdAt: string;
};

export default function AdminCustomersClient({
  initialLeads,
  employees,
  salesTeam,
  canDelete,
}: {
  initialLeads: Lead[];
  employees: Employee[];
  salesTeam: Employee[];
  canDelete: boolean;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"table" | "cards">("table");
  const [leads, setLeads] = useState<Lead[]>(initialLeads);
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
  const [assignTarget, setAssignTarget] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    setLeads(initialLeads);
  }, [initialLeads]);
  
  // Custom Modal State
  const [modal, setModal] = useState<{ isOpen: boolean; title: string; message: string; type: "alert" | "confirm"; onConfirm?: () => void }>({ isOpen: false, title: "", message: "", type: "alert" });
  
  const showAlert = (title: string, message: string) => setModal({ isOpen: true, title, message, type: "alert" });
  const showConfirm = (title: string, message: string, onConfirm: () => void) => setModal({ isOpen: true, title, message, type: "confirm", onConfirm });

  const [search, setSearch] = useState("");
  const [filterEmployee, setFilterEmployee] = useState("ALL");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Upload Preview State
  const [previewData, setPreviewData] = useState<{
    fileName: string;
    rawJson: any[];
    allKeys: string[];
    nameKey: string;
    phoneKey: string;
    companyKey: string;
    needKey: string;
    mappedLeads: { name: string; phone: string; company: string; need: string }[];
  } | null>(null);
  const [previewNameKey, setPreviewNameKey] = useState("");
  const [previewPhoneKey, setPreviewPhoneKey] = useState("");
  const [previewCompanyKey, setPreviewCompanyKey] = useState("");
  const [previewNeedKey, setPreviewNeedKey] = useState("");
  const [previewStoreUrlKey, setPreviewStoreUrlKey] = useState("");
  const [previewSocialKey, setPreviewSocialKey] = useState("");
  const [previewEmailKey, setPreviewEmailKey] = useState("");
  const [previewTier, setPreviewTier] = useState("WARM");

  // Parse Excel -> Show Preview
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = evt.target?.result;
        const workbook = XLSX.read(data, { type: "binary" });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        
        const rawJson: any[] = XLSX.utils.sheet_to_json(sheet);
        if (rawJson.length === 0) {
          showAlert("خطأ", "الملف فارغ أو لا يحتوي على بيانات.");
          setIsUploading(false);
          return;
        }

        const sampleRow = rawJson[0];
        const keys = Object.keys(sampleRow);
        
        const findKey = (keywords: string[]) => keys.find(k => 
          keywords.some(kw => k.toLowerCase().includes(kw.toLowerCase()))
        );

        let nameKey = findKey(["اسم", "name", "عميل", "client"]) || "";
        let phoneKey = findKey(["هاتف", "تليفون", "phone", "موبايل", "mobile", "رقم الجوال", "جوال"]) || "";
        let companyKey = findKey(["شرك", "company", "مؤسس"]) || "";
        let needKey = findKey(["حتاج", "ملاحظ", "need", "note", "تفاصيل"]) || "";
        let storeUrlKey = findKey(["متجر", "store", "موقع", "website", "link", "رابط"]) || "";
        let socialKey = findKey(["سوشيال", "social", "انستا", "insta", "twitter", "تويتر", "facebook", "تيك توك", "tiktok"]) || "";
        let emailKey = findKey(["email", "ايميل", "بريد"]) || "";

        // Smarter Saudi phone detection: must be 9 digits starting with 5,
        // OR 10 digits starting with 05, OR 12 digits starting with 966
        if (!phoneKey) {
          phoneKey = keys.find(k => {
            const val = String(sampleRow[k] || "").trim().replace(/\D/g, "");
            return (
              (val.startsWith("5") && val.length === 9) ||
              (val.startsWith("05") && val.length === 10) ||
              (val.startsWith("966") && val.length === 12)
            );
          }) || "";
        }

        if (!nameKey) {
          nameKey = keys.find(k => 
            k !== phoneKey && k !== companyKey && k !== needKey && isNaN(Number(sampleRow[k])) && String(sampleRow[k] || "").length > 2
          ) || "";
        }

        // Build preview
        setPreviewData({ fileName: file.name, rawJson, allKeys: keys, nameKey, phoneKey, companyKey, needKey, mappedLeads: [] });
        setPreviewNameKey(nameKey);
        setPreviewPhoneKey(phoneKey);
        setPreviewCompanyKey(companyKey);
        setPreviewNeedKey(needKey);
        setPreviewStoreUrlKey(storeUrlKey);
        setPreviewSocialKey(socialKey);
        setPreviewEmailKey(emailKey);

      } catch (error: any) {
        showAlert("خطأ", "حدث خطأ أثناء قراءة الملف: " + error.message);
      } finally {
        setIsUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };
    reader.readAsBinaryString(file);
  };

  // Format phone as Saudi
  const formatSaudiPhone = (raw: string) => {
    let v = raw.replace(/\D/g, "");
    if (v.startsWith("05")) return "966" + v.substring(1);
    if (v.startsWith("5") && v.length === 9) return "966" + v;
    if (v.startsWith("966")) return v;
    if (v.startsWith("0")) return "966" + v.substring(1);
    return "966" + v;
  };

  // Actually upload after user confirms preview
  const handleConfirmUpload = async () => {
    if (!previewData) return;
    const { rawJson, fileName } = previewData;

    const mappedLeads = rawJson.map(row => {
      const phoneVal = previewPhoneKey ? formatSaudiPhone(String(row[previewPhoneKey] || "").trim()) : "";
      return {
        name: previewNameKey ? String(row[previewNameKey] || "").trim() : "",
        phone: phoneVal,
        company: previewCompanyKey ? String(row[previewCompanyKey] || "").trim() : "",
        need: previewNeedKey ? String(row[previewNeedKey] || "").trim() : "",
        storeUrl: previewStoreUrlKey ? String(row[previewStoreUrlKey] || "").trim() : "",
        socialMediaUrl: previewSocialKey ? String(row[previewSocialKey] || "").trim() : "",
        email: previewEmailKey ? String(row[previewEmailKey] || "").trim() : "",
      };
    }).filter(l => l.name && l.phone && l.phone.length >= 11);

    if (mappedLeads.length === 0) {
      showAlert("خطأ في البيانات", "لم يتم العثور على بيانات صالحة. تأكد من اختيار الأعمدة الصحيحة.");
      return;
    }

    setIsUploading(true);
    try {
      const res = await fetch("/api/admin/leads/bulk-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leads: mappedLeads, fileName, tier: previewTier }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "خطأ غير معروف");
      
      setPreviewData(null);

      if (data.status === "PENDING") {
        // ملف كبير — بيتوزع في الخلفية، مش فورًا
        showAlert(
          "جارٍ الرفع والتوزيع",
          `${data.message || "الملف كبير، جارٍ توزيعه في الخلفية."}\nعدد العملاء في الملف: ${data.totalLeads}.`
        );
      } else if (data.duplicates && data.duplicates.length > 0) {
        const dupSample = data.duplicates.slice(0, 3).join("، ");
        const moreCount = data.duplicates.length > 3 ? ` و ${data.duplicates.length - 3} آخرين` : "";
        showAlert(
          "تم بنجاح مع وجود مكررين",
          `تم رفع وتوزيع ${data.count} عميل جديد تلقائيًا على موظفي Tele-Sales.\nتم استبعاد ${data.duplicates.length} رقم لأنه مسجل مسبقاً في النظام (مثل: ${dupSample}${moreCount}).`
        );
      } else {
        showAlert("تم بنجاح", `تم رفع وتوزيع ${data.count} عميل تلقائيًا على موظفي Tele-Sales!`);
      }

      router.refresh();
    } catch (error: any) {
      showAlert("خطأ", "حدث خطأ أثناء الرفع: " + error.message);
    } finally {
      setIsUploading(false);
    }
  };


  // Bulk Assign
  const handleBulkAssign = async () => {
    if (selectedLeads.size === 0) return showAlert("تنبيه", "يرجى تحديد العملاء أولاً.");
    if (!assignTarget) return showAlert("تنبيه", "يرجى اختيار الموظف.");

    setIsAssigning(true);
    try {
      const res = await fetch("/api/admin/leads/bulk-assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadIds: Array.from(selectedLeads),
          employeeId: assignTarget,
        }),
      });

      if (!res.ok) throw new Error(await res.text());
      
      if (assignTarget === "AUTO") {
        showAlert("تم بنجاح", `تم توزيع ${selectedLeads.size} عميل بالتساوي على موظفين التيلي سيلز بنجاح!`);
        // For auto, we wait for router.refresh since we don't know exactly who got what, but we can clear them from UNASSIGNED
      } else {
        showAlert("تم بنجاح", `تم تحويل ${selectedLeads.size} عميل للموظف بنجاح!`);
        // Optimistic update
        const emp = employees.find(e => e.id === assignTarget);
        if (emp) {
          setLeads(prev => prev.map(l => selectedLeads.has(l.id) ? { ...l, assignedTo: emp, status: emp.role === "SALES" ? "TRANSFERRED_TO_SALES" : l.status } : l));
        }
      }
      setSelectedLeads(new Set());
      setAssignTarget("");
      router.refresh();
    } catch (error: any) {
      showAlert("خطأ", "حدث خطأ أثناء التحويل: " + error.message);
    } finally {
      setIsAssigning(false);
    }
  };

  // Bulk Delete
  const handleBulkDelete = () => {
    if (selectedLeads.size === 0) return showAlert("تنبيه", "يرجى تحديد العملاء أولاً.");
    
    showConfirm("تأكيد الحذف", `هل أنت متأكد من حذف ${selectedLeads.size} عميل بشكل نهائي؟`, async () => {
      setIsDeleting(true);
      try {
        const res = await fetch("/api/admin/leads/bulk-delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ leadIds: Array.from(selectedLeads) }),
        });

        if (!res.ok) throw new Error(await res.text());
        
        showAlert("تم بنجاح", `تم حذف العملاء بنجاح!`);
        setSelectedLeads(new Set());
        router.refresh();
        setLeads(leads.filter(l => !selectedLeads.has(l.id)));
      } catch (error: any) {
        showAlert("خطأ", "حدث خطأ أثناء الحذف: " + error.message);
      } finally {
        setIsDeleting(false);
      }
    });
  };

  const toggleSelectAll = (filteredList: Lead[]) => {
    if (selectedLeads.size === filteredList.length) {
      setSelectedLeads(new Set());
    } else {
      setSelectedLeads(new Set(filteredList.map(l => l.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedLeads);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedLeads(next);
  };

  // Filtering
  const filteredLeads = leads.filter(l => {
    if (filterStatus !== "ALL" && filterStatus !== "UNASSIGNED") {
      if (l.status !== filterStatus) return false;
    }
    if (filterStatus === "UNASSIGNED" && l.assignedTo) return false;
    
    if (filterEmployee !== "ALL") {
      if (filterEmployee === "UNASSIGNED" && l.assignedTo) return false;
      if (filterEmployee !== "UNASSIGNED" && l.assignedTo?.id !== filterEmployee) return false;
    }
    
    if (search) {
      const q = search.toLowerCase();
      if (!l.name.toLowerCase().includes(q) && !l.phone.includes(q)) return false;
    }
    return true;
  });

  const handleExport = () => {
    if (filteredLeads.length === 0) return showAlert("تنبيه", "لا يوجد بيانات لتصديرها.");
    
    const headers = ["الاسم", "رقم الهاتف", "الشركة", "الحالة", "التقييم", "الموظف المسؤول", "تاريخ الإضافة"];
    const csvData = filteredLeads.map(l => [
      l.name,
      l.phone,
      l.company || "",
      l.status,
      l.tier,
      l.assignedTo?.name || "غير معين",
      new Date(l.createdAt).toLocaleDateString("ar-EG")
    ]);
    
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
  };

  return (
    <div className="space-y-6 relative">
      {/* Custom Modal */}
      {modal.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#182032] border border-white/10 p-6 rounded-2xl shadow-2xl max-w-md w-full transform transition-all scale-100 opacity-100">
            <h3 className={`text-xl font-bold mb-3 ${modal.title.includes("خطأ") ? "text-rose-500" : modal.title.includes("بنجاح") ? "text-emerald-500" : "text-white"}`}>
              {modal.title}
            </h3>
            <p className="text-slate-300 text-[15px] mb-8 leading-relaxed">
              {modal.message}
            </p>
            <div className="flex justify-end gap-3">
              {modal.type === "confirm" && (
                <button 
                  onClick={() => setModal({ ...modal, isOpen: false })}
                  className="px-5 py-2 rounded-xl text-sm font-bold text-slate-300 bg-white/5 hover:bg-white/10 transition-colors"
                >
                  إلغاء
                </button>
              )}
              <button 
                onClick={() => {
                  if (modal.type === "confirm" && modal.onConfirm) modal.onConfirm();
                  setModal({ ...modal, isOpen: false });
                }}
                className={`px-6 py-2 rounded-xl text-sm font-bold text-white transition-colors shadow-lg ${
                  modal.type === "confirm" ? "bg-rose-600 hover:bg-rose-500" : "bg-indigo-600 hover:bg-indigo-500"
                }`}
              >
                {modal.type === "confirm" ? "نعم، متأكد" : "حسناً"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Preview Modal */}
      {previewData && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-[#182032] border border-white/10 p-6 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <span className="text-amber-400">🔍</span> معاينة الشيت قبل الرفع
              </h3>
              <button
                onClick={() => setPreviewData(null)}
                className="text-rose-500 hover:text-white hover:bg-rose-600 transition-colors p-1.5 rounded-lg border border-rose-500/30 hover:border-rose-600 shrink-0"
                title="إغلاق"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            <p className="text-slate-400 text-sm mb-5">
              السيستم اكتشف الأعمدة تلقائياً. تحقق من اختيار الأعمدة الصحيحة قبل الرفع.
            </p>

            {/* Column Mapping Selectors */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
              {[
                { label: "عمود الاسم *", value: previewNameKey, setter: setPreviewNameKey, color: "indigo" },
                { label: "عمود التليفون *", value: previewPhoneKey, setter: setPreviewPhoneKey, color: "emerald" },
                { label: "عمود الإيميل", value: previewEmailKey, setter: setPreviewEmailKey, color: "cyan" },
                { label: "عمود الشركة", value: previewCompanyKey, setter: setPreviewCompanyKey, color: "sky" },
                { label: "عمود الملاحظات / الاحتياج", value: previewNeedKey, setter: setPreviewNeedKey, color: "violet" },
                { label: "عمود رابط المتجر / الموقع", value: previewStoreUrlKey, setter: setPreviewStoreUrlKey, color: "amber" },
                { label: "عمود السوشيال ميديا", value: previewSocialKey, setter: setPreviewSocialKey, color: "rose" },
              ].map(({ label, value, setter, color }) => (
                <div key={label}>
                  <label className={`block text-xs font-bold mb-1 text-${color}-400`}>{label}</label>
                  <select
                    value={value}
                    onChange={e => setter(e.target.value)}
                    className="w-full bg-[#0f1523] border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50"
                  >
                    <option value="">-- لا يوجد --</option>
                    {previewData.allKeys.map(k => (
                      <option key={k} value={k}>{k}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            {/* Tier Picker */}
            <div className="mb-6 bg-[#0f1523] rounded-xl p-4 border border-white/5">
              <p className="text-xs font-bold text-slate-400 mb-3">حالة العملاء بعد الرفع (Tier)</p>
              <div className="flex gap-3">
                {[
                  { value: "HOT", label: "🔥 Hot", bg: "bg-rose-500/20 border-rose-500/40 text-rose-400", active: "bg-rose-500 text-white border-rose-500" },
                  { value: "WARM", label: "🌡️ Warm", bg: "bg-amber-500/20 border-amber-500/40 text-amber-400", active: "bg-amber-500 text-white border-amber-500" },
                  { value: "COLD", label: "❄️ Cold", bg: "bg-sky-500/20 border-sky-500/40 text-sky-400", active: "bg-sky-500 text-white border-sky-500" },
                ].map(t => (
                  <button
                    key={t.value}
                    onClick={() => setPreviewTier(t.value)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-bold border transition-all ${previewTier === t.value ? t.active : t.bg}`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Data Preview Table */}
            <div className="rounded-xl border border-white/10 overflow-hidden mb-6">
              <div className="bg-[#0f1523] px-4 py-2 text-xs font-bold text-slate-400 border-b border-white/5">
                معاينة أول 5 صفوف من البيانات
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-right">
                  <thead className="bg-[#0a0f1a]">
                    <tr>
                      <th className="px-3 py-2 text-indigo-400 font-bold">الاسم</th>
                      <th className="px-3 py-2 text-emerald-400 font-bold">التليفون</th>
                      <th className="px-3 py-2 text-sky-400 font-bold">الشركة</th>
                      <th className="px-3 py-2 text-violet-400 font-bold">الملاحظات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.rawJson.slice(0, 5).map((row, i) => {
                      const phone = previewPhoneKey ? String(row[previewPhoneKey] || "") : "";
                      return (
                        <tr key={i} className="border-t border-white/5">
                          <td className="px-3 py-2 text-white font-medium">{previewNameKey ? String(row[previewNameKey] || "-") : "-"}</td>
                          <td className="px-3 py-2 text-slate-300" dir="ltr">{phone || "-"}</td>
                          <td className="px-3 py-2 text-slate-400">{previewCompanyKey ? String(row[previewCompanyKey] || "-") : "-"}</td>
                          <td className="px-3 py-2 text-slate-500">{previewNeedKey ? String(row[previewNeedKey] || "-") : "-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <p className="text-slate-500 text-xs mb-5">إجمالي الصفوف في الملف: <span className="text-white font-bold">{previewData.rawJson.length} سطر</span></p>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setPreviewData(null)}
                className="px-5 py-2 rounded-xl text-sm font-bold text-slate-300 bg-white/5 hover:bg-white/10 transition-colors"
              >
                إلغاء
              </button>
              <button
                onClick={handleConfirmUpload}
                disabled={isUploading || !previewNameKey || !previewPhoneKey}
                className="px-6 py-2 rounded-xl text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 transition-colors shadow-lg disabled:opacity-50 flex items-center gap-2"
              >
                {isUploading ? "جاري الرفع..." : `✅ رفع ${previewData.rawJson.length} عميل`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header & Upload */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-[#121826] p-6 rounded-3xl border border-white/5 shadow-xl">
        <div>
          <h1 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
            <span className="text-indigo-500">👥</span> إدارة وتوزيع العملاء
          </h1>
          <p className="text-slate-400 text-sm">ارفع شيت الإكسيل وقم بتوزيع العملاء على موظفي المبيعات والتيلي سيلز.</p>
        </div>
        
        <div>
          <input
            type="file"
            accept=".xlsx, .xls, .csv"
            className="hidden"
            ref={fileInputRef}
            onChange={handleFileUpload}
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 px-6 rounded-xl shadow-lg transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {isUploading ? "جاري الرفع..." : (
              <>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="17 8 12 3 7 8"></polyline>
                  <line x1="12" y1="3" x2="12" y2="15"></line>
                </svg>
                رفع شيت Excel
              </>
            )}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/10">
        <button
          className={`px-6 py-3 font-bold text-sm transition-colors border-b-2 ${
            activeTab === "table" ? "border-indigo-500 text-indigo-400" : "border-transparent text-slate-400 hover:text-white"
          }`}
          onClick={() => setActiveTab("table")}
        >
          توزيع العملاء (الجدول)
        </button>
        <button
          className={`px-6 py-3 font-bold text-sm transition-colors border-b-2 ${
            activeTab === "cards" ? "border-indigo-500 text-indigo-400" : "border-transparent text-slate-400 hover:text-white"
          }`}
          onClick={() => setActiveTab("cards")}
        >
          متابعة العملاء
        </button>
      </div>

      {activeTab === "table" ? (
        <>
          {/* Action Bar (Filters + Assign) */}
      <div className="bg-[#121826] p-4 rounded-3xl border border-white/5 shadow-lg flex flex-col xl:flex-row gap-4 items-center justify-between">
        
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto">
          <div className="relative flex-1 min-w-[200px]">
            <input 
              type="text" placeholder="بحث بالاسم أو الرقم..." 
              value={search} onChange={e => setSearch(e.target.value)}
              className="w-full bg-[#182032] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-indigo-500/50"
            />
          </div>
          <select 
            value={filterEmployee} onChange={e => setFilterEmployee(e.target.value)}
            className="bg-[#182032] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-indigo-500/50 min-w-[150px]"
          >
            <option value="ALL">كل الموظفين</option>
            <option value="UNASSIGNED">غير معين (جديد)</option>
            {employees.map(emp => (
              <option key={emp.id} value={emp.id}>{emp.name} ({emp.role === "TELE_SALES" ? "تيلي" : "سيلز"})</option>
            ))}
          </select>
          <select 
            value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="bg-[#182032] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-indigo-500/50 min-w-[150px]"
          >
            <option value="ALL">كل الحالات</option>
            <option value="UNASSIGNED">غير موزع فقط</option>
            <option value="NEW">جديد</option>
            <option value="CONTACTED">تم التواصل</option>
            <option value="INTERESTED">مهتم</option>
            <option value="NOT_INTERESTED">غير مهتم</option>
            <option value="TRANSFERRED_TO_SALES">تم التحويل لـ Sales</option>
          </select>
        </div>

        {/* Bulk Actions */}
        <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto p-3 bg-indigo-500/10 rounded-2xl border border-indigo-500/20">
          
          <button 
            onClick={handleExport}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 px-4 rounded-xl shadow-md transition-colors whitespace-nowrap flex items-center gap-2"
            title="تصدير النتائج الحالية لإكسيل"
          >
            <span>📥</span> تصدير الداتا
          </button>

          <div className="text-sm text-indigo-300 font-bold px-2 whitespace-nowrap border-r border-indigo-500/30 pr-3">
            محدد: {selectedLeads.size}
          </div>
          <select 
            value={assignTarget} onChange={e => setAssignTarget(e.target.value)}
            className="bg-[#182032] border border-indigo-500/30 rounded-xl px-4 py-2 text-sm text-white outline-none focus:border-indigo-500 flex-1 min-w-[180px]"
          >
            <option value="">-- اختر الموظف للتحويل --</option>
            <option value="AUTO" className="text-amber-400 font-bold">🤖 توزيع تلقائي (بالتساوي على التيلي سيلز)</option>
            {employees.map(emp => (
              <option key={emp.id} value={emp.id}>{emp.name} ({emp.role === "TELE_SALES" ? "Tele" : "Sales"})</option>
            ))}
          </select>
          <button 
            onClick={handleBulkAssign}
            disabled={isAssigning || selectedLeads.size === 0 || !assignTarget}
            className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 px-6 rounded-xl shadow-md transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {isAssigning ? "جاري..." : "توزيع"}
          </button>
          
          {canDelete && (
            <button 
              onClick={handleBulkDelete}
              disabled={isDeleting || selectedLeads.size === 0}
              className="bg-rose-500/10 hover:bg-rose-600 text-rose-500 hover:text-white font-bold py-2 px-4 rounded-xl shadow-md transition-colors disabled:opacity-50 whitespace-nowrap border border-rose-500/20 ml-2"
              title="حذف العملاء المحددين"
            >
              {isDeleting ? "..." : "حذف"}
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-[#121826] rounded-3xl border border-white/5 shadow-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-right text-slate-300">
            <thead className="bg-[#0f1523] text-slate-400 font-semibold border-b border-white/5">
              <tr>
                <th className="px-6 py-4 w-12">
                  <input 
                    type="checkbox" 
                    checked={selectedLeads.size > 0 && selectedLeads.size === filteredLeads.length}
                    onChange={() => toggleSelectAll(filteredLeads)}
                    className="w-4 h-4 rounded bg-[#182032] border-white/20 text-indigo-500 focus:ring-indigo-500/50 cursor-pointer"
                  />
                </th>
                <th className="px-6 py-4">العميل</th>
                <th className="px-6 py-4">الهاتف</th>
                <th className="px-6 py-4">الشركة</th>
                <th className="px-6 py-4">الحالة</th>
                <th className="px-6 py-4">الموظف المسؤول</th>
                <th className="px-6 py-4">تاريخ الإضافة</th>
              </tr>
            </thead>
            <tbody>
              {filteredLeads.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                    لا يوجد عملاء متاحين بالفلتر الحالي.
                  </td>
                </tr>
              ) : (
                filteredLeads.map(lead => (
                  <tr key={lead.id} onClick={() => toggleSelect(lead.id)} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors cursor-pointer group">
                    <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                      <input 
                        type="checkbox" 
                        checked={selectedLeads.has(lead.id)}
                        onChange={() => toggleSelect(lead.id)}
                        className="w-4 h-4 rounded bg-[#182032] border-white/20 text-indigo-500 focus:ring-indigo-500/50 cursor-pointer"
                      />
                    </td>
                    <td className="px-6 py-4 font-bold text-white">{lead.name}</td>
                    <td className="px-6 py-4 text-slate-400" dir="ltr">{lead.phone}</td>
                    <td className="px-6 py-4">{lead.company || "-"}</td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        <StatusBadge status={lead.status} />
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {lead.assignedTo ? (
                        <span className={`px-3 py-1 rounded-full text-xs font-bold border ${lead.assignedTo.role === "SALES" ? "bg-purple-500/10 text-purple-400 border-purple-500/20" : "bg-blue-500/10 text-blue-400 border-blue-500/20"}`}>
                          {lead.assignedTo.name}
                        </span>
                      ) : (
                        <span className="text-slate-500 text-xs font-semibold bg-white/5 px-3 py-1 rounded-full">غير معين</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-500">
                      {new Date(lead.createdAt).toLocaleDateString("ar-EG")}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
        </>
      ) : (
        <LeadTable
          leads={leads as any}
          showAssignee
          allowTransfer
          canDelete={canDelete}
          salesTeam={salesTeam as any}
          employees={employees as any}
          allowExport={true}
        />
      )}
    </div>
  );
}

