import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import DashboardShell from "@/components/DashboardShell";
import TeleSalesDataTable from "@/components/TeleSalesDataTable";

export default async function MyDataPage() {
  const session = await getServerSession(authOptions);
  const userId = session!.user.id;

  const rows = await prisma.teleSalesData.findMany({
    where: { ownerId: userId },
    orderBy: { createdAt: "desc" },
  });

  return (
    <DashboardShell title="My Data">
      <div className="glass-panel p-5">
        <h1 className="text-2xl font-bold text-white mb-2">My Data</h1>
        <p className="text-slate-400 text-sm mb-6">
          Contacts you've collected yourself, uploaded from your sheet. Tick off what actually happened on
          each call.
        </p>
        <TeleSalesDataTable initialRows={rows as any} />
      </div>
    </DashboardShell>
  );
}
