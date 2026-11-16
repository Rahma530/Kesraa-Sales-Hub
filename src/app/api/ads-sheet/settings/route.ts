import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { extractSpreadsheetId } from "@/lib/google-sheets";
import { z } from "zod";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || !can(session.user.role, "MANAGE_ADS_SHEET")) {
    return NextResponse.json({ error: "You are not authorized to perform this action" }, { status: 403 });
  }

  const config = await prisma.adsSheetConfig.findUnique({ where: { id: "singleton" } });
  return NextResponse.json({ config });
}

const schema = z.object({
  sheetUrl: z.string().url(),
});

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !can(session.user.role, "MANAGE_ADS_SHEET")) {
    return NextResponse.json({ error: "You are not authorized to perform this action" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Please provide a valid Google Sheets link" }, { status: 400 });
  }

  // Validate the link shape up front so a typo is caught here instead of
  // only showing up later when Sync Now fails.
  try {
    extractSpreadsheetId(parsed.data.sheetUrl);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }

  const config = await prisma.adsSheetConfig.upsert({
    where: { id: "singleton" },
    create: {
      id: "singleton",
      sheetUrl: parsed.data.sheetUrl,
      updatedById: session.user.id,
    },
    update: {
      sheetUrl: parsed.data.sheetUrl,
      updatedById: session.user.id,
    },
  });

  return NextResponse.json({ success: true, config });
}
