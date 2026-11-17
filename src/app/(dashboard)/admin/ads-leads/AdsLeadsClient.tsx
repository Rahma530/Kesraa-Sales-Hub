"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Link as LinkIcon, RefreshCw, Users } from "lucide-react";

type Config = {
  sheetUrl: string;
  lastSyncedAt: string | Date | null;
  lastSyncCount: number | null;
} | null;

type PendingLead = {
  id: string;
  name: string;
  phone: string;
  need: string | null;
  storeUrl: string | null;
  socialMediaUrl: string | null;
  acquisitionType: string | null;
  platform: string | null;
  createdAt: string | Date;
};

type TeamMember = { id: string; name: string };

const TIER_OPTIONS = ["WARM", "HOT", "COLD"];

export default function AdsLeadsClient({
  initialConfig,
  initialPendingLeads,
  teleSalesTeam,
}: {
  initialConfig: Config;
  initialPendingLeads: PendingLead[];
  teleSalesTeam: TeamMember[];
}) {
  const router = useRouter();
  const [sheetUrl, setSheetUrl] = useState(initialConfig?.sheetUrl ?? "");
  const [config, setConfig] = useState(initialConfig);
  const [pendingLeads, setPendingLeads] = useState(initialPendingLeads);
  const [savingLink, setSavingLink] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [rowState, setRowState] = useState<Record<string, { assignedToId: string; tier: string }>>({});
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  const getRow = (leadId: string) =>
    rowState[leadId] ?? { assignedToId: teleSalesTeam[0]?.id ?? "", tier: "WARM" };

  const setRow = (leadId: string, patch: Partial<{ assignedToId: string; tier: string }>) => {
    setRowState((prev) => ({ ...prev, [leadId]: { ...getRow(leadId), ...patch } }));
  };

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
        text: `${data.newCount} new lead(s) pulled in${data.skippedCount ? `, ${data.skippedCount} already existed and were skipped` : ""}.`,
      });
      router.refresh();
    } catch (e: any) {
      setMessage({ type: "error", text: e.message });
    } finally {
      setSyncing(false);
    }
  };

  const handleClassify = async (leadId: string) => {
    const row = getRow(leadId);
    if (!row.assignedToId) {
      setMessage({ type: "error", text: "Please select a Tele-Sales employee first." });
      return;
    }
    setSubmittingId(leadId);
    setMessage(null);
    try {
      const res = await fetch(`/api/leads/${leadId}/classify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(row),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPendingLeads((prev) => prev.filter((l) => l.id !== leadId));
    } catch (e: any) {
      setMessage({ type: "error", text: e.message });
    } finally {
      setSubmittingId(null);
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
          sheet is shared (Viewer) with the service account's email first.
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

      <div className="bg-[#121826] p-6 rounded-3xl border border-white/5 shadow-xl">
        <h2 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
          <Users size={18} className="text-accent" /> Pending Review ({pendingLeads.length})
        </h2>
        <p className="text-slate-400 text-sm mb-6">
          Leads pulled in from the sheet, waiting to be assigned to a Tele-Sales employee and classified.
          Once confirmed, each one becomes a normal lead.
        </p>

        {pendingLeads.length === 0 ? (
          <p className="text-slate-500 text-sm">No pending leads right now.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-white/5">
            <table className="w-full text-sm text-right text-slate-300">
              <thead className="bg-white/[0.03] text-slate-400">
                <tr>
                  <th className="px-4 py-3 text-right">Name</th>
                  <th className="px-4 py-3 text-right">Phone</th>
                  <th className="px-4 py-3 text-right">Source</th>
                  <th className="px-4 py-3 text-right">Platform</th>
                  <th className="px-4 py-3 text-right">Assign To</th>
                  <th className="px-4 py-3 text-right">Tier</th>
                  <th className="px-4 py-3 text-right">Confirm</th>
                </tr>
              </thead>
              <tbody>
                {pendingLeads.map((lead) => {
                  const row = getRow(lead.id);
                  return (
                    <tr key={lead.id} className="border-t border-white/5">
                      <td className="px-4 py-3">{lead.name}</td>
                      <td className="px-4 py-3">{lead.phone}</td>
                      <td className="px-4 py-3">{lead.acquisitionType ?? "—"}</td>
                      <td className="px-4 py-3">{lead.platform ?? "—"}</td>
                      <td className="px-4 py-3">
                        <select
                          value={row.assignedToId}
                          onChange={(e) => setRow(lead.id, { assignedToId: e.target.value })}
                          className="rounded-lg bg-white/5 border border-white/10 px-2 py-1.5 text-xs text-white"
                        >
                          {teleSalesTeam.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={row.tier}
                          onChange={(e) => setRow(lead.id, { tier: e.target.value })}
                          className="rounded-lg bg-white/5 border border-white/10 px-2 py-1.5 text-xs text-white"
                        >
                          {TIER_OPTIONS.map((t) => (
                            <option key={t} value={t}>
                              {t === "HOT" ? "Hot" : t === "WARM" ? "Warm" : "Cold"}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleClassify(lead.id)}
                          disabled={submittingId === lead.id || teleSalesTeam.length === 0}
                          className="px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-accent hover:opacity-90 transition disabled:opacity-50"
                        >
                          {submittingId === lead.id ? "..." : "Confirm"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
