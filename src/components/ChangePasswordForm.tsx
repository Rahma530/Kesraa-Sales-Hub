"use client";

import { useState } from "react";

export default function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const EyeIcon = ({ show }: { show: boolean }) => (
    show ? (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
        <line x1="1" y1="1" x2="23" y2="23"></line>
      </svg>
    ) : (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
        <circle cx="12" cy="12" r="3"></circle>
      </svg>
    )
  );
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setMessage({ text: "The new password and confirmation don't match", error: true });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/account/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "An error occurred");
      setMessage({ text: "Password changed successfully" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (e: any) {
      setMessage({ text: e.message, error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="glass-panel max-w-md space-y-4 p-6">
      <p className="text-sm font-semibold text-white">Change Password</p>
      <div>
        <label className="mb-1.5 block text-xs font-medium text-slate-400">Current Password</label>
        <div className="relative">
          <input
            type={showCurrent ? "text" : "password"}
            required
            className="input-field w-full pr-10"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
          <button type="button" onClick={() => setShowCurrent(!showCurrent)} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white" dir="ltr">
            <EyeIcon show={showCurrent} />
          </button>
        </div>
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-medium text-slate-400">New Password</label>
        <div className="relative">
          <input
            type={showNew ? "text" : "password"}
            required
            minLength={6}
            className="input-field w-full pr-10"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <button type="button" onClick={() => setShowNew(!showNew)} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white" dir="ltr">
            <EyeIcon show={showNew} />
          </button>
        </div>
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-medium text-slate-400">Confirm New Password</label>
        <div className="relative">
          <input
            type={showConfirm ? "text" : "password"}
            required
            minLength={6}
            className="input-field w-full pr-10"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
          <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white" dir="ltr">
            <EyeIcon show={showConfirm} />
          </button>
        </div>
      </div>
      {message && (
        <p className={`text-sm ${message.error ? "text-status-hot" : "text-status-won"}`}>
          {message.text}
        </p>
      )}
      <button type="submit" disabled={busy} className="btn-primary w-full">
        {busy ? "Saving..." : "Save New Password"}
      </button>
    </form>
  );
}
