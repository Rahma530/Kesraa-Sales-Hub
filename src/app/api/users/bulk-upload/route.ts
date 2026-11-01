import { Role } from "@/lib/enums";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import Papa from "papaparse";
import { z } from "zod";
import bcrypt from "bcryptjs";

const rowSchema = z.object({
  name: z.string().min(1),
  username: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional().or(z.literal("")),
  password: z.string().min(6),
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
    "كلمة المرور": "password",
    "الباسورد": "password",
    "الدور": "role",
    "الرتبة": "role",
  };
  const trimmed = h.trim();
  return map[trimmed] ?? trimmed.toLowerCase();
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !can(session.user.role, "MANAGE_USERS")) {
    return NextResponse.json({ error: "You are not authorized to perform this action" }, { status: 403 });
  }

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
    let mappedRole = row.role;
    if (mappedRole === "ادمن" || mappedRole === "أدمن" || mappedRole === "مدير النظام") mappedRole = "ADMIN";
    if (mappedRole === "موظف" || mappedRole === "مبيعات" || mappedRole === "تيلي سيلز") mappedRole = "TELE_SALES";
    if (mappedRole === "كاستمر سيرفيس" || mappedRole === "خدمة عملاء") mappedRole = "CUSTOMER_SERVICE";
    
    if(mappedRole) row.role = mappedRole;

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
  const insertedUsers = [];

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

    const hashedPassword = await bcrypt.hash(row.password, 10);
    const user = await prisma.user.create({
      data: {
        name: row.name,
        username: row.username,
        email: row.email,
        phone: row.phone || null,
        passwordHash: hashedPassword,
        role: row.role as Role,
      }
    });
    insertedUsers.push(user);
  }

  return NextResponse.json({
    success: true,
    totalUploaded: insertedUsers.length,
    skipped: invalidRows.length + duplicateUsers.length,
    invalidRows,
    duplicateUsers,
  });
}
