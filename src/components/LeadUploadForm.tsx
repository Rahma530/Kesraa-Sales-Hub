"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LeadUploadForm() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [manual, setManual] = useState({ name: "", phone: "", company: "", need: "" });

  async function handleUpload() {
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
      setFile(null);
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
    <div className="glass-panel p-5 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-white">Upload / Add Leads</p>
        <button className="text-xs text-accent-soft" onClick={() => setShowManual(!showManual)}>
          {showManual ? "Upload a file instead" : "Add manually instead"}
        </button>
      </div>

      {!showManual ? (
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="file"
            accept=".csv"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-xs text-slate-400 file:btn-ghost file:mr-3 file:border-0 file:text-xs"
          />
          <button disabled={!file || busy} onClick={handleUpload} className="btn-primary text-xs">
            {busy ? "Uploading and distributing..." : "Upload and Distribute Leads"}
          </button>
          <span className="text-xs text-slate-500">
            Expected file columns: name, phone, email, company, need
          </span>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <input
            className="input-field text-xs"
            placeholder="Lead Name"
            value={manual.name}
            onChange={(e) => setManual({ ...manual, name: e.target.value })}
          />
          <input
            className="input-field text-xs"
            placeholder="Phone Number"
            value={manual.phone}
            onChange={(e) => setManual({ ...manual, phone: e.target.value })}
          />
          <input
            className="input-field text-xs"
            placeholder="Company (optional)"
            value={manual.company}
            onChange={(e) => setManual({ ...manual, company: e.target.value })}
          />
          <button
            disabled={!manual.name || !manual.phone || busy}
            onClick={handleManualAdd}
            className="btn-primary text-xs"
          >
            Add
          </button>
        </div>
      )}

      {result && <p className="text-xs text-accent-soft">{result}</p>}
    </div>
  );
}
