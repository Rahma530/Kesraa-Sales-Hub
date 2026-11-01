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
    prisma.lead.count({ where: { status: "CLOSED_WON" } }),
    prisma.lead.count({ where: { status: "CLOSED_LOST" } }),
  ]);

  const statusData = statusGroups
    .map((g) => ({ status: g.status, count: g._count._all }))
    .sort((a, b) => b.count - a.count);

  const tierData = tierGroups.map((g) => ({ tier: g.tier, count: g._count._all }));

  const teamData = team
    .map((t) => ({ name: t.name, role: t.role, count: t._count.assignedLeads }))
    .sort((a, b) => b.count - a.count);

  // تجميع عدد الليدز الجديدة يوم بيوم لآخر 14 يوم
  const dayBuckets: Record<string, number> = {};
  for (let i = 0; i < 14; i++) {
    const d = new Date(since);
    d.setDate(d.getDate() + i);
    dayBuckets[d.toLocaleDateString("ar-EG", { day: "2-digit", month: "2-digit" })] = 0;
  }
  recentLeads.forEach((l) => {
    const key = l.createdAt.toLocaleDateString("ar-EG", { day: "2-digit", month: "2-digit" });
    if (key in dayBuckets) dayBuckets[key] += 1;
  });
  const timeSeries = Object.entries(dayBuckets).map(([date, count]) => ({ date, count }));

  const conversionRate = totalLeads > 0 ? ((closedWon / totalLeads) * 100).toFixed(1) : "0";

  return (
    <DashboardShell title="التقارير والتحليلات">
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="إجمالي الليدز" value={totalLeads} icon={<ClipboardList size={18} />} />
        <StatCard label="تم التحويل لـ Sales" value={transferred} icon={<Handshake size={18} />} />
        <StatCard label="العقود" value={closedWon} icon={<CheckCircle2 size={18} />} accent="text-status-won" />
        <StatCard label="نسبة التحويل لصفقة" value={`${conversionRate}%`} icon={<TrendingUp size={18} />} accent="text-accent-soft" />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="glass-panel p-5">
          <p className="mb-4 text-sm font-semibold text-white">توزيع الليدز حسب الحالة</p>
          <StatusBarChart data={statusData} />
        </div>
        <div className="glass-panel p-5">
          <p className="mb-4 text-sm font-semibold text-white">توزيع الليدز حسب التصنيف</p>
          <TierPieChart data={tierData} />
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="glass-panel p-5">
          <p className="mb-4 text-sm font-semibold text-white">أداء الفريق (عدد الليدز الحالية)</p>
          <TeamPerformanceChart data={teamData} />
        </div>
        <div className="glass-panel p-5">
          <p className="mb-4 text-sm font-semibold text-white">ليدز جديدة آخر 14 يوم</p>
          <LeadsOverTimeChart data={timeSeries} />
        </div>
      </div>

      <div className="glass-panel p-5">
        <p className="mb-1 text-sm font-semibold text-white">ملخص سريع</p>
        <p className="text-xs text-slate-500">
          صفقات خاسرة: {closedLost} — إجمالي الصفقات المغلقة: {closedWon + closedLost}
        </p>
      </div>
    </DashboardShell>
  );
}
