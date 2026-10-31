import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import DashboardShell from "@/components/DashboardShell";
import StatCard from "@/components/StatCard";
import SalesClient from "./SalesClient";
import FollowUpReminderChecker from "@/components/FollowUpReminderChecker";

export default async function SalesDashboard() {
  const session = await getServerSession(authOptions);
  const userId = session!.user.id;

  const [myLeads, meetingsToday, closedWon, enteredMeetings, followUpsScheduled, uploadedContracts] = await Promise.all([
    prisma.lead.findMany({
      where: { assignedToId: userId },
      include: {
        assignedTo: { select: { id: true, name: true, role: true } },
        followUps: { where: { isCompleted: false }, orderBy: { scheduledDate: "asc" } },
        meetings: { orderBy: { scheduledAt: "desc" }, take: 1 },
        activities: { orderBy: { createdAt: "desc" }, take: 8, include: { user: { select: { name: true } } } },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.meeting.count({
      where: {
        ownerId: userId,
        status: "SCHEDULED",
        scheduledAt: {
          gte: new Date(new Date().setHours(0, 0, 0, 0)),
          lt: new Date(new Date().setHours(23, 59, 59, 999)),
        },
      },
    }),
    prisma.lead.count({ where: { assignedToId: userId, status: "CLOSED_WON" } }),
    prisma.activity.count({ where: { userId: userId, type: "MEETING" } }),
    prisma.followUp.count({ where: { createdById: userId } }),
    prisma.activity.count({ where: { userId: userId, type: "UPLOAD_CONTRACT" } }),
  ]);

  return (
    <DashboardShell title="لوحة المبيعات (Sales)">
      <FollowUpReminderChecker />

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <StatCard label="إجمالي عملائي" value={myLeads.length} icon="🤝" />
        <StatCard label="مواعيد الميتنج اليوم" value={meetingsToday} icon="📅" accent="text-accent-soft" />
        <StatCard label="العقود" value={closedWon} icon="🤑" accent="text-status-won" />
        <StatCard label="تم دخول ميتنج" value={enteredMeetings} icon="📹" accent="text-blue-400" />
        <StatCard label="تم تحديد متابعة" value={followUpsScheduled} icon="📆" accent="text-amber-400" />
        <StatCard label="عقود مرفوعة" value={uploadedContracts} icon="📄" accent="text-indigo-400" />
      </div>

      <div className="glass-panel p-5">
        <SalesClient leads={myLeads as any} />
      </div>
    </DashboardShell>
  );
}
