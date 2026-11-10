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

// Recharts colors each tooltip line (name + value) with that series' own
// fill/stroke by default, which for some of our bars/slices is dark and
// nearly invisible against the dark tooltip background. Force a light,
// always-readable color instead, regardless of the series' own color.
const tooltipItemStyle = { color: "#e9d9fb" };
const tooltipLabelStyle = { color: "#ffffff", fontWeight: 700, marginBottom: 4 };

// A plain, horizontal (non-rotated) axis tick with a clear vertical gap
// below the axis line. Rotated labels kept overlapping their neighbors even
// at full chart width, so this gives up on rotation entirely — with the
// status chart now spanning the full page width, a handful of short,
// horizontal labels fits far more reliably than diagonal text ever did.
function PlainAxisTick({
  x,
  y,
  payload,
  fontSize,
}: {
  x: number;
  y: number;
  payload: { value: string };
  fontSize: number;
}) {
  return (
    <text x={x} y={y} dy={18} textAnchor="middle" fill="#d8cdee" fontSize={fontSize} fontWeight={600}>
      {payload.value}
    </text>
  );
}

// Custom Legend content for the Tier pie chart — gives explicit, readable
// spacing between legend items and between each color swatch and its label
// (recharts' default Legend packs these close together).
function TierLegend({ payload }: { payload?: { value: string; color: string }[] }) {
  if (!payload) return null;
  return (
    <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 mt-2 list-none p-0">
      {payload.map((entry) => (
        <li key={entry.value} className="flex items-center gap-2 text-[13px] font-semibold" style={{ color: "#d8cdee" }}>
          <span className="inline-block h-3 w-3 rounded-sm shrink-0" style={{ backgroundColor: entry.color }} />
          {entry.value}
        </li>
      ))}
    </ul>
  );
}

export function StatusBarChart({ data }: { data: { status: string; count: number }[] }) {
  const chartData = data.map((d) => ({ name: STATUS_LABELS[d.status] ?? d.status, count: d.count }));
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={chartData} margin={{ top: 28, right: 8, left: -20, bottom: 16 }} barCategoryGap="30%">
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
        <XAxis
          dataKey="name"
          tick={(props: any) => <PlainAxisTick {...props} fontSize={12} />}
          interval={0}
          height={40}
        />
        <YAxis tick={{ fill: "#d8cdee", fontSize: 12, fontWeight: 600 }} allowDecimals={false} domain={[0, (max: number) => Math.ceil(max * 1.2) || 1]} />
        <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
        <Bar dataKey="count" fill={COLORS.accent} radius={[6, 6, 0, 0]}>
          <LabelList dataKey="count" position="top" fill="#ffffff" fontSize={12} fontWeight={700} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function renderPieValueLabel({ cx, cy, midAngle, innerRadius, outerRadius, value }: any) {
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) / 2;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="#ffffff" fontSize={13} fontWeight={700} textAnchor="middle" dominantBaseline="central">
      {value}
    </text>
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
          label={renderPieValueLabel}
          labelLine={false}
        >
          {chartData.map((entry) => (
            <Cell key={entry.name} fill={TIER_COLORS[entry.name] ?? COLORS.accent} />
          ))}
        </Pie>
        <Legend content={<TierLegend />} />
        <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
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
      <BarChart data={data} margin={{ top: 28, right: 8, left: -20, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
        <XAxis dataKey="name" tick={{ fill: "#d8cdee", fontSize: 12, fontWeight: 600 }} />
        <YAxis tick={{ fill: "#d8cdee", fontSize: 12, fontWeight: 600 }} allowDecimals={false} domain={[0, (max: number) => Math.ceil(max * 1.2) || 1]} />
        <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
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
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 16 }}>
        <defs>
          <linearGradient id="leadsGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={COLORS.accent} stopOpacity={0.5} />
            <stop offset="95%" stopColor={COLORS.accent} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
        <XAxis
          dataKey="date"
          tick={(props: any) => <PlainAxisTick {...props} fontSize={11} />}
          interval={0}
          height={35}
        />
        <YAxis tick={{ fill: "#d8cdee", fontSize: 12, fontWeight: 600 }} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
        <Area type="monotone" dataKey="count" stroke={COLORS.accent} fill="url(#leadsGradient)" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
