import { collections, type AuditLogDoc } from "@/lib/db";
import {
  ApiError,
  authorizeProject,
  handler,
  json,
  requireUserId,
} from "@/lib/api";

type Ctx = { params: Promise<{ projectId: string }> };

/** Event categories shown in the UI, mapped to the recorded actions. */
const CATEGORIES: Record<string, string[]> = {
  secrets: [
    "secret.created",
    "secret.updated",
    "secret.deleted",
    "secret.revealed",
    "secret.version_revealed",
    "secret.rolled_back",
    "secrets.exported",
    "secrets.imported",
  ],
  access: [
    "member.role_changed",
    "member.removed",
    "member.left",
    "invitation.created",
    "invitation.revoked",
    "invitation.accepted",
    "environment.access_granted",
    "environment.access_revoked",
    "environment.access_denied",
  ],
  project: ["project.created", "project.updated", "project.deleted"],
  integrations: [
    "integration.connected",
    "integration.updated",
    "integration.disconnected",
    "integration.synced",
    "integration.deploy_triggered",
  ],
};

function parseDate(value: string | null, endOfDay: boolean): Date | null {
  if (!value) return null;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const d = new Date(dateOnly ? `${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z` : value);
  if (Number.isNaN(d.getTime())) throw new ApiError(400, "Invalid date filter.");
  return d;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function decodeCursor(value: string | null): { at: Date; id: string } | null {
  if (!value) return null;
  try {
    const [iso, id] = Buffer.from(value, "base64url").toString("utf8").split("|");
    const at = new Date(iso);
    if (!id || Number.isNaN(at.getTime())) throw new Error();
    return { at, id };
  } catch {
    throw new ApiError(400, "Invalid cursor.");
  }
}

const encodeCursor = (e: Pick<AuditLogDoc, "at" | "_id">) =>
  Buffer.from(`${e.at.toISOString()}|${e._id}`).toString("base64url");

/**
 * Read-only audit trail for one project, newest first, with cursor pagination.
 * Owners and admins only, browser sessions only. Events never contain secret
 * values or tokens (see lib/audit.ts), so entries are returned as stored.
 */
export const GET = handler(async (req: Request, { params }: Ctx) => {
  const userId = await requireUserId();
  const { projectId } = await params;
  await authorizeProject(userId, projectId, "audit:read");

  const url = new URL(req.url);
  const limitParam = Number(url.searchParams.get("limit") ?? DEFAULT_LIMIT);
  const limit = Number.isInteger(limitParam)
    ? Math.min(Math.max(limitParam, 1), MAX_LIMIT)
    : DEFAULT_LIMIT;

  const action = url.searchParams.get("action");
  if (action !== null && !/^[a-z]+(\.[a-z_]+)?$/.test(action))
    throw new ApiError(400, "Invalid action filter.");
  const cursor = decodeCursor(url.searchParams.get("cursor"));

  const category = url.searchParams.get("category");
  if (category && !(category in CATEGORIES))
    throw new ApiError(400, "Invalid category filter.");
  const actor = url.searchParams.get("actor");
  if (actor && !/^[\w.:-]{1,128}$/.test(actor))
    throw new ApiError(400, "Invalid actor filter.");
  const from = parseDate(url.searchParams.get("from"), false);
  const to = parseDate(url.searchParams.get("to"), true);

  const query: Record<string, unknown> = { projectId };
  if (action) query.action = action;
  else if (category) query.action = { $in: CATEGORIES[category] };
  if (actor) query.actorId = actor;

  const and: Record<string, unknown>[] = [];
  if (from || to)
    and.push({
      at: { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) },
    });
  if (cursor)
    and.push({
      $or: [
        { at: { $lt: cursor.at } },
        { at: cursor.at, _id: { $lt: cursor.id } },
      ],
    });
  if (and.length) query.$and = and;

  const { auditLogs, memberships } = await collections();
  const rows = await auditLogs
    .find(query)
    .sort({ at: -1, _id: -1 })
    .limit(limit + 1)
    .toArray();
  const page = rows.slice(0, limit);

  const actorIds = [...new Set(page.map((r) => r.actorId))];
  const people = await memberships
    .find({ projectId, userId: { $in: actorIds } })
    .toArray();
  const emailOf = new Map(people.map((m) => [m.userId, m.email ?? null]));

  return json({
    events: page.map((r) => ({
      id: r._id,
      at: r.at.toISOString(),
      action: r.action,
      targetType: r.targetType,
      targetId: r.targetId,
      metadata: r.metadata,
      actor: {
        userId: r.actorId,
        email: emailOf.get(r.actorId) ?? null,
        isYou: r.actorId === userId,
        isMember: emailOf.has(r.actorId),
      },
    })),
    nextCursor:
      rows.length > limit ? encodeCursor(page[page.length - 1]) : null,
  });
});
