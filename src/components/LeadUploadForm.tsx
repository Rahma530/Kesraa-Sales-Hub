"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Users, UploadCloud } from "lucide-react";

export default function LeadUploadForm() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [manual, setManual] = useState({ name: "", phone: "", company: "", need: "" });

  async function handleFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file again later
    if (!file) return;

    setBusy(true);
    setResult(null);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/leads/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      const dupCount = data.duplicatePhones?.length ?? 0;
      const invalidCount = data.invalidRows?.length ?? 0;
      const notes = [
        invalidCount ? `${invalidCount} row(s) with invalid data` : null,
        dupCount ? `${dupCount} duplicate number(s) (already exist)` : null,
      ]
        .filter(Boolean)
        .join(" and ");
      setResult(
        `Successfully uploaded and distributed ${data.totalUploaded} lead(s) across ${data.distributedAcross} employee(s)${
          notes ? ` — skipped: ${notes}` : ""
        }`
      );
      router.refresh();
    } catch (e: any) {
      setResult(`Error: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleManualAdd() {
    setBusy(true);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(manual),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add lead");
      setResult("Lead added and distributed successfully");
      setManual({ name: "", phone: "", company: "", need: "" });
      router.refresh();
    } catch (e: any) {
      setResult(`Error: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-[#121826] p-6 rounded-3xl border border-white/5 shadow-xl space-y-5">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
            <Users size={18} className="text-accent" /> Add or Upload Leads
          </h2>
          <p className="text-slate-400 text-sm">
            Upload a CSV file of leads, or add a single lead manually — either way they&apos;re distributed automatically.
          </p>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <input
            type="file"
            accept=".csv"
            className="hidden"
            ref={fileInputRef}
            onChange={handleFileChosen}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 px-6 rounded-xl shadow-lg transition-colors flex items-center gap-2 disabled:opacity-50 w-full md:w-auto justify-center"
          >
            <UploadCloud size={18} />
            {busy ? "Uploading..." : "Upload CSV File"}
          </button>
          <button
            onClick={() => setShowManual(!showManual)}
            className="btn-ghost text-sm px-4 py-3 whitespace-nowrap"
          >
            {showManual ? "Hide manual form" : "Add manually instead"}
          </button>
        </div>
      </div>

      <p className="text-xs text-slate-500 -mt-2">
        Expected columns: name, phone, email, company, need (Arabic column headers are also supported).
      </p>

      {showManual && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4 pt-3 border-t border-white/5">
          <input
            className="input-field text-sm"
            placeholder="Lead Name"
            value={manual.name}
            onChange={(e) => setManual({ ...manual, name: e.target.value })}
          />
          <input
            className="input-field text-sm"
            placeholder="Phone Number"
            value={manual.phone}
            onChange={(e) => setManual({ ...manual, phone: e.target.value })}
          />
          <input
            className="input-field text-sm"
            placeholder="Company (optional)"
            value={manual.company}
            onChange={(e) => setManual({ ...manual, company: e.target.value })}
          />
          <button
            disabled={!manual.name || !manual.phone || busy}
            onClick={handleManualAdd}
            className="btn-primary text-sm"
          >
            Add Lead
          </button>
        </div>
      )}

      {result && <p className="text-sm text-accent-soft">{result}</p>}
    </div>
  );
}
