"use client";

import { useState } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "An error occurred");
      setSent(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-kesra-hero px-4">
      <div className="glass-panel w-full max-w-md p-10 py-12">
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-bold text-white">Kesra CRM</h1>
          <p className="mt-1 text-sm text-[#a89bb8]">Reset your password</p>
        </div>

        {sent ? (
          <div className="flex flex-col gap-4 text-center">
            <p className="text-sm text-slate-300">
              If an account exists for <span dir="ltr" className="font-semibold text-white">{email}</span>, a password reset link has been sent to it. Check your inbox (and spam folder) — the link expires in 1 hour.
            </p>
            <Link href="/login" className="btn-primary w-full text-center">
              Back to Sign In
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400">
                Email
              </label>
              <input
                type="email"
                className="input-field w-full"
                dir="ltr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
              <p className="mt-1.5 text-xs text-slate-500">
                Enter the same email you signed in with — we'll send the reset link there.
              </p>
            </div>

            {error && (
              <p className="rounded-lg bg-status-hot/10 px-3 py-2 text-sm text-status-hot">
                {error}
              </p>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? "Sending..." : "Send Reset Link"}
            </button>

            <Link href="/login" className="block text-center text-xs text-slate-400 hover:text-white">
              Back to Sign In
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
