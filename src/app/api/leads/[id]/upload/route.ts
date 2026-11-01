import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user.role !== "SALES" && session.user.role !== "HEAD_OF_SALES" && session.user.role !== "ADMIN")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const data = await req.formData();
    const file = data.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Create uploads directory if it doesn't exist
    const uploadDir = join(process.cwd(), "public", "uploads");
    await mkdir(uploadDir, { recursive: true });

    // Sanitize filename and add timestamp to avoid collisions
    const fileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
    const filePath = join(uploadDir, fileName);
    
    await writeFile(filePath, buffer);

    const contractUrl = `/uploads/${fileName}`;

    const existingLead = await prisma.lead.findUnique({ where: { id: params.id }, select: { contractUrl: true } });
    const newContractUrl = existingLead?.contractUrl ? `${existingLead.contractUrl},${contractUrl}` : contractUrl;

    // Update lead and add activity
    const lead = await prisma.lead.update({
      where: { id: params.id },
      data: {
        contractUrl: newContractUrl,
        activities: {
          create: {
            userId: session.user.id,
            type: "UPLOAD_CONTRACT",
            message: "The lead's contract was uploaded"
          }
        }
      }
    });

    return NextResponse.json({ success: true, contractUrl: lead.contractUrl });
  } catch (error: any) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

