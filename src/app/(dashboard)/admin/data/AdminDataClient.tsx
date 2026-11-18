"use client";

import { useMemo, useState } from "react";
import TeleSalesDataTable, { TeleSalesDataRow } from "@/components/TeleSalesDataTable";

export default function AdminDataClient({
  initialRows,
  teleSalesTeam,
}: {
  initialRows: TeleSalesDataRow[];
  teleSalesTeam: { id: string; name: string }[];
}) {
  const [employeeFilter, setEmployeeFilter] = useState<string>("ALL");

  const filteredRows = useMemo(() => {
    if (employeeFilter === "ALL") return initialRows;
    return initialRows.filter((r) => r.owner?.id === employeeFilter);
  }, [initialRows, employeeFilter]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <label className="text-sm text-slate-400">Employee:</label>
        <select
          value={employeeFilter}
          onChange={(e) => setEmployeeFilter(e.target.value)}
          className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white"
        >
          <option value="ALL">All employees</option>
          {teleSalesTeam.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>
      <TeleSalesDataTable initialRows={filteredRows} showOwnerColumn />
    </div>
  );
}
