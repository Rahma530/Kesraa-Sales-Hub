import { Role, LeadStatus, LeadTier } from "@/lib/enums";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can, isManagementRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";


const schema = z.object({
  status: z.nativeEnum(LeadStatus).optional(),
  tier: z.nativeEnum(LeadTier).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || !can(session.user.role, "UPDATE_LEAD_STATUS")) {
    return NextResponse.json({ error: "You are not authorized to perform this action" }, { status: 403 });
  }

  const lead = await prisma.lead.findUnique({ where: { id: params.id } });
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  // A regular employee can only edit leads assigned to them or that they transferred to sales
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

  const isSales = session.user.role === Role.SALES;

  const updated = await prisma.lead.update({
    where: { id: params.id },
    data: {
      ...(parsed.data.status && (isSales ? { salesStatus: parsed.data.status } : { status: parsed.data.status })),
      ...(parsed.data.tier && { tier: parsed.data.tier }),
      ...(parsed.data.status === "CLOSED_WON" || parsed.data.status === "CLOSED_LOST"
        ? { closedAt: new Date() }
        : {}),
      activities: {
        create: {
          userId: session.user.id,
          type: "STATUS_CHANGE",
          message: [
            parsed.data.status && `Status changed to ${parsed.data.status}`,
            parsed.data.tier && `Lead classified as ${parsed.data.tier}`,
          ]
            .filter(Boolean)
            .join(" — "),
        },
      },
    },
  });

  if (parsed.data.status && parsed.data.status !== "NEEDS_FOLLOWUP") {
    await prisma.followUp.updateMany({
      where: {
        leadId: params.id,
        createdById: session.user.id,
        isCompleted: false,
      },
      data: { isCompleted: true },
    });
  }

  return NextResponse.json({ success: true, lead: updated });
}
