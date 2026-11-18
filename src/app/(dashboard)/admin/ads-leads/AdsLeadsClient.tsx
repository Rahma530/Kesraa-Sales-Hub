"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Link as LinkIcon, RefreshCw } from "lucide-react";

type Config = {
  sheetUrl: string;
  lastSyncedAt: string | Date | null;
  lastSyncCount: number | null;
} | null;

export default function AdsLeadsClient({ initialConfig }: { initialConfig: Config }) {
  const router = useRouter();
  const [sheetUrl, setSheetUrl] = useState(initialConfig?.sheetUrl ?? "");
  const [config, setConfig] = useState(initialConfig);
  const [savingLink, setSavingLink] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  const handleSaveLink = async () => {
    setSavingLink(true);
    setMessage(null);
    try {
      const res = await fetch("/api/ads-sheet/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheetUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setConfig(data.config);
      setMessage({ type: "success", text: "The sheet link was saved." });
    } catch (e: any) {
      setMessage({ type: "error", text: e.message });
    } finally {
      setSavingLink(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setMessage(null);
    try {
      const res = await fetch("/api/ads-sheet/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage({
        type: "success",
        text: `${data.newCount} new lead(s) pulled in and distributed automatically across the Tele-Sales team${data.skippedCount ? `, ${data.skippedCount} already existed and were skipped` : ""}.`,
      });
      router.refresh();
    } catch (e: any) {
      setMessage({ type: "error", text: e.message });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-6">
      {message && (
        <div
          className={`rounded-xl border p-4 text-sm ${
            message.type === "error"
              ? "border-rose-500/30 bg-rose-500/10 text-rose-300"
              : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="bg-[#121826] p-6 rounded-3xl border border-white/5 shadow-xl">
        <h2 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
          <LinkIcon size={18} className="text-accent" /> Ads Google Sheet
        </h2>
        <p className="text-slate-400 text-sm mb-6">
          Paste the link of the Ads leads sheet here. It can be changed at any time — just make sure the
          sheet is shared (Viewer) with the service account's email first. New leads pulled in are
          distributed automatically and equally across the active Tele-Sales team, exactly like an Excel
          upload.
        </p>

        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={sheetUrl}
            onChange={(e) => setSheetUrl(e.target.value)}
            placeholder="https://docs.google.com/spreadsheets/d/..."
            className="flex-1 rounded-xl bg-white/5 border border-white/10 px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-accent/50"
          />
          <button
            onClick={handleSaveLink}
            disabled={savingLink || !sheetUrl}
            className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-accent hover:opacity-90 transition disabled:opacity-50 whitespace-nowrap"
          >
            {savingLink ? "..." : "Save Link"}
          </button>
          <button
            onClick={handleSync}
            disabled={syncing || !config}
            className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 transition disabled:opacity-50 whitespace-nowrap flex items-center justify-center gap-2"
          >
            <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
            {syncing ? "Syncing..." : "Sync Now"}
          </button>
        </div>

        {config?.lastSyncedAt && (
          <p className="text-xs text-slate-500 mt-3">
            Last synced: {new Date(config.lastSyncedAt).toLocaleString()} — {config.lastSyncCount ?? 0} new lead(s) pulled in.
          </p>
        )}
      </div>
    </div>
  );
}
