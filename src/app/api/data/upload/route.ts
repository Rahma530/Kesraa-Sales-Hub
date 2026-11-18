import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/enums";
import { parseTeleSalesDataWorkbook } from "@/lib/tele-sales-data-upload";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !can(session.user.role, "UPLOAD_TELE_SALES_DATA")) {
    return NextResponse.json({ error: "You are not authorized to perform this action" }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "Please choose a file" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let parsed;
  try {
    parsed = parseTeleSalesDataWorkbook(buffer);
  } catch (e: any) {
    return NextResponse.json({ error: "Couldn't read this file — make sure it's a valid Excel workbook." }, { status: 400 });
  }

  const sheetNames = Object.keys(parsed.bySheet);
  if (sheetNames.length === 0) {
    return NextResponse.json({ error: "No valid rows found in any sheet of the file" }, { status: 400 });
  }

  // كل Tab اسمه المفروض يطابق اسم موظفة Tele-Sales نشطة — المطابقة exact
  // (بعد تنضيف المسافات) زي ما اتفقنا.
  const teleSalesTeam = await prisma.user.findMany({
    where: { role: Role.TELE_SALES, isActive: true },
    select: { id: true, name: true },
  });
  const byName = new Map<string, { id: string; name: string }>(
    teleSalesTeam.map((u: { id: string; name: string }) => [u.name.trim().toLowerCase(), u])
  );

  const matchedSheets: { sheetName: string; employeeName: string; inserted: number; skipped: number }[] = [];
  const unmatchedSheets: string[] = [];

  for (const sheetName of sheetNames) {
    const employee = byName.get(sheetName.trim().toLowerCase());
    if (!employee) {
      unmatchedSheets.push(sheetName);
      continue;
    }

    const rows = parsed.bySheet[sheetName];
    const data = rows.map((r) => ({
      phone: r.phone,
      storeUrl: r.storeUrl ?? null,
      answered: r.answered,
      meetingHeld: r.meetingHeld,
      followUpDate: r.followUpDate ?? null,
      comment: r.comment ?? null,
      comment2: r.comment2 ?? null,
      ownerId: employee.id,
      createdById: session.user.id,
    }));

    const result = await prisma.teleSalesData.createMany({ data, skipDuplicates: true });
    matchedSheets.push({
      sheetName,
      employeeName: employee.name,
      inserted: result.count,
      skipped: rows.length - result.count,
    });
  }

  return NextResponse.json({ success: true, matchedSheets, unmatchedSheets });
}
