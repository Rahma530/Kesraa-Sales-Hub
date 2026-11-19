import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { fetchSheetRows, mapSheetRowsToLeads } from "@/lib/google-sheets";
import { LeadSource } from "@/lib/enums";
import { distributeLeads } from "@/lib/lead-distribution";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session || !can(session.user.role, "MANAGE_ADS_SHEET")) {
    return NextResponse.json({ error: "You are not authorized to perform this action" }, { status: 403 });
  }

  const config = await prisma.adsSheetConfig.findUnique({ where: { id: "singleton" } });
  if (!config) {
    return NextResponse.json({ error: "No Ads Sheet link has been set yet" }, { status: 400 });
  }

  let rows: string[][];
  try {
    rows = await fetchSheetRows(config.sheetUrl);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }

  const candidates = mapSheetRowsToLeads(rows);

  let result: Awaited<ReturnType<typeof distributeLeads>> | null = null;
  if (candidates.length > 0) {
    try {
      // رقم الهاتف unique على مستوى الـ Lead كله، فده هو معيار "جديد"
      // الوحيد اللي محتاجينه — distributeLeads بتستبعد أي رقم موجود بالفعل
      // في النظام تلقائيًا، من غير أي اعتماد على أعمدة تانية في الشيت
      // (الشيت نفسه مش بيتسجل فيه حاجة من النظام).
      result = await distributeLeads(candidates, session.user.id, LeadSource.ADS_SHEET);
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
  }

  const newCount = result?.insertedCount ?? 0;

  await prisma.adsSheetConfig.update({
    where: { id: "singleton" },
    data: { lastSyncedAt: new Date(), lastSyncCount: newCount },
  });

  return NextResponse.json({
    success: true,
    newCount,
    skippedCount: candidates.length - newCount,
  });
}
