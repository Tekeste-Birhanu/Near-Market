import { Router, type Response } from "express";
import { requireAdmin } from "../auth/admin-auth.ts";
import type { AuthUserRepository } from "../auth/user-repository.ts";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type UserFilter = "all" | "active" | "blocked";
type UserCursor = { createdAt: Date; id: string };
export type AdminUserQuery = { search?: string; filter: UserFilter; limit: number; cursor?: UserCursor };
export type AdminUserRecord = { id: string; displayName: string; telegramUsername: string | null; isBlocked: boolean; createdAt: Date };

export interface AdminUserRepository {
  findUsers(query: AdminUserQuery): Promise<AdminUserRecord[]>;
  blockUser(userId: string): Promise<boolean>;
  unblockUser(userId: string): Promise<boolean>;
}

function sendError(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ error: { code, message } });
}

function decodeCursor(raw: string): UserCursor | undefined {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (!parsed || typeof parsed !== "object" || !("id" in parsed) || !("createdAt" in parsed)) return undefined;
    const { id, createdAt } = parsed as { id: unknown; createdAt: unknown };
    if (typeof id !== "string" || !UUID_PATTERN.test(id) || typeof createdAt !== "string") return undefined;
    const date = new Date(createdAt);
    return Number.isNaN(date.getTime()) ? undefined : { id, createdAt: date };
  } catch { return undefined; }
}

function encodeCursor(user: AdminUserRecord): string {
  return Buffer.from(JSON.stringify({ id: user.id, createdAt: user.createdAt.toISOString() })).toString("base64url");
}

function parseQuery(raw: Record<string, unknown>): AdminUserQuery | undefined {
  if (Object.keys(raw).some((key) => !["search", "filter", "limit", "cursor"].includes(key))) return undefined;
  if (raw.search !== undefined && typeof raw.search !== "string") return undefined;
  const search = typeof raw.search === "string" ? raw.search.trim() : "";
  if (search.length > 100) return undefined;
  const filter = raw.filter ?? "all";
  if (filter !== "all" && filter !== "active" && filter !== "blocked") return undefined;
  const limit = raw.limit === undefined ? 20 : typeof raw.limit === "string" && /^\d+$/.test(raw.limit) ? Number(raw.limit) : NaN;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) return undefined;
  let cursor: UserCursor | undefined;
  if (raw.cursor !== undefined) {
    if (typeof raw.cursor !== "string") return undefined;
    cursor = decodeCursor(raw.cursor);
    if (!cursor) return undefined;
  }
  return { ...(search ? { search } : {}), filter, limit, ...(cursor ? { cursor } : {}) };
}

export function createAdminUsersRouter(userAuth?: AuthUserRepository, repository?: AdminUserRepository) {
  const router = Router();
  router.use(requireAdmin(userAuth));

  router.get("/", async (req, res) => {
    if (!repository) return sendError(res, 503, "ADMIN_UNAVAILABLE", "User management is unavailable.");
    const query = parseQuery(req.query as Record<string, unknown>);
    if (!query) return sendError(res, 400, "VALIDATION_ERROR", "The user query is invalid.");
    const records = await repository.findUsers(query);
    const hasMore = records.length > query.limit;
    const items = records.slice(0, query.limit);
    res.status(200).json({
      items: items.map(({ id, displayName, telegramUsername, isBlocked, createdAt }) => ({ id, displayName, telegramUsername, isBlocked, createdAt: createdAt.toISOString() })),
      nextCursor: hasMore && items.length ? encodeCursor(items[items.length - 1]) : null,
    });
  });

  router.post("/:userId/block", async (req, res) => {
    if (!repository) return sendError(res, 503, "ADMIN_UNAVAILABLE", "User management is unavailable.");
    const userId = req.params.userId;
    if (!UUID_PATTERN.test(userId)) return sendError(res, 404, "NOT_FOUND", "The requested user was not found.");
    if (userId === res.locals.authenticatedUserId) return sendError(res, 409, "CANNOT_BLOCK_SELF", "Administrators cannot block their own account.");
    if (!await repository.blockUser(userId)) return sendError(res, 404, "NOT_FOUND", "The requested user was not found.");
    res.status(204).end();
  });

  router.post("/:userId/unblock", async (req, res) => {
    if (!repository) return sendError(res, 503, "ADMIN_UNAVAILABLE", "User management is unavailable.");
    const userId = req.params.userId;
    if (!UUID_PATTERN.test(userId)) return sendError(res, 404, "NOT_FOUND", "The requested user was not found.");
    if (!await repository.unblockUser(userId)) return sendError(res, 404, "NOT_FOUND", "The requested user was not found.");
    res.status(204).end();
  });
  return router;
}
