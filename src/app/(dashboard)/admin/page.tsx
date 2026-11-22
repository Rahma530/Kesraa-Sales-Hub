import { Role } from "@/lib/enums";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import DashboardShell from "@/components/DashboardShell";
import StatCard from "@/components/StatCard";
import { ClipboardList, Flame, Calendar, Handshake, CheckCircle2, TrendingUp } from "lucide-react";
import LeadTable from "@/components/LeadTable";
import {
  StatusBarChart,
  TierPieChart,
  TeamPerformanceChart,
  LeadsOverTimeChart,
} from "@/components/ReportsCharts";
import StaleLeadsChecker from "@/components/StaleLeadsChecker";
import AdminTodoList from "@/components/AdminTodoList";
import LeadUploadForm from "@/components/LeadUploadForm";

export default async function AdminDashboard() {
  const session = await getServerSession(authOptions);
  
  const since = new Date();
  since.setDate(since.getDate() - 13);
  since.setHours(0, 0, 0, 0);

  const [
    totalLeads, 
    hotGold, 
    meetingsToday, 
    transferred, 
    closedWon, 
    closedLost,
    statusGroups,
    tierGroups,
    team,
    recentLeads,
    todayFollowUps,
    todayMeetings,
  ] = await Promise.all([
    prisma.lead.count(),
    prisma.lead.count({ where: { tier: { in: ["HOT", "COLD"] } } }),
    prisma.meeting.count({
      where: {
        scheduledAt: {
          gte: new Date(new Date().setHours(0, 0, 0, 0)),
          lt: new Date(new Date().setHours(23, 59, 59, 999)),
        },
      },
    }),
    prisma.lead.count({ where: { status: "TRANSFERRED_TO_SALES" } }),
    // A deal can be closed from the Tele-Sales `status` field (Admin/Head
    // closing on an employee's behalf) or from `salesStatus` (the normal
    // case: Sales closes it themselves) — count both.
    prisma.lead.count({ where: { OR: [{ status: "CLOSED_WON" }, { salesStatus: "CLOSED_WON" }] } }),
    prisma.lead.count({ where: { status: "CLOSED_LOST" } }),
    prisma.lead.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.lead.groupBy({ by: ["tier"], _count: { _all: true } }),
    prisma.user.findMany({
      where: { role: { in: [Role.TELE_SALES, Role.SALES] }, isActive: true },
      select: { id: true, name: true, role: true, _count: { select: { assignedLeads: true } } },
    }),
    prisma.lead.findMany({
      where: { createdAt: { gte: since } },
      select: { createdAt: true },
      // Naturally bounded to a 14-day window and a single scalar field
      // already, but a defensive cap costs nothing and avoids relying on
      // "the window is always small" as the only safety net.
      take: 20000,
    }),
    prisma.followUp.findMany({
      where: {
        isCompleted: false,
        scheduledDate: {
          gte: new Date(new Date().setHours(0, 0, 0, 0)),
          lt: new Date(new Date().setHours(23, 59, 59, 999)),
        }
      },
      include: {
        lead: { select: { id: true, name: true, phone: true, assignedTo: { select: { name: true } } } }
      }
    }),
    prisma.meeting.findMany({
      where: {
        status: "SCHEDULED",
        scheduledAt: {
          gte: new Date(new Date().setHours(0, 0, 0, 0)),
          lt: new Date(new Date().setHours(23, 59, 59, 999)),
        }
      },
      include: {
        lead: { select: { id: true, name: true, phone: true, assignedTo: { select: { name: true } } } }
      }
    }),
  ]);

  // IMPORTANT: this used to run 6 separate queries *per employee* in a
  // loop (team.map(async (emp) => { ...6 awaits... })) — with 20-30
  // employees, that's 120-180 sequential round-trips to the database on
  // every single load of this page, each one holding a pooled connection
  // while it runs. Same category of problem as the notifications fix:
  // not "too much data", but "too many separate queries that should have
  // been one". Below, each metric is computed once, for every employee at
  // the same time (via groupBy, or a single findMany with `distinct` for
  // the one case groupBy can't express directly), then looked up per
  // employee from a Map — 6 queries total, regardless of team size.
  const teamIds = team.map((t) => t.id);

  const [
    distinctLeadRows,
    transferredGroups,
    wonGroups,
    enteredMeetingsGroups,
    followUpsGroups,
    uploadedContractsGroups,
  ] = await Promise.all([
    // groupBy can't do "count distinct leadId per userId" directly, so we
    // still need the actual (userId, leadId) pairs — but as ONE query for
    // the whole team instead of one findMany per employee.
    prisma.activity.findMany({
      where: { userId: { in: teamIds } },
      distinct: ["userId", "leadId"],
      select: { userId: true, leadId: true },
    }),
    prisma.activity.groupBy({
      by: ["userId"],
      where: { userId: { in: teamIds }, type: "TRANSFERRED" },
      _count: { _all: true },
    }),
    // A deal can be closed from the Tele-Sales `status` field (Admin/Head
    // closing on the employee's behalf) or from `salesStatus` (the normal
    // case: Sales closes it themselves) — count both.
    prisma.lead.groupBy({
      by: ["assignedToId"],
      where: {
        assignedToId: { in: teamIds },
        OR: [{ status: "CLOSED_WON" }, { salesStatus: "CLOSED_WON" }],
      },
      _count: { _all: true },
    }),
    // Meetings actually held (not just scheduled).
    prisma.meeting.groupBy({
      by: ["ownerId"],
      where: { ownerId: { in: teamIds }, status: "DONE" },
      _count: { _all: true },
    }),
    prisma.followUp.groupBy({
      by: ["createdById"],
      where: { createdById: { in: teamIds } },
      _count: { _all: true },
    }),
    prisma.activity.groupBy({
      by: ["userId"],
      where: { userId: { in: teamIds }, type: "UPLOAD_CONTRACT" },
      _count: { _all: true },
    }),
  ]);

  const actionCountByUserId = new Map<string, number>();
  for (const row of distinctLeadRows) {
    actionCountByUserId.set(row.userId, (actionCountByUserId.get(row.userId) ?? 0) + 1);
  }
  const transferredByUserId = new Map(transferredGroups.map((g) => [g.userId, g._count._all]));
  const wonByUserId = new Map(wonGroups.map((g) => [g.assignedToId as string, g._count._all]));
  const enteredMeetingsByUserId = new Map(enteredMeetingsGroups.map((g) => [g.ownerId, g._count._all]));
  const followUpsByUserId = new Map(followUpsGroups.map((g) => [g.createdById, g._count._all]));
  const uploadedContractsByUserId = new Map(uploadedContractsGroups.map((g) => [g.userId, g._count._all]));

  const teamWithActions = team.map((emp) => ({
    ...emp,
    actionCount: actionCountByUserId.get(emp.id) ?? 0,
    transferredCount: transferredByUserId.get(emp.id) ?? 0,
    wonCount: wonByUserId.get(emp.id) ?? 0,
    enteredMeetingsCount: enteredMeetingsByUserId.get(emp.id) ?? 0,
    followUpsCount: followUpsByUserId.get(emp.id) ?? 0,
    uploadedContractsCount: uploadedContractsByUserId.get(emp.id) ?? 0,
  }));

  const statusData = statusGroups
    .map((g) => ({ status: g.status, count: g._count._all }))
    .sort((a, b) => b.count - a.count);

  const tierData = tierGroups.map((g) => ({ tier: g.tier, count: g._count._all }));

  const teamData = team
    .map((t) => ({ name: t.name, role: t.role, count: t._count.assignedLeads }))
    .sort((a, b) => b.count - a.count);

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
    <DashboardShell title="لوحة تحكم الإدارة">
      <StaleLeadsChecker />

      {/* Same quick add/upload panel Tele-Sales and Sales see on their own
          dashboards, so every role has an obvious, immediate way to add a
          lead without having to go to Lead Management first. The richer
          column-mapping bulk-upload flow still lives there for larger
          imports. */}
      <LeadUploadForm />
      <div className="h-6" />

      <AdminTodoList followUps={todayFollowUps} meetings={todayMeetings} />

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-6">
        <StatCard label="إجمالي الـ Leads" value={totalLeads} icon={<ClipboardList size={18} />} />
        <StatCard label="Hot / Cold" value={hotGold} icon={<Flame size={18} />} accent="text-status-hot" />
        <StatCard label="اجتماعات اليوم" value={meetingsToday} icon={<Calendar size={18} />} />
        <StatCard label="تم التحويل" value={transferred} icon={<Handshake size={18} />} />
        <StatCard label="العقود" value={closedWon} icon={<CheckCircle2 size={18} />} accent="text-status-won" />
        <StatCard label="نسبة التحويل" value={`${conversionRate}%`} icon={<TrendingUp size={18} />} accent="text-accent-soft" />
      </div>

      {/* Full width on its own row — with up to ~10 status categories, a
          rotated label needs more horizontal room than a half-width panel
          can give it without overlapping its neighbors. */}
      <div className="mb-6 glass-panel p-5">
        <p className="mb-4 text-sm font-semibold text-white">الـ Leads حسب Status</p>
        <StatusBarChart data={statusData} />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="glass-panel p-5">
          <p className="mb-4 text-sm font-semibold text-white">الـ Leads حسب Tier</p>
          <TierPieChart data={tierData} />
        </div>
        <div className="glass-panel p-5">
          <p className="mb-4 text-sm font-semibold text-white">أداء الفريق (عدد الـ Leads الحالي)</p>
          <TeamPerformanceChart data={teamData} />
        </div>
      </div>

      <div className="mb-6 glass-panel p-5">
        <p className="mb-4 text-sm font-semibold text-white">Leads جديدة، آخر 14 يوم</p>
        <LeadsOverTimeChart data={timeSeries} />
      </div>

      <div className="mb-6 glass-panel p-5">
        <p className="mb-4 text-sm font-semibold text-white">تفاصيل أداء الفريق (تتبع الإجراءات)</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {teamWithActions.map((emp) => (
            <div key={emp.name} className="rounded-xl bg-white/[0.03] p-4 border border-white/5 relative overflow-hidden group hover:border-white/10 transition">
              <div className="absolute top-0 right-0 h-full w-1 bg-accent/50"></div>
              <p className="text-sm text-slate-200 font-bold truncate pr-2">{emp.name}</p>
              <p className="text-[11px] text-slate-500 mb-4 pr-2">
                {emp.role === "TELE_SALES" ? "Tele-Sales" : (emp.role === "SALES" ? "Sales" : emp.role)}
              </p>

              <div className="flex flex-col gap-3 mt-3 pt-3 border-t border-white/5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] text-slate-500 font-medium">الإجمالي المُستلم</p>
                    <p className="text-lg font-bold text-white mt-0.5">{emp._count.assignedLeads}</p>
                  </div>
                  <div className="text-left">
                    <p className="text-[10px] text-emerald-500/80 font-medium">تم اتخاذ إجراء</p>
                    <p className="text-lg font-bold text-emerald-400 mt-0.5">{emp.actionCount}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-white/[0.02] pt-2">
                  {emp.role === "TELE_SALES" ? (
                    <div className="text-right w-full">
                      <p className="text-[10px] text-purple-500/80 font-medium">تم التحويل لـ Sales</p>
                      <p className="text-lg font-bold text-purple-400 mt-0.5">{emp.transferredCount}</p>
                    </div>
                  ) : (
                    <>
                      <div className="text-right">
                        <p className="text-[10px] text-emerald-500/80 font-medium">العقود</p>
                        <p className="text-lg font-bold text-emerald-400 mt-0.5">{emp.wonCount}</p>
                      </div>
                      <div className="text-left">
                        <p className="text-[10px] text-blue-500/80 font-medium">اجتماعات تمت</p>
                        <p className="text-lg font-bold text-blue-400 mt-0.5">{emp.enteredMeetingsCount}</p>
                      </div>
                    </>
                  )}
                </div>

                {emp.role === "SALES" && (
                  <div className="flex items-center justify-between border-t border-white/[0.02] pt-2">
                    <div className="text-right">
                      <p className="text-[10px] text-amber-500/80 font-medium">Follow-ups مجدولة</p>
                      <p className="text-lg font-bold text-amber-400 mt-0.5">{emp.followUpsCount}</p>
                    </div>
                    <div className="text-left">
                      <p className="text-[10px] text-accent/80 font-medium">عقود مرفوعة</p>
                      <p className="text-lg font-bold text-accent-soft mt-0.5">{emp.uploadedContractsCount}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      
    </DashboardShell>
  );
}
