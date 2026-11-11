"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { Users, X } from "lucide-react";

export default function LeadUploadForm() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [manual, setManual] = useState({ name: "", phone: "", company: "", need: "" });

  async function handleFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file again later
    if (!file) return;

    setBusy(true);
    setResult(null);
    try {
      // /api/leads/upload parses CSV text (same backend as before — no
      // change there). Excel files (.xlsx/.xls) are converted to CSV right
      // here in the browser so the person can just pick either kind of
      // file without needing to know the difference.
      const isCsv = file.name.toLowerCase().endsWith(".csv");
      let uploadFile = file;
      if (!isCsv) {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const csvText = XLSX.utils.sheet_to_csv(sheet);
        uploadFile = new File([csvText], file.name.replace(/\.(xlsx|xls)$/i, ".csv"), { type: "text/csv" });
      }

      const formData = new FormData();
      formData.append("file", uploadFile);
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
      setShowAddModal(false);
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
          <p className="text-slate-400 text-sm">Upload a file or add a lead manually, and distribute it to your Sales and Tele-Sales staff.</p>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
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
                Upload Excel / CSV File
              </>
            )}
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-[#3b82f6] hover:bg-blue-600 text-white px-5 py-3 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 shadow-sm"
          >
            Add Lead Manually
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
          </button>
        </div>
      </div>

      <p className="text-xs text-slate-500 mt-4">
        Expected columns: name, phone, email, company, need (Arabic column headers are also supported).
      </p>

      {result && <p className="text-sm text-accent-soft mt-2">{result}</p>}

      {/* Add Lead Manually — a modal, same style used for this elsewhere in
          the app, instead of sitting inline as plain fields in the panel. */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setShowAddModal(false)}>
          <div className="w-full max-w-md rounded-3xl bg-[#0f1523] border border-[#1b2438] p-6 shadow-2xl relative" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setShowAddModal(false)} className="absolute top-5 left-5 w-8 h-8 flex items-center justify-center rounded-full bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 transition-colors"><X size={16} /></button>
            <h3 className="text-lg font-bold text-white mb-6 border-b border-white/5 pb-4">Add New Lead Manually</h3>
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-slate-300 mb-1">Lead Name *</p>
                <input
                  className="w-full bg-[#1e293b] border border-slate-700/50 text-slate-200 text-sm rounded-xl px-4 py-3 outline-none focus:border-accent/50 transition-colors placeholder:text-slate-500"
                  placeholder="Name"
                  value={manual.name}
                  onChange={(e) => setManual({ ...manual, name: e.target.value })}
                />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-300 mb-1">Phone Number *</p>
                <input
                  className="w-full bg-[#1e293b] border border-slate-700/50 text-slate-200 text-sm rounded-xl px-4 py-3 outline-none focus:border-accent/50 transition-colors placeholder:text-slate-500"
                  placeholder="Phone Number"
                  dir="ltr"
                  value={manual.phone}
                  onChange={(e) => setManual({ ...manual, phone: e.target.value })}
                />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-300 mb-1">Company (optional)</p>
                <input
                  className="w-full bg-[#1e293b] border border-slate-700/50 text-slate-200 text-sm rounded-xl px-4 py-3 outline-none focus:border-accent/50 transition-colors placeholder:text-slate-500"
                  placeholder="Company"
                  value={manual.company}
                  onChange={(e) => setManual({ ...manual, company: e.target.value })}
                />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-300 mb-1">Need (optional)</p>
                <input
                  className="w-full bg-[#1e293b] border border-slate-700/50 text-slate-200 text-sm rounded-xl px-4 py-3 outline-none focus:border-accent/50 transition-colors placeholder:text-slate-500"
                  placeholder="Need"
                  value={manual.need}
                  onChange={(e) => setManual({ ...manual, need: e.target.value })}
                />
              </div>
            </div>
            <div className="mt-8 flex justify-end gap-3">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white transition-colors"
                disabled={busy}
              >
                Cancel
              </button>
              <button
                onClick={handleManualAdd}
                className="bg-accent hover:bg-accent text-white px-6 py-2.5 rounded-xl text-sm font-medium transition-colors"
                disabled={busy || !manual.name || !manual.phone}
              >
                {busy ? "Adding..." : "Add Lead"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
