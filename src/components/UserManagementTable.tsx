"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Download, Settings, FileText, XCircle, Ban } from "lucide-react";

export interface UserRow {
  id: string;
  name: string;
  username: string;
  email: string;
  phone: string | null;
  role: string;
  isActive: boolean;
  createdAt: string;
  _count: { assignedLeads: number };
}

const ROLE_OPTIONS = [
  { value: "ADMIN", label: "مدير النظام" },
  { value: "TELE_SALES", label: "موظف Tele-Sales" },
  { value: "SALES", label: "موظف Sales" },
];

export default function UserManagementTable({
  users,
  currentUserId,
}: {
  users: UserRow[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [newUser, setNewUser] = useState({
    name: "",
    username: "",
    email: "",
    phone: "",
    role: "TELE_SALES",
    password: "",
  });
  const [createError, setCreateError] = useState<string | null>(null);
  
  const [file, setFile] = useState<File | null>(null);
  const [uploadResult, setUploadResult] = useState<string | null>(null);

  const [toast, setToast] = useState<{ text: string, type: 'error' | 'success' } | null>(null);
  const showToast = (text: string, type: 'error' | 'success' = 'error') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 4000);
  };

  const [searchQuery, setSearchQuery] = useState("");

  const filteredUsers = users.filter((u) => 
    u.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    u.username.toLowerCase().includes(searchQuery.toLowerCase()) || 
    u.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  async function patchUser(id: string, body: any) {
    setBusy(true);
    try {
      const res = await fetch(`/api/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "حدث خطأ");
      router.refresh();
    } catch (e: any) {
      showToast(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteUser(id: string) {
    if (!window.confirm("هل أنت متأكد من حذف هذا الموظف نهائياً؟ لا يمكن التراجع عن هذا الإجراء.")) return;
    
    setBusy(true);
    try {
      const res = await fetch(`/api/users/${id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "حدث خطأ أثناء الحذف");
      setMenuOpenId(null);
      router.refresh();
    } catch (e: any) {
      showToast(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleCreate() {
    setBusy(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newUser),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "حدث خطأ");
      setNewUser({ name: "", username: "", email: "", phone: "", role: "TELE_SALES", password: "" });
      setShowCreate(false);
      router.refresh();
    } catch (e: any) {
      setCreateError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleUpload() {
    if (!file) return;
    setBusy(true);
    setUploadResult(null);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/users/bulk-upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "فشل الرفع");
      
      const dupCount = data.duplicateUsers?.length ?? 0;
      const invalidCount = data.invalidRows?.length ?? 0;
      const notes = [
        invalidCount ? `${invalidCount} صف ببيانات غير صالحة` : null,
        dupCount ? `${dupCount} مستخدم موجود بالفعل` : null,
      ].filter(Boolean).join(" و ");
      
      setUploadResult(
        `تم إضافة ${data.totalUploaded} موظف بنجاح${notes ? ` — تم تجاهل: ${notes}` : ""}`
      );
      router.refresh();
      setFile(null);
    } catch (e: any) {
      setUploadResult(`خطأ: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-[100] px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom-5 fade-in duration-300 border ${
          toast.type === 'error' ? 'bg-rose-950/90 text-rose-200 border-rose-500/30' : 'bg-emerald-950/90 text-emerald-200 border-emerald-500/30'
        }`}>
          <span className="text-xl">{toast.type === 'error' ? <AlertTriangle size={20} /> : <CheckCircle2 size={20} />}</span>
          <p className="font-semibold">{toast.text}</p>
        </div>
      )}

      {/* Header Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div className="relative w-full md:max-w-md">
          <input
            type="text"
            placeholder="بحث بالاسم، البريد الإلكتروني، أو اسم المستخدم..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input-field w-full text-sm bg-[#0f1523] py-3.5 pr-10"
          />
          <svg className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-4 w-full md:w-auto shrink-0">
          <button 
            onClick={() => setShowUpload(true)}
            className="bg-[#1e293b] hover:bg-slate-700 text-white px-5 py-3.5 rounded-xl text-base font-medium transition-colors flex items-center justify-center gap-2 border border-white/5 shadow-sm w-full sm:w-auto"
          >
            رفع موظفين (شيت Excel)
            <Download size={18} />
          </button>
          <button 
            onClick={() => setShowCreate(true)}
            className="bg-[#3b82f6] hover:bg-blue-600 text-white px-5 py-3.5 rounded-xl text-base font-medium transition-colors flex items-center justify-center gap-2 shadow-sm w-full sm:w-auto"
          >
            إضافة موظف جديد
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
          </button>
        </div>
      </div>

      {/* Users Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredUsers.length === 0 ? (
          <div className="col-span-full py-10 text-center text-slate-400">
            لم يتم العثور على موظفين بهذا الاسم أو البريد.
          </div>
        ) : (
          filteredUsers.map((u) => (
          <div 
            key={u.id} 
            className="bg-[#121826] rounded-3xl border border-white/5 p-6 relative group shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 flex flex-col"
          >
            {/* Header: Status & Role */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className={`px-3 py-1 rounded-full text-xs font-bold border ${u.isActive ? "bg-green-500/10 text-green-400 border-green-500/20" : "bg-rose-500/10 text-rose-400 border-rose-500/20"}`}>
                  {u.isActive ? "نشط" : "معطّل"}
                </span>
                <span className="text-xs font-semibold text-slate-400 bg-white/5 px-3 py-1 rounded-full">
                  {ROLE_OPTIONS.find((r) => r.value === u.role)?.label ?? u.role}
                </span>
              </div>
              
              {/* Three dots menu */}
              {u.id !== currentUserId && (
                <div className="relative">
                  <button 
                    onClick={() => setMenuOpenId(menuOpenId === u.id ? null : u.id)}
                    className="p-1.5 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="1"></circle>
                      <circle cx="12" cy="5" r="1"></circle>
                      <circle cx="12" cy="19" r="1"></circle>
                    </svg>
                  </button>
                  
                  {menuOpenId === u.id && (
                    <div className="absolute left-0 mt-1 w-36 bg-[#182032] border border-white/10 rounded-xl shadow-2xl z-20 py-1">
                      <button 
                        onClick={() => deleteUser(u.id)}
                        className="w-full text-right px-4 py-2 text-sm text-rose-400 hover:bg-rose-500/10 transition-colors flex items-center gap-2 font-medium"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 6h18"></path>
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                        حذف نهائي
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* User Info */}
            <div className="mb-6 flex-1">
              <h3 className="text-xl font-bold text-white mb-1">{u.name}</h3>
              <p className="text-sm text-slate-400 mb-3" dir="ltr">{u.email}</p>
              
              <div className="space-y-2 mt-4 bg-[#0f1523] p-4 rounded-2xl border border-white/5">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500">اسم المستخدم:</span>
                  <span className="text-slate-300 font-medium">{u.username}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500">العملاء الحاليين:</span>
                  <span className="text-accent-soft font-bold bg-accent/10 px-2 py-0.5 rounded-lg border border-accent/20">
                    {u._count.assignedLeads} عميل
                  </span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="pt-4 border-t border-white/5 mt-auto">
              <button 
                onClick={() => setOpenId(openId === u.id ? null : u.id)}
                className="w-full bg-white/5 hover:bg-white/10 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm flex items-center justify-center gap-2"
              >
                <Settings size={14} /> إدارة الموظف
              </button>
            </div>
          </div>
        )))}
      </div>

      {/* Global Settings Modal */}
      {openId && users.find(u => u.id === openId) && (
        (() => {
          const u = users.find(u => u.id === openId)!;
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm overflow-y-auto" onClick={() => setOpenId(null)}>
              <div className="bg-[#182032] border border-white/10 p-6 rounded-3xl shadow-2xl w-full max-w-4xl relative my-auto" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/10">
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <Settings size={16} className="text-accent-soft" /> 
                    <span>إعدادات الموظف: <span className="text-accent-soft">{u.name}</span></span>
                  </h3>
                  <button onClick={() => setOpenId(null)} className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-white/5 transition-colors shrink-0 bg-[#0f1523] border border-white/5 mr-4">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                  </button>
                </div>
                <UserActions
                  user={u}
                  busy={busy}
                  isSelf={u.id === currentUserId}
                  onUpdate={(body) => patchUser(u.id, body)}
                />
              </div>
            </div>
          );
        })()
      )}

      {/* Add User Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm overflow-y-auto" onClick={() => setShowCreate(false)}>
          <div className="bg-[#182032] border border-white/10 p-6 rounded-3xl shadow-2xl w-full max-w-md relative my-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/10">
              <h3 className="text-xl font-bold text-white">إضافة موظف جديد يدويًا</h3>
              <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-white/5 transition-colors bg-[#0f1523] border border-white/5">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            
            <form className="flex flex-col gap-4" autoComplete="off" onSubmit={(e) => e.preventDefault()}>
              <input
                autoComplete="new-password"
                className="input-field w-full text-sm bg-[#0f1523] py-3"
                placeholder="الاسم *"
                value={newUser.name}
                onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
              />
              <input
                autoComplete="new-password"
                className="input-field w-full text-sm bg-[#0f1523] py-3"
                placeholder="اسم المستخدم (Username) *"
                dir="ltr"
                value={newUser.username}
                onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
              />
              <input
                autoComplete="new-password"
                className="input-field w-full text-sm bg-[#0f1523] py-3"
                placeholder="البريد الإلكتروني *"
                dir="ltr"
                value={newUser.email}
                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
              />
              <input
                className="input-field w-full text-sm bg-[#0f1523] py-3"
                placeholder="رقم الهاتف (اختياري)"
                dir="ltr"
                value={newUser.phone}
                onChange={(e) => setNewUser({ ...newUser, phone: e.target.value })}
              />
              <select
                className="input-field w-full text-sm bg-[#0f1523] py-3"
                value={newUser.role}
                onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              <div className="relative">
                <input
                  autoComplete="new-password"
                  type={showCreatePassword ? "text" : "password"}
                  className="input-field w-full text-sm bg-[#0f1523] py-3 pl-10"
                  placeholder="كلمة المرور المبدئية *"
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                />
                <button
                  type="button"
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white focus:outline-none"
                  onClick={() => setShowCreatePassword(!showCreatePassword)}
                  tabIndex={-1}
                >
                  {showCreatePassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                      <line x1="1" y1="1" x2="23" y2="23"></line>
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                      <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                  )}
                </button>
              </div>
              
              {createError && <p className="text-sm text-status-hot mt-2">{createError}</p>}
              
              <button
                type="button"
                disabled={busy || !newUser.name || !newUser.username || !newUser.email || !newUser.password}
                onClick={handleCreate}
                className="bg-[#3b82f6] hover:bg-blue-600 disabled:bg-slate-700 disabled:text-slate-400 text-white w-full mt-4 py-3.5 rounded-xl text-base font-medium transition-colors"
              >
                {busy ? "جاري الإنشاء..." : "إنشاء الحساب"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Upload Excel Modal */}
      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm overflow-y-auto" onClick={() => setShowUpload(false)}>
          <div className="bg-[#182032] border border-white/10 p-6 rounded-3xl shadow-2xl w-full max-w-md relative my-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/10">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <Download size={18} /> رفع موظفين من ملف Excel
              </h3>
              <button onClick={() => setShowUpload(false)} className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-white/5 transition-colors bg-[#0f1523] border border-white/5">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            
            <div className="flex flex-col gap-6 text-center">
              {!uploadResult ? (
                <>
                  <p className="text-sm text-slate-300">
                    يمكنك رفع ملف بصيغة CSV يحتوي على بيانات الموظفين ليتم إضافتهم دفعة واحدة.
                  </p>
                  
                  <div className="bg-[#0f1523] p-10 rounded-2xl border-2 border-dashed border-accent/30 flex flex-col items-center justify-center gap-4">
                    <FileText size={44} className="text-accent-soft" />
                    <input
                      type="file"
                      accept=".csv"
                      onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                      className="text-sm text-slate-400 file:btn-ghost file:mr-3 file:border-0 file:text-sm file:font-semibold"
                    />
                    <p className="text-xs text-slate-500 mt-2">
                      الأعمدة المطلوبة: الاسم، اسم المستخدم، البريد الالكتروني، رقم الهاتف، كلمة المرور، الرتبة
                    </p>
                  </div>
                  
                  <button
                    disabled={!file || busy}
                    onClick={handleUpload}
                    className="bg-[#3b82f6] hover:bg-blue-600 disabled:bg-slate-700 disabled:text-slate-400 text-white w-full py-3.5 rounded-xl text-base font-medium transition-colors"
                  >
                    {busy ? "جاري الرفع..." : "رفع وإضافة الموظفين"}
                  </button>
                </>
              ) : (
                <>
                  <div className="bg-[#0f1523] p-8 rounded-2xl border border-white/5 flex flex-col items-center justify-center gap-3">
                    {uploadResult.includes("خطأ") ? <XCircle size={40} className="text-rose-400" /> : <CheckCircle2 size={40} className="text-emerald-400" />}
                    <p className="text-sm font-semibold text-white mt-2 leading-relaxed">{uploadResult}</p>
                  </div>
                  <button
                    onClick={() => {
                      setShowUpload(false);
                      setUploadResult(null);
                    }}
                    className="bg-[#1e293b] hover:bg-slate-700 text-white w-full py-3.5 rounded-xl text-base font-medium transition-colors border border-white/5"
                  >
                    إغلاق
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function UserActions({
  user,
  busy,
  isSelf,
  onUpdate,
}: {
  user: UserRow;
  busy: boolean;
  isSelf: boolean;
  onUpdate: (body: any) => void;
}) {
  const [role, setRole] = useState(user.role);
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  
  const [basicInfo, setBasicInfo] = useState({
    name: user.name,
    username: user.username,
    email: user.email,
    phone: user.phone || "",
  });

  const isBasicInfoChanged = 
    basicInfo.name !== user.name || 
    basicInfo.username !== user.username || 
    basicInfo.email !== user.email || 
    (basicInfo.phone || null) !== user.phone;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Right Column: Basic Info */}
      <div className="flex flex-col h-full">
        <div className="bg-[#121826] p-6 rounded-3xl border border-white/5 flex-1 flex flex-col">
          <div className="border-b border-white/5 pb-4 mb-6">
            <p className="text-base font-semibold text-white">البيانات الأساسية</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 flex-1">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-400 block">الاسم</label>
              <input 
                autoComplete="new-password"
                className="input-field w-full text-sm bg-[#0f1523] py-3" 
                value={basicInfo.name} 
                onChange={e => setBasicInfo({...basicInfo, name: e.target.value})} 
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-400 block">اسم المستخدم</label>
              <input 
                autoComplete="off"
                name="username_no_autofill"
                id="username_no_autofill"
                className="input-field w-full text-sm bg-[#0f1523] py-3" 
                dir="ltr"
                value={basicInfo.username} 
                onChange={e => setBasicInfo({...basicInfo, username: e.target.value})} 
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-400 block">البريد الإلكتروني</label>
              <input 
                autoComplete="off"
                name="email_no_autofill"
                id="email_no_autofill"
                className="input-field w-full text-sm bg-[#0f1523] py-3" 
                dir="ltr"
                value={basicInfo.email} 
                onChange={e => setBasicInfo({...basicInfo, email: e.target.value})} 
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-400 block">رقم الهاتف (اختياري)</label>
              <input 
                autoComplete="off"
                name="phone_no_autofill"
                id="phone_no_autofill"
                className="input-field w-full text-sm bg-[#0f1523] py-3" 
                dir="ltr"
                value={basicInfo.phone} 
                onChange={e => setBasicInfo({...basicInfo, phone: e.target.value})} 
              />
            </div>
          </div>
          <button
            disabled={busy || !isBasicInfoChanged || !basicInfo.name || !basicInfo.username || !basicInfo.email}
            onClick={() => onUpdate(basicInfo)}
            className="btn-primary w-full mt-6 py-3.5 text-sm"
          >
            حفظ البيانات الأساسية
          </button>
        </div>
      </div>

      {/* Left Column: Settings */}
      <div className="flex flex-col gap-6">
        {/* Role */}
        <div className="bg-[#121826] p-6 rounded-3xl border border-white/5">
          <p className="text-sm font-semibold text-white mb-4">تغيير الدور (الرتبة)</p>
          <div className="flex flex-col gap-4">
            <select
              className="input-field w-full text-sm bg-[#0f1523] py-3"
              value={role}
              disabled={isSelf}
              onChange={(e) => setRole(e.target.value)}
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <button
              disabled={busy || role === user.role || isSelf}
              onClick={() => onUpdate({ role })}
              className="btn-primary w-full py-3 text-sm"
            >
              حفظ الدور
            </button>
          </div>
        </div>

        {/* Password */}
        <div className="bg-[#121826] p-6 rounded-3xl border border-white/5">
          <p className="text-sm font-semibold text-white mb-4">إعادة تعيين كلمة المرور</p>
          <div className="flex flex-col gap-4">
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="كلمة مرور جديدة (6 أحرف على الأقل)"
                className="input-field w-full text-sm bg-[#0f1523] py-3 pl-10"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <button
                type="button"
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white focus:outline-none"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
              >
                {showPassword ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                    <line x1="1" y1="1" x2="23" y2="23"></line>
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                )}
              </button>
            </div>
            <button
              disabled={busy || newPassword.length < 6}
              onClick={() => {
                onUpdate({ newPassword });
                setNewPassword("");
              }}
              className="btn-primary w-full py-3 text-sm"
            >
              تغيير كلمة المرور
            </button>
          </div>
        </div>

        {/* Status */}
        <div className="bg-[#121826] p-6 rounded-3xl border border-white/5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-white mb-1">حالة الحساب</p>
              <p className="text-xs text-slate-400">
                {isSelf ? "لا يمكنك تعطيل حسابك الشخصي" : "تعطيل الحساب يمنع الموظف من الدخول"}
              </p>
            </div>
            <button
              disabled={busy || isSelf}
              onClick={() => onUpdate({ isActive: !user.isActive })}
              className={`w-full sm:w-auto px-6 py-3 rounded-xl text-sm font-bold transition-colors shrink-0 ${user.isActive ? "bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/20" : "bg-green-500/10 text-green-400 hover:bg-green-500/20 border border-green-500/20"}`}
            >
              {user.isActive ? <><Ban size={14} className="inline mb-0.5" /> تعطيل الحساب</> : <><CheckCircle2 size={14} className="inline mb-0.5" /> تفعيل الحساب</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
