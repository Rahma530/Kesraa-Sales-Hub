import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import DashboardShell from "@/components/DashboardShell";
import SheetsClient from "./SheetsClient";

export default async function AdminSheetsPage() {
  const session = await getServerSession(authOptions);
  if (
    !session ||
    (session.user.role !== "ADMIN" &&
      session.user.role !== "HEAD_OF_SALES" &&
      session.user.role !== "HEAD_OF_TELE_SALES")
  ) {
    redirect("/");
  }

  const batches = await prisma.uploadBatch.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      uploadedBy: { select: { name: true } },
      _count: { select: { leads: true } },
    },
  });

  return (
    <DashboardShell title="Sheets Management">
      <SheetsClient initialBatches={batches} />
    </DashboardShell>
  );
}
