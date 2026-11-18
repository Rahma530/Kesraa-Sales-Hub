"use client";

import { useState } from "react";

export type TeleSalesDataRow = {
  id: string;
  phone: string;
  storeUrl: string | null;
  answered: boolean;
  meetingHeld: boolean;
  followUpDate: string | Date | null;
  comment: string | null;
  comment2: string | null;
  owner?: { id: string; name: string } | null;
};

function toDateInputValue(d: string | Date | null) {
  if (!d) return "";
  const date = new Date(d);
  if (isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export default function TeleSalesDataTable({
  initialRows,
  showOwnerColumn = false,
}: {
  initialRows: TeleSalesDataRow[];
  showOwnerColumn?: boolean;
}) {
  const [rows, setRows] = useState(initialRows);
  const [savingId, setSavingId] = useState<string | null>(null);

  const patch = async (id: string, data: Partial<TeleSalesDataRow>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...data } : r)));
    setSavingId(id);
    try {
      await fetch(`/api/data/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    } finally {
      setSavingId(null);
    }
  };

  if (rows.length === 0) {
    return <p className="text-slate-500 text-sm">No data rows yet.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-white/5">
      <table className="w-full text-sm text-right text-slate-300">
        <thead className="bg-white/[0.03] text-slate-400">
          <tr>
            {showOwnerColumn && <th className="px-4 py-3 text-right">Employee</th>}
            <th className="px-4 py-3 text-right">Phone</th>
            <th className="px-4 py-3 text-right">Store Link</th>
            <th className="px-4 py-3 text-right">Answered</th>
            <th className="px-4 py-3 text-right">Meeting Held</th>
            <th className="px-4 py-3 text-right">Follow-up Date</th>
            <th className="px-4 py-3 text-right">Comment</th>
            <th className="px-4 py-3 text-right">Comment 2</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className={`border-t border-white/5 ${savingId === row.id ? "opacity-60" : ""}`}>
              {showOwnerColumn && <td className="px-4 py-3">{row.owner?.name ?? "—"}</td>}
              <td className="px-4 py-3" dir="ltr">{row.phone}</td>
              <td className="px-4 py-3">
                {row.storeUrl ? (
                  <a href={row.storeUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                    {row.storeUrl}
                  </a>
                ) : (
                  "—"
                )}
              </td>
              <td className="px-4 py-3">
                <input
                  type="checkbox"
                  checked={row.answered}
                  onChange={(e) => patch(row.id, { answered: e.target.checked })}
                  className="h-4 w-4 accent-accent"
                />
              </td>
              <td className="px-4 py-3">
                <input
                  type="checkbox"
                  checked={row.meetingHeld}
                  onChange={(e) => patch(row.id, { meetingHeld: e.target.checked })}
                  className="h-4 w-4 accent-accent"
                />
              </td>
              <td className="px-4 py-3">
                <input
                  type="date"
                  value={toDateInputValue(row.followUpDate)}
                  onChange={(e) => patch(row.id, { followUpDate: e.target.value || null } as any)}
                  className="rounded-lg bg-white/5 border border-white/10 px-2 py-1 text-xs text-white"
                />
              </td>
              <td className="px-4 py-3">
                <input
                  type="text"
                  defaultValue={row.comment ?? ""}
                  onBlur={(e) => {
                    if (e.target.value !== (row.comment ?? "")) patch(row.id, { comment: e.target.value || null } as any);
                  }}
                  className="w-40 rounded-lg bg-white/5 border border-white/10 px-2 py-1 text-xs text-white"
                />
              </td>
              <td className="px-4 py-3">
                <input
                  type="text"
                  defaultValue={row.comment2 ?? ""}
                  onBlur={(e) => {
                    if (e.target.value !== (row.comment2 ?? "")) patch(row.id, { comment2: e.target.value || null } as any);
                  }}
                  className="w-40 rounded-lg bg-white/5 border border-white/10 px-2 py-1 text-xs text-white"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
