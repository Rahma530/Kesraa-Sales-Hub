import { Role } from "@/lib/enums";
import { isManagementRole } from "@/lib/permissions";

type SessionUser = { id: string; role: string };

/**
 * Builds the base Prisma `where` clause that decides which Leads a given
 * user is allowed to see — used by every endpoint that lists/counts Leads
 * (GET /api/leads, /api/leads/status-counts, the Admin Dashboard, etc.) so
 * the visibility rule only has to be correct in one place.
 *
 * Management roles (Admin/Head of Sales/Head of Tele-Sales) see everything.
 * Sales/Tele-Sales employees only see their own leads — EXCEPT Tele-Sales,
 * who must also keep seeing leads they've transferred to Sales (otherwise
 * they'd lose visibility into a lead the moment they hand it off). This
 * mirrors the `myLeadsWhere` clause that already existed in
 * tele-sales/page.tsx — kept here so new endpoints don't re-derive it
 * (and risk getting it wrong, as /api/leads's GET originally did).
 */
export function buildLeadScopeWhere(user: SessionUser): any {
  if (isManagementRole(user.role as Role)) return {};

  if (user.role === Role.TELE_SALES) {
    return {
      OR: [
        { assignedToId: user.id },
        { activities: { some: { userId: user.id, type: "TRANSFERRED" } } },
      ],
    };
  }

  return { assignedToId: user.id };
}

/**
 * Builds the `where` clause for the Lead Management page's "Lead
 * Distribution" tab filters (status/employee/search) — used both to
 * render that tab's own paginated fetch and, when a bulk action's target
 * is "every lead matching the current filter" rather than an explicit
 * list of ids, to resolve exactly which leads that means server-side.
 * No role-scoping here: the admin bulk-assign/bulk-delete endpoints that
 * use this are already gated to management roles, who can see every lead.
 */
export function buildAdminFilterWhere(filter: {
  status?: string | null;
  assignedToId?: string | null;
  q?: string | null;
}): any {
  const andConditions: any[] = [];
  if (filter.status && filter.status !== "ALL") {
    if (filter.status === "UNASSIGNED") andConditions.push({ assignedToId: null });
    else andConditions.push({ status: filter.status });
  }
  if (filter.assignedToId && filter.assignedToId !== "ALL") {
    if (filter.assignedToId === "UNASSIGNED") andConditions.push({ assignedToId: null });
    else andConditions.push({ assignedToId: filter.assignedToId });
  }
  if (filter.q && filter.q.trim()) {
    const q = filter.q.trim();
    andConditions.push({
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { phone: { contains: q } },
      ],
    });
  }
  return andConditions.length > 0 ? { AND: andConditions } : {};
}

/** Applies a NEW_LEADS (created within 7 days) / OLD_LEADS (older than 30 days) preset, matching LeadTable's existing client-side dateFilter semantics. */
export function applyDatePreset(where: any, datePreset?: string | null) {
  if (!datePreset || datePreset === "ALL") return where;

  const now = new Date();
  if (datePreset === "NEW_LEADS") {
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return { ...where, createdAt: { gte: sevenDaysAgo } };
  }
  if (datePreset === "OLD_LEADS") {
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return { ...where, createdAt: { lt: thirtyDaysAgo } };
  }
  return where;
}
