"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Users } from "lucide-react";

export default function LeadUploadForm() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
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
    setResult(null);
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
    <div className="bg-[#121826] p-6 rounded-3xl border border-white/5 shadow-xl">
      {/* Header — same layout/classes as the admin "Lead Management &
          Distribution" panel, so this looks identical across every role. */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
            <Users size={18} className="text-accent" /> Lead Management & Distribution
          </h1>
          <p className="text-slate-400 text-sm">Upload a CSV file and distribute leads to your Sales and Tele-Sales staff.</p>
        </div>

        <div>
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
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 px-6 rounded-xl shadow-lg transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {busy ? (
              "Uploading..."
            ) : (
              <>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="17 8 12 3 7 8"></polyline>
                  <line x1="12" y1="3" x2="12" y2="15"></line>
                </svg>
                Upload CSV File
              </>
            )}
          </button>
        </div>
      </div>

      {/* Individual add — always visible alongside the bulk upload above,
          in the same panel, so both ways to add a lead are available at
          once rather than one hidden behind a toggle. */}
      <div className="mt-5 pt-5 border-t border-white/5">
        <p className="text-sm font-semibold text-slate-300 mb-3">Or add a single lead manually</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <input
            className="input-field text-sm"
            placeholder="Lead Name"
            value={manual.name}
            onChange={(e) => setManual({ ...manual, name: e.target.value })}
          />
          <input
            className="input-field text-sm"
            placeholder="Phone Number"
            dir="ltr"
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
      </div>

      <p className="text-xs text-slate-500 mt-4">
        Expected CSV columns: name, phone, email, company, need (Arabic column headers are also supported).
      </p>

      {result && <p className="text-sm text-accent-soft mt-2">{result}</p>}
    </div>
  );
}
