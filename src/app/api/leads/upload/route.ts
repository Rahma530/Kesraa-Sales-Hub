import { LeadSource } from "@/lib/enums";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { distributeLeads } from "@/lib/lead-distribution";
import Papa from "papaparse";
import { z } from "zod";


const rowSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(1),
  email: z.string().email().optional().or(z.literal("")),
  company: z.string().optional(),
  need: z.string().optional(),
  storeUrl: z.string().optional(),
  socialMediaUrl: z.string().optional(),
});

// توقع أعمدة الملف: name, phone, email, company, need
// (بيقبل أسماء أعمدة عربي أو إنجليزي شائعة عن طريق تطبيع الهيدر)
function normalizeHeader(h: string) {
  const map: Record<string, string> = {
    "الاسم": "name",
    "اسم العميل": "name",
    "رقم الهاتف": "phone",
    "الهاتف": "phone",
    "الشركة": "company",
    "الاحتياج": "need",
    "البريد الالكتروني": "email",
    "الايميل": "email",
    "رابط المتجر": "storeUrl",
    "لينك المتجر": "storeUrl",
    "المتجر": "storeUrl",
    "حساب السوشيال ميديا": "socialMediaUrl",
    "رابط السوشيال ميديا": "socialMediaUrl",
    "السوشيال ميديا": "socialMediaUrl",
  };
  const trimmed = h.trim();
  return map[trimmed] ?? trimmed.toLowerCase();
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !can(session.user.role, "UPLOAD_LEADS")) {
    return NextResponse.json({ error: "غير مصرح لك بهذا الإجراء" }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "لم يتم إرفاق ملف" }, { status: 400 });
  }

  const text = await file.text();
  const parsed = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: normalizeHeader,
  });

  if (parsed.errors.length > 0) {
    return NextResponse.json(
      { error: "تعذّرت قراءة الملف", details: parsed.errors },
      { status: 400 }
    );
  }

  const validRows: z.infer<typeof rowSchema>[] = [];
  const invalidRows: { row: number; error: string }[] = [];

  (parsed.data as any[]).forEach((row, i) => {
    const result = rowSchema.safeParse(row);
    if (result.success) {
      validRows.push(result.data);
    } else {
      invalidRows.push({ row: i + 2, error: result.error.issues[0]?.message ?? "بيانات غير صحيحة" });
    }
  });

  if (validRows.length === 0) {
    return NextResponse.json(
      { error: "لا يوجد صفوف صالحة في الملف", invalidRows },
      { status: 400 }
    );
  }

  const batch = await prisma.uploadBatch.create({
    data: {
      fileName: file.name,
      totalLeads: validRows.length,
      uploadedById: session.user.id,
    },
  });

  const { insertedCount, distribution, teamSize, duplicatePhones } = await distributeLeads(
    validRows,
    session.user.id,
    LeadSource.EXCEL_UPLOAD,
    batch.id
  );

  // حدّث عدد الليدز الفعلي في الـ batch لو اتجاهل بعض الصفوف كتكرار
  if (insertedCount !== batch.totalLeads) {
    await prisma.uploadBatch.update({
      where: { id: batch.id },
      data: { totalLeads: insertedCount },
    });
  }

  const notificationsToCreate = Object.entries(distribution).map(([userId, count]) => ({
    userId,
    title: "عملاء جدد",
    message: `تم توزيع ${count} عميل جديد لك من ملف ${file.name}`,
    type: "ASSIGNMENT",
    link: "?status=NEW",
  }));

  if (notificationsToCreate.length > 0) {
    await (prisma as any).notification.createMany({ data: notificationsToCreate });
  }

  return NextResponse.json({
    success: true,
    totalUploaded: insertedCount,
    skipped: invalidRows.length + duplicatePhones.length,
    invalidRows,
    duplicatePhones,
    distributedAcross: teamSize,
    distribution,
  });
}
