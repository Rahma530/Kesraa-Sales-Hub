"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function EditProfileForm({ user }: { user: any }) {
  const [name, setName] = useState(user.name || "");
  const [email, setEmail] = useState(user.email || "");
  const [phone, setPhone] = useState(user.phone || "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage({ type: "", text: "" });

    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, phone }),
      });

      const data = await res.json();
      if (res.ok) {
        setMessage({ type: "success", text: "تم تحديث بياناتك بنجاح" });
        router.refresh();
      } else {
        setMessage({ type: "error", text: data.error || "حدث خطأ أثناء التحديث" });
      }
    } catch (e: any) {
      setMessage({ type: "error", text: "تعذر الاتصال بالخادم" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mb-6 glass-panel max-w-md p-6">
      <h3 className="mb-4 text-sm font-semibold text-white border-b border-white/10 pb-2">تحديث بيانات الحساب</h3>
      
      {message.text && (
        <div className={`mb-4 p-3 rounded-lg text-sm text-center font-medium ${message.type === 'success' ? 'bg-green-900/30 text-green-400 border border-green-500/30' : 'bg-red-900/30 text-red-400 border border-red-500/30'}`}>
          {message.text}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-400 mb-1">الاسم بالكامل</label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-[#121927] border border-white/10 rounded-lg p-2.5 text-white text-sm focus:outline-none focus:border-accent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-400 mb-1">البريد الإلكتروني</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-[#121927] border border-white/10 rounded-lg p-2.5 text-white text-sm focus:outline-none focus:border-accent"
            dir="ltr"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-400 mb-1">رقم الهاتف (إضافي)</label>
          <input
            type="text"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full bg-[#121927] border border-white/10 rounded-lg p-2.5 text-white text-sm focus:outline-none focus:border-accent"
            dir="ltr"
            placeholder="مثال: 01012345678"
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-accent hover:bg-accent text-white font-bold py-2.5 rounded-lg mt-2 disabled:opacity-50 transition-colors"
        >
          {isSubmitting ? "جاري الحفظ..." : "حفظ التعديلات"}
        </button>
      </form>
    </div>
  );
}
