import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildLeadScopeWhere, applyDatePreset } from "@/lib/lead-scope";

const STATUS_VALUES = [
  "NEW",
  "CONTACTED",
  "NO_ANSWER",
  "NEEDS_FOLLOWUP",
  "INTERESTED",
  "NOT_INTERESTED",
  "TRANSFERRED_TO_SALES",
];

// GET /api/leads/status-counts — per-status totals for the tab pills in
// LeadTable (e.g. "Contacted (14)"), scoped the same way /api/leads is
// (role-based visibility + optional assignedToId/datePreset/q), but
// WITHOUT a status filter, since status is exactly what varies per tab.
//
// This used to be a client-side useMemo over the full `leads` array —
// only correct because that array held every lead. Once LeadTable started
// fetching one page at a time, the counts needed their own query.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const assignedToId = searchParams.get("assignedToId") ?? undefined;
  const q = searchParams.get("q")?.trim() ?? undefined;
  const datePreset = searchParams.get("datePreset") ?? undefined;

  const andConditions: any[] = [buildLeadScopeWhere(session.user)];
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

  let baseWhere: any = { AND: andConditions };
  baseWhere = applyDatePreset(baseWhere, datePreset);

  const [total, groups] = await Promise.all([
    prisma.lead.count({ where: baseWhere }),
    prisma.lead.groupBy({
      by: ["status"],
      where: baseWhere,
      _count: { _all: true },
    }),
  ]);

  const counts: Record<string, number> = { ALL: total };
  for (const s of STATUS_VALUES) counts[s] = 0;
  for (const g of groups) {
    if (g.status) counts[g.status] = g._count._all;
  }

  return NextResponse.json({ counts });
}
