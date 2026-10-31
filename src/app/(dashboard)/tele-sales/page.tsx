import { Role } from "@/lib/enums";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import DashboardShell from "@/components/DashboardShell";
import StatCard from "@/components/StatCard";
import LeadTable from "@/components/LeadTable";


import TeleSalesClient from "./TeleSalesClient";
import FollowUpReminderChecker from "@/components/FollowUpReminderChecker";

export default async function TeleSalesDashboard() {
  const session = await getServerSession(authOptions);
  const userId = session!.user.id;

  const [myLeads, needsFollowUp, transferred, todaysFollowUps, salesTeam] = await Promise.all([
    prisma.lead.findMany({
      where: {
        OR: [
          { assignedToId: userId },
          {
            activities: {
              some: {
                userId: userId,
                type: "TRANSFERRED"
              }
            }
          }
        ]
      },
      include: {
        assignedTo: { select: { id: true, name: true, role: true } },
        followUps: { where: { isCompleted: false }, orderBy: { scheduledDate: "asc" } },
        meetings: { orderBy: { scheduledAt: "desc" }, take: 1 },
        activities: { orderBy: { createdAt: "desc" }, take: 8, include: { user: { select: { name: true } } } },
      },
      orderBy: { updatedAt: "desc" },
    }),
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
    <DashboardShell title="لوحة العمليات (Tele-Sales)">
      <FollowUpReminderChecker />

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="إجمالي عملائي" value={myLeads.length} icon="👤" />
        <StatCard label="متابعات اليوم" value={todaysFollowUps} icon="📌" accent="text-accent-soft" />
        <StatCard label="يحتاجون متابعة" value={needsFollowUp} icon="⏰" accent="text-status-gold" />
        <StatCard label="تم التحويل بنجاح" value={transferred} icon="✅" accent="text-status-won" />
      </div>

      <div className="glass-panel p-5">
        <TeleSalesClient leads={myLeads as any} salesTeam={salesTeam} />
      </div>
    </DashboardShell>
  );
}
