import { Role, LeadSource } from "@/lib/enums";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can, isManagementRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

import { distributeLeads } from "@/lib/lead-distribution";

// GET /api/leads — management sees all leads, employees only see their own
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? undefined;
  const tier = searchParams.get("tier") ?? undefined;
  const q = searchParams.get("q")?.trim() ?? undefined;

  const where: any = {};
  if (status) where.status = status;
  if (tier) where.tier = tier;
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { phone: { contains: q } },
      { company: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
    ];
  }

  if (!isManagementRole(session.user.role)) {
    where.assignedToId = session.user.id;
  }

  const leads = await prisma.lead.findMany({
    where,
    include: {
      assignedTo: { select: { id: true, name: true, role: true } },
      followUps: { orderBy: { scheduledDate: "asc" }, where: { isCompleted: false } },
      meetings: { orderBy: { scheduledAt: "desc" }, take: 1 },
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(leads);
}

const createLeadSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(1),
  email: z.string().email().optional(),
  company: z.string().optional(),
  need: z.string().optional(),
});

// POST /api/leads — add a single lead manually
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !can(session.user.role, "ADD_LEAD_MANUALLY")) {
    return NextResponse.json({ error: "You are not authorized to perform this action" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createLeadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  // If the user is a Telesales rep or Sales rep, assign directly to them instead of distributing.
  if (session.user.role === Role.TELE_SALES || session.user.role === Role.SALES) {
    const existing = await prisma.lead.findFirst({ where: { phone: parsed.data.phone } });
    if (existing) {
      return NextResponse.json({ error: "A lead with this phone number already exists in the system" }, { status: 409 });
    }
    
    const lead = await prisma.lead.create({
      data: {
        ...parsed.data,
        source: LeadSource.MANUAL,
        createdById: session.user.id,
        assignedToId: session.user.id,
        currentStage: session.user.role,
        activities: {
          create: {
            userId: session.user.id,
            type: "LEAD_CREATED",
            message: "Lead added manually by the employee",
          }
        }
      }
    });
    return NextResponse.json({ success: true, lead, duplicatePhones: [] });
  }

  // Otherwise (Admin/Head of Sales), distribute across Telesales.
  const { insertedCount, createdLeadIds, duplicatePhones, distribution } = await distributeLeads(
    [parsed.data],
    session.user.id,
    LeadSource.MANUAL
  );

  if (insertedCount === 0) {
    return NextResponse.json(
      { error: "A lead with this phone number already exists in the system" },
      { status: 409 }
    );
  }

  const notificationsToCreate = Object.entries(distribution).map(([userId, count]) => ({
    userId,
    title: "New leads",
    message: `A new lead has been added and assigned to you`,
    type: "ASSIGNMENT",
    link: "?status=NEW",
  }));

  if (notificationsToCreate.length > 0) {
    await prisma.notification.createMany({ data: notificationsToCreate });
  }

  const lead = await prisma.lead.findUnique({ where: { id: createdLeadIds[0] } });

  return NextResponse.json({ success: true, lead, duplicatePhones });
}
