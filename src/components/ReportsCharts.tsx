"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
  AreaChart,
  Area,
  LabelList,
} from "recharts";

// Kesra brand palette — see public/branding/kesra-design-tokens.css
const COLORS = {
  accent: "#7b2ff7",
  accentGlow: "#b98cf0",
  hot: "#f5a3a3",
  gold: "#f5e29a",
  new: "#60a5fa",
  won: "#a9f5c1",
  lost: "#a89bb8",
};

const STATUS_LABELS: Record<string, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  NO_ANSWER: "No Answer",
  NEEDS_FOLLOWUP: "Needs Follow-up",
  INTERESTED: "Interested",
  NOT_INTERESTED: "Not Interested",
  HOT: "Hot",
  COLD: "Cold",
  MEETING_SCHEDULED: "Meeting",
  TRANSFERRED_TO_SALES: "Transferred to Sales",
  CLOSED_WON: "Closed (Won)",
  CLOSED_LOST: "Closed (Lost)",
};

const TIER_COLORS: Record<string, string> = {
  LEAD: COLORS.new,
  HOT: COLORS.hot,
  COLD: COLORS.gold,
};

const tooltipStyle = {
  backgroundColor: "#151318",
  border: "1px solid rgba(123,47,247,0.25)",
  borderRadius: "0.75rem",
  fontSize: "12px",
  color: "#e9d9fb",
  direction: "rtl" as const,
};

export function StatusBarChart({ data }: { data: { status: string; count: number }[] }) {
  const chartData = data.map((d) => ({ name: STATUS_LABELS[d.status] ?? d.status, count: d.count }));
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
        <XAxis dataKey="name" tick={{ fill: "#d8cdee", fontSize: 12, fontWeight: 600 }} interval={0} angle={-25} textAnchor="end" height={60} />
        <YAxis tick={{ fill: "#d8cdee", fontSize: 12, fontWeight: 600 }} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
        <Bar dataKey="count" fill={COLORS.accent} radius={[6, 6, 0, 0]}>
          <LabelList dataKey="count" position="top" fill="#ffffff" fontSize={12} fontWeight={700} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TierPieChart({ data }: { data: { tier: string; count: number }[] }) {
  const chartData = data.map((d) => ({ name: d.tier, value: d.count }));
  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={chartData}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={55}
          outerRadius={90}
          paddingAngle={3}
          label={({ value }) => value}
          labelLine={false}
          style={{ fontSize: "13px", fontWeight: 700, fill: "#ffffff" }}
        >
          {chartData.map((entry) => (
            <Cell key={entry.name} fill={TIER_COLORS[entry.name] ?? COLORS.accent} />
          ))}
        </Pie>
        <Legend wrapperStyle={{ fontSize: "13px", color: "#d8cdee", fontWeight: 600 }} />
        <Tooltip contentStyle={tooltipStyle} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function TeamPerformanceChart({
  data,
}: {
  data: { name: string; role: string; count: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
        <XAxis dataKey="name" tick={{ fill: "#d8cdee", fontSize: 12, fontWeight: 600 }} />
        <YAxis tick={{ fill: "#d8cdee", fontSize: 12, fontWeight: 600 }} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
        <Bar dataKey="count" radius={[6, 6, 0, 0]}>
          <LabelList dataKey="count" position="top" fill="#ffffff" fontSize={12} fontWeight={700} />
          {data.map((entry) => (
            <Cell key={entry.name} fill={entry.role === "SALES" ? COLORS.accentGlow : COLORS.accent} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function LeadsOverTimeChart({ data }: { data: { date: string; count: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 8 }}>
        <defs>
          <linearGradient id="leadsGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={COLORS.accent} stopOpacity={0.5} />
            <stop offset="95%" stopColor={COLORS.accent} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
        <XAxis dataKey="date" tick={{ fill: "#d8cdee", fontSize: 12, fontWeight: 600 }} />
        <YAxis tick={{ fill: "#d8cdee", fontSize: 12, fontWeight: 600 }} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} />
        <Area type="monotone" dataKey="count" stroke={COLORS.accent} fill="url(#leadsGradient)" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
