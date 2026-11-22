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

  // Leads are no longer fetched in bulk here: both tabs of
  // AdminCustomersClient (Lead Distribution and Lead Follow-up) now fetch
  // their own independent, paginated pages from /api/leads client-side.
  // This used to be the single heaviest unbounded query in the app —
  // every Lead, with nested assignedTo/followUps/meetings/activities,
  // loaded on every visit to this page regardless of lead volume.

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
        employees={JSON.parse(JSON.stringify(employees))}
        salesTeam={JSON.parse(JSON.stringify(salesTeam))}
        canDelete={session.user.role === "ADMIN"}
      />
    </DashboardShell>
  );
}
