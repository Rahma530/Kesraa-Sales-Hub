import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LeadSource } from "@/lib/enums";
import { distributeLeads, BACKGROUND_PROCESSING_THRESHOLD } from "@/lib/lead-distribution";

// The main bug here used to be: the old code did a direct `createMany` with
// no automatic distribution and no notifications — so a lead got saved
// "without an owner" and nobody got a Notification. Now this route uses the
// same distribution function (`distributeLeads`) used by the regular file
// upload, so the behavior is unified: every upload (whether from here or
// from the other upload screen) distributes automatically and sends
// notifications.
//
// Large sizes (more than BACKGROUND_PROCESSING_THRESHOLD rows) are processed
// in the background: we return an immediate response to the Admin, and
// processing continues on the server without the screen waiting. This is
// possible because the server is a dedicated, long-running Node process,
// not Serverless like Vercel which stops execution after the response.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== "ADMIN" && session.user.role !== "HEAD_OF_SALES" && session.user.role !== "HEAD_OF_TELE_SALES")) {
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

    // Small uploads: we wait for the result and return it in full right away — a simpler experience for the employee.
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

    // Large uploads: we return an immediate response, and processing continues in the background.
    // Note: intentionally no await here — the operation continues after the response is returned,
    // because the server is a long-running Node process, not Serverless.
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
            title: "Lead upload complete",
            message: `${result.insertedCount} leads have been uploaded and distributed from the file ${fileName || "sheet"}${
              result.duplicatePhones.length > 0 ? `, excluding ${result.duplicatePhones.length} duplicate(s)` : ""
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
            title: "Lead upload failed",
            message: `An error occurred while processing the file ${fileName || "sheet"}. Check the log with technical support.`,
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
      message: "The file is large, distribution is in progress in the background. You can track progress from the sheets list.",
    });
  } catch (error: any) {
    console.error("Bulk upload error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function notifyDistributedEmployees(distribution: Record<string, number>, fileName?: string) {
  const notificationsToCreate = Object.entries(distribution).map(([userId, count]) => ({
    userId,
    title: "New leads",
    message: `${count} new lead(s) have been distributed to you from the file ${fileName || "sheet"}`,
    type: "ASSIGNMENT",
    link: "?status=NEW",
  }));

  if (notificationsToCreate.length > 0) {
    await prisma.notification.createMany({ data: notificationsToCreate });
  }
}
