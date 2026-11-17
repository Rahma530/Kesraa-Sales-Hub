import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { fetchSheetRows, mapSheetRowsToLeads } from "@/lib/google-sheets";
import { LeadSource, PENDING_REVIEW_STAGE } from "@/lib/enums";

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

  if (candidates.length === 0) {
    await prisma.adsSheetConfig.update({
      where: { id: "singleton" },
      data: { lastSyncedAt: new Date(), lastSyncCount: 0 },
    });
    return NextResponse.json({ success: true, newCount: 0, skippedCount: 0 });
  }

  // رقم الهاتف unique على مستوى الـ Lead كله، فده هو معيار "جديد" الوحيد
  // اللي محتاجينه — أي رقم مش موجود في النظام أصلاً يبقى جديد، من غير أي
  // اعتماد على أعمدة تانية في الشيت (زي tele name) لأن الشيت نفسه مش
  // بيتسجل فيه حاجة من النظام.
  const existing = await prisma.lead.findMany({
    where: { phone: { in: candidates.map((c) => c.phone) } },
    select: { phone: true },
  });
  const existingPhones = new Set(existing.map((l: { phone: string }) => l.phone));

  const seenInThisSync = new Set<string>();
  const toInsert = candidates.filter((c) => {
    if (existingPhones.has(c.phone) || seenInThisSync.has(c.phone)) return false;
    seenInThisSync.add(c.phone);
    return true;
  });

  let newCount = 0;
  if (toInsert.length > 0) {
    const created = await prisma.lead.createMany({
      data: toInsert.map((lead) => ({
        name: lead.name,
        phone: lead.phone,
        need: lead.need ?? null,
        storeUrl: lead.storeUrl ?? null,
        socialMediaUrl: lead.socialMediaUrl ?? null,
        acquisitionType: lead.acquisitionType ?? null,
        platform: lead.platform ?? null,
        source: LeadSource.ADS_SHEET,
        // لسه من غير مسؤول — هيتحدد لما Head of Tele-Sales تراجعه وتوزعه
        assignedToId: null,
        currentStage: PENDING_REVIEW_STAGE,
        status: "NEW",
        createdById: session.user.id,
      })),
      skipDuplicates: true,
    });
    newCount = created.count;
  }

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
