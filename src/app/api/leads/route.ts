import { Role, LeadSource } from "@/lib/enums";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

import { distributeLeads } from "@/lib/lead-distribution";
import { buildLeadScopeWhere, applyDateFilter } from "@/lib/lead-scope";

// GET /api/leads — management sees all leads, employees only see their own
//
// Paginated: returns { leads, total, page, pageSize, totalPages } rather
// than a bare array, so the caller can render page controls and an
// accurate "N results" count without having to load everything. This
// backs the Lead Management (admin/customers) page's server-side
// pagination — see that page for why loading every Lead in one response
// stopped being workable once the lead volume grew large.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? undefined;
  const tier = searchParams.get("tier") ?? undefined;
  const assignedToId = searchParams.get("assignedToId") ?? undefined;
  const q = searchParams.get("q")?.trim() ?? undefined;
  // datePreset: ALL/NEW_LEADS/OLD_LEADS/TODAY/THIS_WEEK/THIS_MONTH/THIS_YEAR/CUSTOM.
  // dateFrom/dateTo (YYYY-MM-DD) are only used when datePreset=CUSTOM.
  const datePreset = searchParams.get("datePreset") ?? undefined;
  const dateFrom = searchParams.get("dateFrom") ?? undefined;
  const dateTo = searchParams.get("dateTo") ?? undefined;

  const pageSize = Math.min(Math.max(Number(searchParams.get("pageSize")) || 50, 1), 100);
  const page = Math.max(Number(searchParams.get("page")) || 1, 1);

  // Base visibility: management sees everything, employees see only their
  // own leads (Tele-Sales also keeps seeing leads they've transferred to
  // Sales — see buildLeadScopeWhere for why this is an OR, not a plain
  // assignedToId filter). Combined with the rest of the filters via AND
  // (rather than reusing top-level `where.OR`) so a search query's OR
  // doesn't clobber the scope's OR.
  const scopeWhere = buildLeadScopeWhere(session.user);
  const andConditions: any[] = [scopeWhere];

  if (status) andConditions.push({ status });
  if (tier) andConditions.push({ tier });
  // A caller-supplied assignedToId narrows further within whatever the
  // employee is already scoped to see; management can use it freely.
  // "UNASSIGNED" is a sentinel (not a real user id) meaning "has no owner".
  if (assignedToId === "UNASSIGNED") andConditions.push({ assignedToId: null });
  else if (assignedToId) andConditions.push({ assignedToId });
  if (q) {
    andConditions.push({
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { phone: { contains: q } },
        { company: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
      ],
    });
  }

  let where: any = { AND: andConditions };
  where = applyDateFilter(where, { preset: datePreset, from: dateFrom, to: dateTo });

  const [leads, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      include: {
        assignedTo: { select: { id: true, name: true, role: true } },
        followUps: { orderBy: { scheduledDate: "asc" }, where: { isCompleted: false } },
        meetings: { orderBy: { scheduledAt: "desc" }, take: 1 },
      },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.lead.count({ where }),
  ]);

  return NextResponse.json({
    leads,
    total,
    page,
    pageSize,
    totalPages: Math.max(Math.ceil(total / pageSize), 1),
  });
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
