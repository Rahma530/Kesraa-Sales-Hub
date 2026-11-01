import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import DashboardShell from "@/components/DashboardShell";
import UserManagementTable from "@/components/UserManagementTable";

export default async function UsersPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/unauthorized");

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      username: true,
      email: true,
      phone: true,
      role: true,
      isActive: true,
      createdAt: true,
      _count: { select: { assignedLeads: true } },
    },
  });

  const serialized = users.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() }));

  return (
    <DashboardShell title="Employee Management">
      <UserManagementTable users={serialized as any} currentUserId={session.user.id} />
    </DashboardShell>
  );
}
