import { Role, PENDING_REVIEW_STAGE } from "@/lib/enums";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

// Head of Tele-Sales reviewing the Ads Sheet pending queue: assigns a
// pending lead to one of her Tele-Sales employees and sets its tier —
// after this it's a normal lead, indistinguishable from a manually-added
// one except for its `source`.
const schema = z.object({
  assignedToId: z.string(),
  tier: z.enum(["WARM", "HOT", "COLD"]),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || !can(session.user.role, "CLASSIFY_PENDING_LEADS")) {
    return NextResponse.json({ error: "You are not authorized to perform this action" }, { status: 403 });
  }

  const lead = await prisma.lead.findUnique({ where: { id: params.id } });
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  if (lead.currentStage !== PENDING_REVIEW_STAGE) {
    return NextResponse.json({ error: "This lead has already been classified" }, { status: 400 });
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const employee = await prisma.user.findUnique({ where: { id: parsed.data.assignedToId } });
  if (!employee || employee.role !== Role.TELE_SALES || !employee.isActive) {
    return NextResponse.json({ error: "The selected employee is invalid" }, { status: 400 });
  }

  const [updatedLead] = await prisma.$transaction([
    prisma.lead.update({
      where: { id: params.id },
      data: {
        assignedToId: employee.id,
        tier: parsed.data.tier,
        currentStage: Role.TELE_SALES,
      },
    }),
    prisma.activity.create({
      data: {
        leadId: params.id,
        userId: session.user.id,
        type: "LEAD_ASSIGNED",
        message: `Lead reviewed from the Ads Sheet and assigned to ${employee.name}`,
      },
    }),
    prisma.notification.create({
      data: {
        userId: employee.id,
        title: "New lead",
        message: `A new lead (${lead.name}) was assigned to you from the Ads Sheet`,
        type: "ASSIGNMENT",
        link: "?status=NEW",
      },
    }),
  ]);

  return NextResponse.json({ success: true, lead: updatedLead });
}
