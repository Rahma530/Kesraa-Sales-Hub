import { Role, LeadSource } from "@/lib/enums";
import { prisma } from "@/lib/prisma";

interface RawLeadInput {
  name: string;
  phone: string;
  email?: string;
  company?: string;
  need?: string;
  storeUrl?: string;
  socialMediaUrl?: string;
}

// عدد الصفوف اللي بتتعالج مع بعض في كل دفعة داخلية.
// رقم صغير يكفي عشان محدش "Query" يفضل شغال لمدة طويلة أو يقفل جدول الـ Lead.
const CHUNK_SIZE = 500;

// فوق الحجم ده، الرفع بيتحول لمعالجة في الخلفية بدل ما الموظف يستنى قدام الشاشة.
export const BACKGROUND_PROCESSING_THRESHOLD = 300;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * يوزع مجموعة ليدز (ممكن تكون عشرات الآلاف) بالتساوي (Round-robin) على كل
 * موظفي التيلي سيلز النشطين — على دفعات داخلية صغيرة بدل محاولة واحدة ضخمة.
 *
 * ليه بالشكل ده:
 * - الكود القديم كان بيحط كل الصفوف جوه معاملة (transaction) واحدة ضخمة،
 *   وده بيقفل جدول الـ Lead لحد ما كل الصفوف تخلص؛ في آلاف الصفوف ده بيفشل
 *   أو يستهلك وقت طويل جدًا وممكن يوقع الطلب كله.
 * - هنا كل دفعة (CHUNK_SIZE صف) بتتعالج وتتسجل لوحدها، فلو حصل أي عطل في
 *   النص، الدفعات اللي خلصت فعلاً متسجلة ومش بترجع صفر.
 * - لو uploadBatchId موجود، بيتسجل تقدم العملية أول بأول في UploadBatch.processedLeads
 *   عشان الواجهة تقدر تعرض "اترفع كام من أصل كام" أثناء المعالجة.
 */
export async function distributeLeads(
  rawLeads: RawLeadInput[],
  createdById: string,
  source: LeadSource,
  uploadBatchId?: string,
  tier?: string
) {
  const teleSalesTeam = await prisma.user.findMany({
    where: { role: Role.TELE_SALES, isActive: true },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

  if (teleSalesTeam.length === 0) {
    throw new Error("لا يوجد موظفين Tele-Sales نشطين لتوزيع الليدز عليهم");
  }

  // منع تكرار نفس الرقم أكتر من مرة داخل نفس الملف/الطلب (قبل ما نلمس الداتابيز خالص)
  const seenInThisUpload = new Set<string>();
  const duplicatePhones: string[] = [];
  const candidateLeads = rawLeads.filter((lead) => {
    if (seenInThisUpload.has(lead.phone)) {
      duplicatePhones.push(lead.phone);
      return false;
    }
    seenInThisUpload.add(lead.phone);
    return true;
  });

  const distribution: Record<string, number> = {};
  const createdLeadIds: string[] = [];
  let insertedCount = 0;
  let globalIndex = 0; // بيحافظ على استمرارية الـ round-robin عبر الدفعات كلها

  for (const batch of chunk(candidateLeads, CHUNK_SIZE)) {
    // استبعاد أي رقم موجود بالفعل في النظام من رفعات سابقة
    const existing = await prisma.lead.findMany({
      where: { phone: { in: batch.map((l) => l.phone) } },
      select: { phone: true },
    });
    const existingPhones = new Set(existing.map((l) => l.phone));

    const toInsert = batch.filter((lead) => {
      if (existingPhones.has(lead.phone)) {
        duplicatePhones.push(lead.phone);
        return false;
      }
      return true;
    });

    if (toInsert.length > 0) {
      const dataWithIds = toInsert.map((lead, i) => {
        const assignee = teleSalesTeam[(globalIndex + i) % teleSalesTeam.length];
        return {
          id: crypto.randomUUID(),
          name: lead.name,
          phone: lead.phone,
          email: lead.email || null,
          company: lead.company || null,
          need: lead.need || null,
          storeUrl: lead.storeUrl || null,
          socialMediaUrl: lead.socialMediaUrl || null,
          source,
          ...(tier ? { tier } : {}),
          createdById,
          assignedToId: assignee.id,
          currentStage: Role.TELE_SALES,
          uploadBatchId,
        };
      });

      // skipDuplicates كشبكة أمان إضافية لو حصل تعارض لحظي (رفعين في نفس الوقت
      // بينهم رقم متشابه) — بيحمي من كراش الدفعة كلها بسبب صف واحد متكرر.
      await prisma.lead.createMany({ data: dataWithIds, skipDuplicates: true });

      // بنتأكد مين اللي فعلاً اتسجل (ممكن صف يتستبعد لو حصل التعارض فوق)
      const actuallyCreated = await prisma.lead.findMany({
        where: { phone: { in: dataWithIds.map((d) => d.phone) } },
        select: { id: true, phone: true, assignedToId: true },
      });

      if (actuallyCreated.length > 0) {
        await prisma.activity.createMany({
          data: actuallyCreated.map((lead) => ({
            leadId: lead.id,
            userId: createdById,
            type: "LEAD_ASSIGNED",
            message: "تم توزيع الليد تلقائيًا على موظف Tele-Sales",
          })),
        });
      }

      actuallyCreated.forEach((lead) => {
        if (lead.assignedToId) {
          distribution[lead.assignedToId] = (distribution[lead.assignedToId] ?? 0) + 1;
        }
        createdLeadIds.push(lead.id);
      });

      insertedCount += actuallyCreated.length;
    }

    globalIndex += batch.length;

    if (uploadBatchId) {
      await prisma.uploadBatch.update({
        where: { id: uploadBatchId },
        data: { processedLeads: { increment: batch.length } },
      });
    }
  }

  return {
    insertedCount,
    createdLeadIds,
    distribution,
    teamSize: teleSalesTeam.length,
    duplicatePhones,
  };
}
