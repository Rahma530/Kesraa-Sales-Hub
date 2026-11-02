import { Role } from "@/lib/enums";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can, teamRoleForManager } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import Papa from "papaparse";
import { z } from "zod";
import { generateInviteToken, getInviteExpiry, buildInviteLink } from "@/lib/invite-token";

const rowSchema = z.object({
  name: z.string().min(1),
  username: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional().or(z.literal("")),
  role: z.nativeEnum(Role).optional().default(Role.TELE_SALES),
});

function normalizeHeader(h: string) {
  const map: Record<string, string> = {
    "الاسم": "name",
    "اسم الموظف": "name",
    "اسم المستخدم": "username",
    "اليوزر": "username",
    "البريد الالكتروني": "email",
    "البريد الإلكتروني": "email",
    "الايميل": "email",
    "رقم الهاتف": "phone",
    "الهاتف": "phone",
    "الدور": "role",
    "الرتبة": "role",
  };
  const trimmed = h.trim();
  return map[trimmed] ?? trimmed.toLowerCase();
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !can(session.user.role, "MANAGE_TEAM_USERS")) {
    return NextResponse.json({ error: "You are not authorized to perform this action" }, { status: 403 });
  }

  // A Head can only add employees to their own team — whatever the sheet's
  // Role column says, every row is forced into their team's role. The
  // Admin keeps full control over the Role column.
  const managedRole = teamRoleForManager(session.user.role);

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No file was attached" }, { status: 400 });
  }

  const text = await file.text();
  const parsed = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: normalizeHeader,
  });

  if (parsed.errors.length > 0) {
    return NextResponse.json(
      { error: "Failed to read the file", details: parsed.errors },
      { status: 400 }
    );
  }

  const validRows: z.infer<typeof rowSchema>[] = [];
  const invalidRows: { row: number; error: string }[] = [];

  (parsed.data as any[]).forEach((row, i) => {
    let mappedRole = typeof row.role === "string" ? row.role.trim() : row.role;
    const normalizedRole = typeof mappedRole === "string" ? mappedRole.toLowerCase() : mappedRole;
    if (["ادمن", "أدمن", "مدير النظام", "مدير", "admin"].includes(normalizedRole)) {
      mappedRole = "ADMIN";
    } else if (["رئيس المبيعات", "رئيس مبيعات", "هيد سيلز", "head of sales", "head_of_sales"].includes(normalizedRole)) {
      mappedRole = "HEAD_OF_SALES";
    } else if (["رئيس التيلي سيلز", "رئيس تيلي سيلز", "هيد تيلي سيلز", "head of tele-sales", "head of tele sales", "head_of_tele_sales"].includes(normalizedRole)) {
      mappedRole = "HEAD_OF_TELE_SALES";
    } else if (["تيلي سيلز", "موظف تيلي سيلز", "تيلي", "tele-sales", "tele sales", "tele_sales"].includes(normalizedRole)) {
      mappedRole = "TELE_SALES";
    } else if (["مبيعات", "سيلز", "موظف مبيعات", "موظف سيلز", "sales"].includes(normalizedRole)) {
      mappedRole = "SALES";
    }

    if (mappedRole) row.role = mappedRole;

    // A Head's upload always lands in their own team, regardless of
    // whatever role was written in the sheet.
    if (managedRole) row.role = managedRole;

    const result = rowSchema.safeParse(row);
    if (result.success) {
      validRows.push(result.data);
    } else {
      invalidRows.push({ row: i + 2, error: result.error.issues[0]?.message ?? "Invalid data" });
    }
  });

  if (validRows.length === 0) {
    return NextResponse.json(
      { error: "No valid rows found in the file", invalidRows },
      { status: 400 }
    );
  }

  const duplicateUsers = [];
  const insertedUsers: { name: string; username: string; inviteLink: string }[] = [];

  for (const row of validRows) {
    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          { username: row.username },
          { email: row.email }
        ]
      }
    });

    if (existing) {
      duplicateUsers.push(row.username);
      continue;
    }

    const inviteToken = generateInviteToken();
    const user = await prisma.user.create({
      data: {
        name: row.name,
        username: row.username,
        email: row.email,
        phone: row.phone || null,
        role: row.role as Role,
        inviteToken,
        inviteTokenExpiresAt: getInviteExpiry(),
      }
    });
    insertedUsers.push({
      name: user.name,
      username: user.username,
      inviteLink: buildInviteLink(inviteToken, req.nextUrl.origin),
    });
  }

  return NextResponse.json({
    success: true,
    totalUploaded: insertedUsers.length,
    skipped: invalidRows.length + duplicateUsers.length,
    invalidRows,
    duplicateUsers,
    insertedUsers,
  });
}
