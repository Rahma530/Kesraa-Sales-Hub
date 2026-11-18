import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import DashboardShell from "@/components/DashboardShell";
import AdsLeadsClient from "./AdsLeadsClient";
import { can } from "@/lib/permissions";

export default async function AdsLeadsPage() {
  const session = await getServerSession(authOptions);
  if (!session || !can(session.user.role, "MANAGE_ADS_SHEET")) {
    redirect("/");
  }

  const config = await prisma.adsSheetConfig.findUnique({ where: { id: "singleton" } });

  return (
    <DashboardShell title="Ads Leads">
      <AdsLeadsClient initialConfig={config} />
    </DashboardShell>
  );
}
