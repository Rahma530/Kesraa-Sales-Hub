import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { can, teamRoleForManager } from "@/lib/permissions";
import { Role } from "@/lib/enums";
import { prisma } from "@/lib/prisma";
import DashboardShell from "@/components/DashboardShell";
import UserManagementTable from "@/components/UserManagementTable";

export default async function UsersPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (!can(session.user.role as Role, "MANAGE_TEAM_USERS")) redirect("/unauthorized");

  // null = unrestricted (Admin). A Role value = this manager only sees/manages
  // employees of that team (Head of Sales → Sales, Head of Tele-Sales → Tele-Sales).
  const managedRole = teamRoleForManager(session.user.role as Role);

  const users = await prisma.user.findMany({
    where: managedRole ? { role: managedRole } : undefined,
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
      passwordHash: true,
      _count: { select: { assignedLeads: true } },
    },
  });

  // Never send the hash itself to the client — just whether the account
  // still needs to go through the invite flow.
  const serialized = users.map(({ passwordHash, ...u }) => ({
    ...u,
    needsActivation: !passwordHash,
    createdAt: u.createdAt.toISOString(),
  }));

  return (
    <DashboardShell title="Employee Management">
      <UserManagementTable
        users={serialized as any}
        currentUserId={session.user.id}
        managedRole={managedRole ?? null}
      />
    </DashboardShell>
  );
}
