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
  datePreset?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
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
  let where = andConditions.length > 0 ? { AND: andConditions } : {};
  where = applyDateFilter(where, { preset: filter.datePreset, from: filter.dateFrom, to: filter.dateTo });
  return where;
}

/**
 * General-purpose date filter for the `createdAt` field — covers both the
 * original two quick presets (NEW_LEADS/OLD_LEADS, kept for backward
 * compatibility with LeadTable's existing dropdown) and the newer
 * calendar-based ones (TODAY/THIS_WEEK/THIS_MONTH/THIS_YEAR) plus a fully
 * custom range (CUSTOM, with explicit `from`/`to` ISO date strings) — the
 * day/month/year date-filter feature requested for dashboards and lead
 * lists. All boundaries are computed in server (UTC) time, consistent
 * with how NEW_LEADS/OLD_LEADS already worked.
 */
export function applyDateFilter(
  where: any,
  opts: { preset?: string | null; from?: string | null; to?: string | null }
) {
  const { preset, from, to } = opts;
  if (!preset || preset === "ALL") return where;

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (preset === "NEW_LEADS") {
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return { ...where, createdAt: { gte: sevenDaysAgo } };
  }
  if (preset === "OLD_LEADS") {
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return { ...where, createdAt: { lt: thirtyDaysAgo } };
  }
  if (preset === "TODAY") {
    return { ...where, createdAt: { gte: startOfToday } };
  }
  if (preset === "THIS_WEEK") {
    // Week starts Saturday, matching the regional work week.
    const day = startOfToday.getDay(); // 0=Sun..6=Sat
    const daysSinceSaturday = (day + 1) % 7;
    const startOfWeek = new Date(startOfToday.getTime() - daysSinceSaturday * 24 * 60 * 60 * 1000);
    return { ...where, createdAt: { gte: startOfWeek } };
  }
  if (preset === "THIS_MONTH") {
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    return { ...where, createdAt: { gte: startOfMonth } };
  }
  if (preset === "THIS_YEAR") {
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    return { ...where, createdAt: { gte: startOfYear } };
  }
  if (preset === "CUSTOM") {
    const range: any = {};
    if (from) range.gte = new Date(from + "T00:00:00");
    if (to) range.lte = new Date(to + "T23:59:59.999");
    if (Object.keys(range).length === 0) return where;
    return { ...where, createdAt: range };
  }
  return where;
}

/** @deprecated use applyDateFilter — kept so nothing importing the old name breaks. */
export function applyDatePreset(where: any, datePreset?: string | null) {
  return applyDateFilter(where, { preset: datePreset });
}
