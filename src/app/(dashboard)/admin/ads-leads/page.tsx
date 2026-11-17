import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import DashboardShell from "@/components/DashboardShell";
import AdsLeadsClient from "./AdsLeadsClient";
import { can } from "@/lib/permissions";
import { PENDING_REVIEW_STAGE, Role } from "@/lib/enums";

export default async function AdsLeadsPage() {
  const session = await getServerSession(authOptions);
  if (!session || !can(session.user.role, "MANAGE_ADS_SHEET")) {
    redirect("/");
  }

  const [config, pendingLeads, teleSalesTeam] = await Promise.all([
    prisma.adsSheetConfig.findUnique({ where: { id: "singleton" } }),
    prisma.lead.findMany({
      where: { currentStage: PENDING_REVIEW_STAGE },
      orderBy: { createdAt: "desc" },
    }),
    prisma.user.findMany({
      where: { role: Role.TELE_SALES, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <DashboardShell title="Ads Leads">
      <AdsLeadsClient
        initialConfig={config}
        initialPendingLeads={pendingLeads}
        teleSalesTeam={teleSalesTeam}
      />
    </DashboardShell>
  );
}
