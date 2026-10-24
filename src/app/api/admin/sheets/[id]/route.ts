import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// بيرجع تقدم رفعة كبيرة بتتعالج في الخلفية — الواجهة بتعمل عليه Polling
// كل كذا ثانية لحد ما status تبقى DONE أو FAILED.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== "ADMIN" && session.user.role !== "HEAD_OF_SALES")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const batch = await prisma.uploadBatch.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      fileName: true,
      totalLeads: true,
      processedLeads: true,
      skippedLeads: true,
      status: true,
      errorMessage: true,
    },
  });

  if (!batch) {
    return NextResponse.json({ error: "Batch not found" }, { status: 404 });
  }

  return NextResponse.json({ batch });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== "ADMIN" && session.user.role !== "HEAD_OF_SALES")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id } = params;

  try {
    // We must manually delete the leads first since we don't have onDelete: Cascade 
    // configured for the uploadBatchId relation in Prisma schema.
    await prisma.lead.deleteMany({
      where: { uploadBatchId: id }
    });

    // Then delete the batch itself
    await prisma.uploadBatch.delete({
      where: { id }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Delete batch error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
