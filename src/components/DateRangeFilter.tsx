"use client";

import { useState } from "react";
import { Calendar } from "lucide-react";

export type DateRangeValue = { preset: string; from?: string; to?: string };

const PRESETS_EN = [
  { id: "ALL", label: "All Time" },
  { id: "TODAY", label: "Today" },
  { id: "THIS_WEEK", label: "This Week" },
  { id: "THIS_MONTH", label: "This Month" },
  { id: "THIS_YEAR", label: "This Year" },
  { id: "NEW_LEADS", label: "New (last 7 days)" },
  { id: "OLD_LEADS", label: "Old (30+ days)" },
  { id: "CUSTOM", label: "Custom Range..." },
];

const PRESETS_AR = [
  { id: "ALL", label: "كل الأوقات" },
  { id: "TODAY", label: "النهاردة" },
  { id: "THIS_WEEK", label: "الأسبوع ده" },
  { id: "THIS_MONTH", label: "الشهر ده" },
  { id: "THIS_YEAR", label: "السنة دي" },
  { id: "NEW_LEADS", label: "جديدة (آخر 7 أيام)" },
  { id: "OLD_LEADS", label: "قديمة (30+ يوم)" },
  { id: "CUSTOM", label: "فترة مخصصة..." },
];

// Kept as an export so existing English-mode callers (e.g. LeadTable's
// Sales/Tele-Sales usage) can still reference the preset list directly if needed.
export const DATE_RANGE_PRESETS = PRESETS_EN;

/**
 * One reusable day/month/year date filter — a dropdown of quick presets
 * plus a "Custom Range" option that reveals two date inputs. Used by both
 * Lead Management tabs and meant to be reused by dashboards/reports too,
 * so the date-filter feature behaves identically everywhere it appears.
 *
 * `lang` defaults to "en" so every existing caller (LeadTable, shared with
 * the still-English Sales/Tele-Sales dashboards) is unaffected; only the
 * Lead Management "Lead Distribution" tab (the Arabic-localization pilot)
 * passes lang="ar". This is text-only — layout/direction doesn't change.
 *
 * Emits a single `DateRangeValue` ({ preset, from?, to? }) — callers pass
 * `preset`/`from`/`to` straight through as the `datePreset`/`dateFrom`/
 * `dateTo` query params on /api/leads (and friends).
 */
export default function DateRangeFilter({
  value,
  onChange,
  className = "",
  lang = "en",
}: {
  value: DateRangeValue;
  onChange: (v: DateRangeValue) => void;
  className?: string;
  lang?: "en" | "ar";
}) {
  const [showCustom, setShowCustom] = useState(value.preset === "CUSTOM");
  const presets = lang === "ar" ? PRESETS_AR : PRESETS_EN;

  const handlePresetChange = (preset: string) => {
    if (preset === "CUSTOM") {
      setShowCustom(true);
      onChange({ preset: "CUSTOM", from: value.from, to: value.to });
    } else {
      setShowCustom(false);
      onChange({ preset });
    }
  };

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <div className="relative">
        <Calendar size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
        <select
          value={value.preset}
          onChange={(e) => handlePresetChange(e.target.value)}
          className="bg-[#182032] border border-white/10 rounded-xl pl-4 pr-9 py-2.5 text-sm text-white outline-none focus:border-accent/50 min-w-[160px] appearance-none"
        >
          {presets.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
      </div>

      {showCustom && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={value.from ?? ""}
            onChange={(e) => onChange({ preset: "CUSTOM", from: e.target.value, to: value.to })}
            className="bg-[#182032] border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-accent/50"
          />
          <span className="text-slate-500 text-xs">{lang === "ar" ? "إلى" : "to"}</span>
          <input
            type="date"
            value={value.to ?? ""}
            onChange={(e) => onChange({ preset: "CUSTOM", from: value.from, to: e.target.value })}
            className="bg-[#182032] border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-accent/50"
          />
        </div>
      )}
    </div>
  );
}
