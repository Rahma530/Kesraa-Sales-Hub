import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import DashboardShell from "@/components/DashboardShell";
import { can } from "@/lib/permissions";
import { Role } from "@/lib/enums";
import DataUploadButton from "@/components/DataUploadButton";
import AdminDataClient from "./AdminDataClient";

export default async function AdminDataPage() {
  const session = await getServerSession(authOptions);
  if (!session || !can(session.user.role, "VIEW_ALL_TELE_SALES_DATA")) {
    redirect("/");
  }

  const [rows, teleSalesTeam] = await Promise.all([
    prisma.teleSalesData.findMany({
      include: { owner: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.user.findMany({
      where: { role: Role.TELE_SALES, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <DashboardShell title="Data">
      <div className="glass-panel p-5">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white mb-2">Data</h1>
            <p className="text-slate-400 text-sm">
              Raw, self-collected contacts the Tele-Sales team has gathered. Upload a workbook with one sheet
              per employee (sheet name must match the employee's name exactly) to import in bulk.
            </p>
          </div>
          <DataUploadButton />
        </div>
        <AdminDataClient initialRows={rows as any} teleSalesTeam={teleSalesTeam} />
      </div>
    </DashboardShell>
  );
}
