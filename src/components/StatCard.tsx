import type { ReactNode } from "react";

export default function StatCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: string | number;
  icon: ReactNode;
  accent?: string;
}) {
  return (
    <div className="glass-card">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400">{label}</p>
        <span className={accent ?? "text-slate-300"}>{icon}</span>
      </div>
      <p className={`mt-2 text-2xl font-bold ${accent ?? "text-white"}`}>{value}</p>
    </div>
  );
}
