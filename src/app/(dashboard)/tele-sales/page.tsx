import { Role } from "@/lib/enums";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import DashboardShell from "@/components/DashboardShell";
import StatCard from "@/components/StatCard";
import { User, Pin, Clock, CheckCircle2 } from "lucide-react";
import LeadTable from "@/components/LeadTable";


import TeleSalesClient from "./TeleSalesClient";
import FollowUpReminderChecker from "@/components/FollowUpReminderChecker";

export default async function TeleSalesDashboard() {
  const session = await getServerSession(authOptions);
  const userId = session!.user.id;

  // Shared by the list below and the total-count query — an employee's
  // leads are either currently assigned to them, or ones they transferred
  // to Sales in the past (so they still show up here after handoff).
  const myLeadsWhere = {
    OR: [
      { assignedToId: userId },
      {
        activities: {
          some: {
            userId: userId,
            type: "TRANSFERRED",
          },
        },
      },
    ],
  };

  const [myLeads, totalLeadsCount, needsFollowUp, transferred, todaysFollowUps, salesTeam] = await Promise.all([
    prisma.lead.findMany({
      where: myLeadsWhere,
      include: {
        assignedTo: { select: { id: true, name: true, role: true } },
        followUps: { where: { isCompleted: false }, orderBy: { scheduledDate: "asc" } },
        meetings: { orderBy: { scheduledAt: "desc" }, take: 1 },
        activities: { orderBy: { createdAt: "desc" }, take: 8, include: { user: { select: { name: true } } } },
      },
      orderBy: { updatedAt: "desc" },
      // Temporary safety cap (most recently updated first) while this
      // page still loads its list in one shot rather than paginating —
      // see the Lead Management pagination work for the full fix.
      take: 150,
    }),
    // The stat card needs the TRUE total, not the capped list length above.
    prisma.lead.count({ where: myLeadsWhere }),
    prisma.lead.count({ where: { assignedToId: userId, status: "NEEDS_FOLLOWUP" } }),
    prisma.lead.count({ where: { activities: { some: { userId: userId, type: "TRANSFERRED" } } } }),
    prisma.followUp.count({
      where: {
        createdById: userId,
        isCompleted: false,
        scheduledDate: {
          gte: new Date(new Date().setHours(0, 0, 0, 0)),
          lt: new Date(new Date().setHours(23, 59, 59, 999)),
        },
      },
    }),
    prisma.user.findMany({
      where: { role: Role.SALES, isActive: true },
      select: { id: true, name: true, lastActiveAt: true },
    }),
  ]);

  return (
    <DashboardShell title="Tele-Sales Dashboard">
      <FollowUpReminderChecker />

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Total Leads" value={totalLeadsCount} icon={<User size={18} />} />
        <StatCard label="Today's Follow-ups" value={todaysFollowUps} icon={<Pin size={18} />} accent="text-accent-soft" />
        <StatCard label="Needs Follow-up" value={needsFollowUp} icon={<Clock size={18} />} accent="text-status-gold" />
        <StatCard label="Successfully Transferred" value={transferred} icon={<CheckCircle2 size={18} />} accent="text-status-won" />
      </div>

      <div className="glass-panel p-5">
        <TeleSalesClient leads={myLeads as any} salesTeam={salesTeam} />
      </div>
    </DashboardShell>
  );
}
