import { Role } from "@/lib/enums";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can, isManagementRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";


const schema = z.object({
  salesEmployeeId: z.string(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || !can(session.user.role, "TRANSFER_TO_SALES")) {
    return NextResponse.json({ error: "You are not authorized to perform this action" }, { status: 403 });
  }

  const lead = await prisma.lead.findUnique({ where: { id: params.id } });
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  if (!isManagementRole(session.user.role) && lead.assignedToId !== session.user.id) {
    return NextResponse.json({ error: "This lead is not assigned to you" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const salesEmployee = await prisma.user.findUnique({
    where: { id: parsed.data.salesEmployeeId },
  });
  if (!salesEmployee || salesEmployee.role !== Role.SALES || !salesEmployee.isActive) {
    return NextResponse.json({ error: "The selected sales employee is invalid" }, { status: 400 });
  }

  const [updatedLead] = await prisma.$transaction([
    prisma.lead.update({
      where: { id: params.id },
      data: {
        assignedToId: salesEmployee.id,
        currentStage: Role.SALES,
        status: "TRANSFERRED_TO_SALES",
        salesStatus: "NEW",
        transferredAt: new Date(),
      },
    }),
    prisma.activity.create({
      data: {
        leadId: params.id,
        userId: session.user.id,
        type: "TRANSFERRED",
        message: `The lead was transferred to the sales employee: ${salesEmployee.name}`,
      },
    }),
    // Any scheduled meeting has its ownership transferred to the new sales employee
    prisma.meeting.updateMany({
      where: { leadId: params.id, status: "SCHEDULED" },
      data: { ownerId: salesEmployee.id },
    }),
    prisma.notification.create({
      data: {
        userId: salesEmployee.id,
        title: "New lead transferred to you",
        message: `The lead ${lead.name} was transferred to you by ${session.user.name}. Check your meeting schedule.`,
        type: "LEAD_TRANSFER",
        link: "/sales",
      },
    }),
  ]);

  return NextResponse.json({ success: true, lead: updatedLead });
}
