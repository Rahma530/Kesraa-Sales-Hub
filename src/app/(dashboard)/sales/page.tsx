import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import DashboardShell from "@/components/DashboardShell";
import StatCard from "@/components/StatCard";
import { Handshake, Calendar, Trophy, Video, CalendarCheck, FileText } from "lucide-react";
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
    // A deal can be closed either from the lead's Tele-Sales `status` field
    // (if Admin/Head closes it on the employee's behalf) or from `salesStatus`
    // (the normal case: the Sales owner closes it themselves) — count both.
    prisma.lead.count({
      where: { assignedToId: userId, OR: [{ status: "CLOSED_WON" }, { salesStatus: "CLOSED_WON" }] },
    }),
    // Meetings actually held (not just scheduled) by this employee.
    prisma.meeting.count({ where: { ownerId: userId, status: "DONE" } }),
    prisma.followUp.count({ where: { createdById: userId } }),
    prisma.activity.count({ where: { userId: userId, type: "UPLOAD_CONTRACT" } }),
  ]);

  return (
    <DashboardShell title="Sales Dashboard">
      <FollowUpReminderChecker />

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Total Leads" value={myLeads.length} icon={<Handshake size={18} />} />
        <StatCard label="Today's Meetings" value={meetingsToday} icon={<Calendar size={18} />} accent="text-accent-soft" />
        <StatCard label="Contracts" value={closedWon} icon={<Trophy size={18} />} accent="text-status-won" />
        <StatCard label="Meetings Attended" value={enteredMeetings} icon={<Video size={18} />} accent="text-blue-400" />
        <StatCard label="Follow-ups Scheduled" value={followUpsScheduled} icon={<CalendarCheck size={18} />} accent="text-amber-400" />
        <StatCard label="Contracts Uploaded" value={uploadedContracts} icon={<FileText size={18} />} accent="text-accent-soft" />
      </div>

      <div className="glass-panel p-5">
        <SalesClient leads={myLeads as any} />
      </div>
    </DashboardShell>
  );
}
