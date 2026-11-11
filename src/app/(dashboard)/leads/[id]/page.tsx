import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { can, isManagementRole } from "@/lib/permissions";
import { Role } from "@/lib/enums";
import { prisma } from "@/lib/prisma";
import DashboardShell from "@/components/DashboardShell";
import LeadDetailClient from "@/app/(dashboard)/leads/[id]/LeadDetailClient";

export const dynamic = "force-dynamic";

export default async function LeadDashboardPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const role = session.user.role as Role;

  const lead = await prisma.lead.findUnique({
    where: { id: params.id },
    include: {
      assignedTo: { select: { id: true, name: true, role: true } },
      meetings: { orderBy: { scheduledAt: "desc" }, include: { owner: { select: { name: true } } } },
      followUps: { orderBy: { scheduledDate: "asc" } },
      activities: { orderBy: { createdAt: "desc" }, include: { user: { select: { name: true } } } },
    },
  });

  if (!lead) notFound();

  // Same access rule used everywhere else: management roles see everything,
  // everyone else only sees leads assigned to them.
  if (!isManagementRole(role) && lead.assignedToId !== session.user.id) {
    redirect("/unauthorized");
  }

  // Matches the exact same flags LeadTable is given on every other page
  // (TeleSalesClient / SalesClient / AdminCustomersClient) so this page's
  // actions behave identically to the dropdown version of them.
  const isSalesView = role === Role.SALES;
  const allowTransfer = can(role, "TRANSFER_TO_SALES");
  const canDelete = can(role, "DELETE_LEAD");

  const salesTeam = allowTransfer
    ? await prisma.user.findMany({
        where: { role: "SALES", isActive: true },
        select: { id: true, name: true, lastActiveAt: true },
      })
    : [];

  return (
    <DashboardShell title={lead.name}>
      <LeadDetailClient
        lead={JSON.parse(JSON.stringify(lead))}
        isSalesView={isSalesView}
        allowTransfer={allowTransfer}
        canDelete={canDelete}
        salesTeam={JSON.parse(JSON.stringify(salesTeam))}
      />
    </DashboardShell>
  );
}
