"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud } from "lucide-react";

export default function DataUploadButton() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function handleFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setBusy(true);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/data/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");

      const insertedTotal = data.matchedSheets.reduce((s: number, m: any) => s + m.inserted, 0);
      const matchedNames = data.matchedSheets.map((m: any) => `${m.employeeName} (${m.inserted})`).join(", ");
      const unmatched = data.unmatchedSheets.length
        ? ` — sheet(s) with no matching employee name, skipped: ${data.unmatchedSheets.join(", ")}`
        : "";
      setResult(`${insertedTotal} row(s) imported${matchedNames ? ` — ${matchedNames}` : ""}${unmatched}`);
      router.refresh();
    } catch (e: any) {
      setResult(`Error: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <input type="file" accept=".xlsx,.xls" className="hidden" ref={fileInputRef} onChange={handleFileChosen} />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
          className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 px-6 rounded-xl shadow-lg transition-colors flex items-center gap-2 disabled:opacity-50"
        >
          <UploadCloud size={18} />
          {busy ? "Uploading..." : "Upload Data"}
        </button>
      </div>
      {result && <p className="text-xs text-slate-400">{result}</p>}
    </div>
  );
}
