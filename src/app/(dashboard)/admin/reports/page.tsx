import { Role } from "@/lib/enums";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import DashboardShell from "@/components/DashboardShell";
import StatCard from "@/components/StatCard";
import { ClipboardList, Handshake, CheckCircle2, TrendingUp } from "lucide-react";
import {
  StatusBarChart,
  TierPieChart,
  TeamPerformanceChart,
  LeadsOverTimeChart,
} from "@/components/ReportsCharts";


export default async function ReportsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (!can(session.user.role, "VIEW_TEAM_PERFORMANCE")) redirect("/unauthorized");

  const since = new Date();
  since.setDate(since.getDate() - 13);
  since.setHours(0, 0, 0, 0);

  const [
    statusGroups,
    tierGroups,
    team,
    recentLeads,
    totalLeads,
    transferred,
    closedWon,
    closedLost,
  ] = await Promise.all([
    prisma.lead.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.lead.groupBy({ by: ["tier"], _count: { _all: true } }),
    prisma.user.findMany({
      where: { role: { in: [Role.TELE_SALES, Role.SALES] }, isActive: true },
      select: { name: true, role: true, _count: { select: { assignedLeads: true } } },
    }),
    prisma.lead.findMany({
      where: { createdAt: { gte: since } },
      select: { createdAt: true },
    }),
    prisma.lead.count(),
    prisma.lead.count({ where: { status: "TRANSFERRED_TO_SALES" } }),
    // A deal can be closed from the Tele-Sales `status` field (Admin/Head
    // closing on an employee's behalf) or from `salesStatus` (the normal
    // case: Sales closes it themselves) — count both.
    prisma.lead.count({ where: { OR: [{ status: "CLOSED_WON" }, { salesStatus: "CLOSED_WON" }] } }),
    prisma.lead.count({ where: { OR: [{ status: "CLOSED_LOST" }, { salesStatus: "CLOSED_LOST" }] } }),
  ]);

  const statusData = statusGroups
    .map((g) => ({ status: g.status, count: g._count._all }))
    .sort((a, b) => b.count - a.count);

  const tierData = tierGroups.map((g) => ({ tier: g.tier, count: g._count._all }));

  const teamData = team
    .map((t) => ({ name: t.name, role: t.role, count: t._count.assignedLeads }))
    .sort((a, b) => b.count - a.count);

  // Aggregate new lead counts day by day for the last 14 days
  const dayBuckets: Record<string, number> = {};
  for (let i = 0; i < 14; i++) {
    const d = new Date(since);
    d.setDate(d.getDate() + i);
    dayBuckets[d.toLocaleDateString("en-US", { day: "2-digit", month: "2-digit" })] = 0;
  }
  recentLeads.forEach((l) => {
    const key = l.createdAt.toLocaleDateString("en-US", { day: "2-digit", month: "2-digit" });
    if (key in dayBuckets) dayBuckets[key] += 1;
  });
  const timeSeries = Object.entries(dayBuckets).map(([date, count]) => ({ date, count }));

  const conversionRate = totalLeads > 0 ? ((closedWon / totalLeads) * 100).toFixed(1) : "0";

  return (
    <DashboardShell title="Reports & Analytics">
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Total Leads" value={totalLeads} icon={<ClipboardList size={18} />} />
        <StatCard label="Transferred to Sales" value={transferred} icon={<Handshake size={18} />} />
        <StatCard label="Contracts" value={closedWon} icon={<CheckCircle2 size={18} />} accent="text-status-won" />
        <StatCard label="Deal Conversion Rate" value={`${conversionRate}%`} icon={<TrendingUp size={18} />} accent="text-accent-soft" />
      </div>

      {/* Full width on its own row — with up to ~10 status categories, a
          rotated label needs more horizontal room than a half-width panel
          can give it without overlapping its neighbors. */}
      <div className="mb-6 glass-panel p-5">
        <p className="mb-4 text-sm font-semibold text-white">Leads by Status</p>
        <StatusBarChart data={statusData} />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="glass-panel p-5">
          <p className="mb-4 text-sm font-semibold text-white">Leads by Tier</p>
          <TierPieChart data={tierData} />
        </div>
        <div className="glass-panel p-5">
          <p className="mb-4 text-sm font-semibold text-white">Team Performance (Current Lead Count)</p>
          <TeamPerformanceChart data={teamData} />
        </div>
      </div>

      <div className="mb-6 glass-panel p-5">
        <p className="mb-4 text-sm font-semibold text-white">New Leads, Last 14 Days</p>
        <LeadsOverTimeChart data={timeSeries} />
      </div>

      <div className="glass-panel p-5">
        <p className="mb-1 text-sm font-semibold text-white">Quick Summary</p>
        <p className="text-xs text-slate-500">
          Lost Deals: {closedLost} — Total Closed Deals: {closedWon + closedLost}
        </p>
      </div>
    </DashboardShell>
  );
}
