import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can, isManagementRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const schema = z.object({
  scheduledDate: z.string().datetime().optional(), // ISO string from the frontend
  notes: z.string().optional(),
  details: z.string().optional(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || !can(session.user.role, "CREATE_FOLLOWUP")) {
    return NextResponse.json({ error: "You are not authorized to perform this action" }, { status: 403 });
  }

  const lead = await prisma.lead.findUnique({ where: { id: params.id } });
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  if (!isManagementRole(session.user.role) && lead.assignedToId !== session.user.id) {
    const hasTransferredActivity = await prisma.activity.findFirst({
      where: { leadId: lead.id, userId: session.user.id, type: "TRANSFERRED" }
    });
    if (!hasTransferredActivity) {
      return NextResponse.json({ error: "This lead is not assigned to you" }, { status: 403 });
    }
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  try {
    const followUp = await prisma.followUp.create({
      data: {
        leadId: params.id,
        createdById: session.user.id,
        // @ts-ignore (Prisma types might be cached in VS Code, but DB schema is updated)
        scheduledDate: parsed.data.scheduledDate ? new Date(parsed.data.scheduledDate) : undefined,
        // @ts-ignore
        notes: parsed.data.notes,
        details: parsed.data.details,
      },
    });

    await prisma.$transaction([
      prisma.lead.update({
        where: { id: params.id },
        data: { status: "NEEDS_FOLLOWUP" },
      }),
      prisma.activity.create({
        data: {
          leadId: params.id,
          userId: session.user.id,
          type: "FOLLOWUP_CREATED",
          message: (() => {
            let msg = "A follow-up note was added";
            if (parsed.data.scheduledDate) {
              const d = new Date(parsed.data.scheduledDate);
              const formatted = d.toLocaleString("en-US", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: true });
              msg = `A follow-up was scheduled for ${formatted}`;
            }
            if (parsed.data.notes) {
              msg += ` - Note: ${parsed.data.notes}`;
            }
            return msg;
          })(),
        },
      }),
    ]);

    return NextResponse.json({ success: true, followUp });
  } catch (error: any) {
    console.error("FollowUp Error:", error);
    return NextResponse.json({ error: error.message || "Internal Error" }, { status: 500 });
  }
}

const completeSchema = z.object({
  followUpId: z.string(),
  isCompleted: z.boolean().default(true),
});

// PATCH — mark a follow-up as completed (or revert it)
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || !can(session.user.role, "COMPLETE_FOLLOWUP")) {
    return NextResponse.json({ error: "You are not authorized to perform this action" }, { status: 403 });
  }

  const lead = await prisma.lead.findUnique({ where: { id: params.id } });
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  if (!isManagementRole(session.user.role) && lead.assignedToId !== session.user.id) {
    const hasTransferredActivity = await prisma.activity.findFirst({
      where: { leadId: lead.id, userId: session.user.id, type: "TRANSFERRED" }
    });
    if (!hasTransferredActivity) {
      return NextResponse.json({ error: "This lead is not assigned to you" }, { status: 403 });
    }
  }

  const body = await req.json();
  const parsed = completeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const followUp = await prisma.followUp.update({
    where: { id: parsed.data.followUpId },
    data: {
      isCompleted: parsed.data.isCompleted,
      completedAt: parsed.data.isCompleted ? new Date() : null,
    },
  });

  await prisma.activity.create({
    data: {
      leadId: params.id,
      userId: session.user.id,
      type: "FOLLOWUP_COMPLETED",
      message: parsed.data.isCompleted ? "Follow-up completed" : "Follow-up reopened",
    },
  });

  return NextResponse.json({ success: true, followUp });
}
