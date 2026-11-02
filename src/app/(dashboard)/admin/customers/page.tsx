import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import AdminCustomersClient from "@/app/(dashboard)/admin/customers/AdminCustomersClient";

import DashboardShell from "@/components/DashboardShell";

export default async function AdminCustomersPage() {
  const session = await getServerSession(authOptions);
  
  // Only Admin and the Heads can access this
  if (
    !session ||
    (session.user.role !== "ADMIN" &&
      session.user.role !== "HEAD_OF_SALES" &&
      session.user.role !== "HEAD_OF_TELE_SALES")
  ) {
    redirect("/");
  }

  const leads = await prisma.lead.findMany({
    include: {
      assignedTo: { select: { id: true, name: true, role: true } },
      followUps: { where: { isCompleted: false }, orderBy: { scheduledDate: "asc" } },
      meetings: { orderBy: { scheduledAt: "desc" }, take: 1 },
      activities: { orderBy: { createdAt: "desc" }, take: 8, include: { user: { select: { name: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Fetch all employees (Sales & TeleSales)
  const employees = await prisma.user.findMany({
    where: {
      role: {
        in: ["TELE_SALES", "SALES"],
      },
    },
    select: {
      id: true,
      name: true,
      role: true,
    },
  });

  const salesTeam = await prisma.user.findMany({
    where: { role: "SALES", isActive: true },
    select: { id: true, name: true, lastActiveAt: true },
  });

  return (
    <DashboardShell title="Lead Management">
      <AdminCustomersClient 
        initialLeads={JSON.parse(JSON.stringify(leads))} 
        employees={JSON.parse(JSON.stringify(employees))} 
        salesTeam={JSON.parse(JSON.stringify(salesTeam))}
        canDelete={session.user.role === "ADMIN"}
      />
    </DashboardShell>
  );
}
