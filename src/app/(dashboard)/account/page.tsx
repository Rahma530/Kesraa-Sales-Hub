import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import DashboardShell from "@/components/DashboardShell";
import ChangePasswordForm from "@/components/ChangePasswordForm";
import EditProfileForm from "@/components/EditProfileForm";
import { prisma } from "@/lib/prisma";

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Admin",
  HEAD_OF_SALES: "Head of Sales",
  HEAD_OF_TELE_SALES: "Head of Tele-Sales",
  TELE_SALES: "Tele-Sales",
  SALES: "Sales",
};

export default async function AccountPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, email: true, phone: true, role: true }
  });
  
  if (!user) redirect("/login");

  return (
    <DashboardShell title="My Account">
      <div className="mb-6 max-w-md">
        <div className="flex items-center gap-4 mb-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent text-white font-bold text-2xl shadow-inner border-2 border-white/10">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">{user.name}</h2>
            <p className="text-sm text-slate-400">{ROLE_LABELS[user.role] ?? user.role}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        <EditProfileForm user={user} />
        <ChangePasswordForm />
      </div>
    </DashboardShell>
  );
}
