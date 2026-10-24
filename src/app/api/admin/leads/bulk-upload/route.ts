import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LeadSource } from "@/lib/enums";
import { distributeLeads, BACKGROUND_PROCESSING_THRESHOLD } from "@/lib/lead-distribution";

// هنا كان الخلل الأساسي: الكود القديم كان بيعمل `createMany` مباشر من غير
// توزيع تلقائي ومن غير إشعارات — فالعميل كان بيتسجل "بدون مالك" ومحدش كان
// بياخد Notification. دلوقتي الـ route ده بيستخدم نفس دالة التوزيع
// (`distributeLeads`) المستخدمة في رفع الملفات العادي، فالسلوك بقى موحّد:
// كل رفع (سواء من هنا أو من شاشة الرفع التانية) بيوزّع تلقائي ويبعت إشعارات.
//
// الحجم الكبير (أكتر من BACKGROUND_PROCESSING_THRESHOLD صف) بيتعالج في
// الخلفية: بنرجع رد فوري للـ Admin، والمعالجة بتكمل على السيرفر من غير ما
// يستنى قدام الشاشة. ده ممكن لأن السيرفر خاص (Node process شغال بشكل دائم)
// مش Serverless زي Vercel اللي بيوقف التنفيذ بعد الرد.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== "ADMIN" && session.user.role !== "HEAD_OF_SALES")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const { leads, fileName, tier } = await req.json();

    if (!leads || !Array.isArray(leads) || leads.length === 0) {
      return NextResponse.json({ error: "Invalid data format" }, { status: 400 });
    }

    const normalizedLeads = leads.map((l: any) => ({
      name: String(l.name || "").trim(),
      phone: String(l.phone || "").trim(),
      email: l.email ? String(l.email).trim() : undefined,
      company: l.company ? String(l.company).trim() : undefined,
      need: l.need ? String(l.need).trim() : undefined,
      storeUrl: l.storeUrl ? String(l.storeUrl).trim() : undefined,
      socialMediaUrl: l.socialMediaUrl ? String(l.socialMediaUrl).trim() : undefined,
    }));

    const batch = await prisma.uploadBatch.create({
      data: {
        fileName: fileName || "Untitled Sheet",
        totalLeads: normalizedLeads.length,
        uploadedById: session.user.id,
        status: normalizedLeads.length > BACKGROUND_PROCESSING_THRESHOLD ? "PENDING" : "DONE",
      },
    });

    const createdById = session.user.id;
    const leadTier: string = tier || "WARM";

    const runDistribution = () =>
      distributeLeads(normalizedLeads, createdById, LeadSource.MANUAL, batch.id, leadTier);

    // الرفعات الصغيرة: بنستنى النتيجة ونرجعها كاملة فورًا — تجربة أبسط للموظف.
    if (normalizedLeads.length <= BACKGROUND_PROCESSING_THRESHOLD) {
      const result = await runDistribution();
      await notifyDistributedEmployees(result.distribution, fileName);

      return NextResponse.json({
        success: true,
        status: "DONE",
        batchId: batch.id,
        count: result.insertedCount,
        duplicates: result.duplicatePhones,
      });
    }

    // الرفعات الكبيرة: بنرجع رد فوري، والمعالجة بتكمل في الخلفية.
    // ملاحظة: من غير await هنا عمدًا — العملية بتكمل بعد ما الرد يترجع،
    // لأن السيرفر عملية Node دائمة التشغيل مش Serverless.
    runDistribution()
      .then(async (result) => {
        await prisma.uploadBatch.update({
          where: { id: batch.id },
          data: {
            status: "DONE",
            skippedLeads: result.duplicatePhones.length,
          },
        });
        await notifyDistributedEmployees(result.distribution, fileName);
        await prisma.notification.create({
          data: {
            userId: createdById,
            title: "اكتمل رفع العملاء",
            message: `تم رفع وتوزيع ${result.insertedCount} عميل من ملف ${fileName || "الشيت"}${
              result.duplicatePhones.length > 0 ? `، واستبعاد ${result.duplicatePhones.length} مكرر` : ""
            }.`,
            type: "UPLOAD_COMPLETE",
            link: "/admin/customers",
          },
        });
      })
      .catch(async (error: any) => {
        console.error("Background bulk-upload error:", error);
        await prisma.uploadBatch.update({
          where: { id: batch.id },
          data: { status: "FAILED", errorMessage: String(error?.message || error) },
        });
        await prisma.notification.create({
          data: {
            userId: createdById,
            title: "فشل رفع العملاء",
            message: `حصل خطأ أثناء معالجة ملف ${fileName || "الشيت"}. راجع السجل مع الدعم الفني.`,
            type: "UPLOAD_FAILED",
            link: "/admin/customers",
          },
        });
      });

    return NextResponse.json({
      success: true,
      status: "PENDING",
      batchId: batch.id,
      totalLeads: normalizedLeads.length,
      message: "الملف كبير، جارٍ توزيعه في الخلفية. تقدري تتابعي التقدم من قايمة الشيتات.",
    });
  } catch (error: any) {
    console.error("Bulk upload error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function notifyDistributedEmployees(distribution: Record<string, number>, fileName?: string) {
  const notificationsToCreate = Object.entries(distribution).map(([userId, count]) => ({
    userId,
    title: "عملاء جدد",
    message: `تم توزيع ${count} عميل جديد لك من ملف ${fileName || "الشيت"}`,
    type: "ASSIGNMENT",
    link: "?status=NEW",
  }));

  if (notificationsToCreate.length > 0) {
    await prisma.notification.createMany({ data: notificationsToCreate });
  }
}
