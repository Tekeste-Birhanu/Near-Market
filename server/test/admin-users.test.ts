import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { AuthUserRepository } from "../src/auth/user-repository.ts";
import { issueAccessToken } from "../src/auth/session-token.ts";
import { createApp } from "../src/app.ts";
import { createPrismaAdminUserRepository } from "../src/admin/users-repository.ts";
import type { AdminUserRecord, AdminUserRepository } from "../src/admin/users-route.ts";
import type { PrismaClient } from "../generated/prisma/client.ts";

const secret = "local-test-session-secret-32-characters-minimum";
const adminId = "dd7320bd-8c00-42da-9ee8-5fe6bcba7cf2";
const targetId = "aefedb35-bf6e-4e3d-b890-18e7ee172428";

function user(id: string, overrides: Partial<AdminUserRecord> = {}): AdminUserRecord {
  return {
    id,
    displayName: "Test User",
    telegramUsername: "test_user",
    isBlocked: false,
    createdAt: new Date("2026-11-07T12:00:00.000Z"),
    ...overrides,
  };
}

function makeApp(repository: AdminUserRepository, admin = true) {
  const authRepository: AuthUserRepository = {
    upsertTelegramUser: vi.fn(),
    getUserById: vi.fn(async (id) => ({
      id,
      telegramUsername: null,
      displayName: "Admin",
      phoneNumber: null,
      isAdmin: admin,
      isBlocked: false,
    })),
    updateProfile: vi.fn(),
  };
  const app = createApp({ rateLimitMax: 100, rateLimitWindowMs: 60_000 }, {
    auth: { sessionSecret: secret, userRepository: authRepository },
    adminUserRepository: repository,
  });
  return app;
}

function authenticated(test: request.Test, id = adminId) {
  return test.set("Authorization", `Bearer ${issueAccessToken(id, secret).accessToken}`);
}

describe("admin user management routes", () => {
  it("returns paginated user rows without private fields", async () => {
    const records = [user(targetId, { isBlocked: true }), user("4d239e77-6f65-4cc7-a791-3d7d24eba9b7", { isBlocked: true })];
    const findUsers = vi.fn(async () => records);
    const repository: AdminUserRepository = { findUsers, blockUser: vi.fn(), unblockUser: vi.fn() };
    const response = await authenticated(request(makeApp(repository)).get("/api/v1/admin/users?filter=blocked&limit=1&search=Test"));

    expect(response.status).toBe(200);
    expect(findUsers).toHaveBeenCalledWith({ filter: "blocked", limit: 1, search: "Test" });
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0]).toEqual({
      id: targetId,
      displayName: "Test User",
      telegramUsername: "test_user",
      isBlocked: true,
      createdAt: "2026-11-07T12:00:00.000Z",
    });
    expect(response.body.items[0]).not.toHaveProperty("phoneNumber");
    expect(response.body.items[0]).not.toHaveProperty("telegramUserId");
    expect(response.body.items[0]).not.toHaveProperty("isAdmin");
    expect(response.body.nextCursor).toEqual(expect.any(String));
  });

  it("denies regular users access to the user list", async () => {
    const repository: AdminUserRepository = { findUsers: vi.fn(), blockUser: vi.fn(), unblockUser: vi.fn() };
    const response = await authenticated(request(makeApp(repository, false)).get("/api/v1/admin/users"));
    expect(response.status).toBe(403);
    expect(repository.findUsers).not.toHaveBeenCalled();
  });

  it("prevents self-blocking and calls atomic block or unblock operations for other users", async () => {
    const repository: AdminUserRepository = {
      findUsers: vi.fn(),
      blockUser: vi.fn(async () => true),
      unblockUser: vi.fn(async () => true),
    };
    const app = makeApp(repository);
    const self = await authenticated(request(app).post(`/api/v1/admin/users/${adminId}/block`));
    expect(self.status).toBe(409);
    expect(self.body.error.code).toBe("CANNOT_BLOCK_SELF");
    expect(repository.blockUser).not.toHaveBeenCalled();

    expect((await authenticated(request(app).post(`/api/v1/admin/users/${targetId}/block`))).status).toBe(204);
    expect((await authenticated(request(app).post(`/api/v1/admin/users/${targetId}/unblock`))).status).toBe(204);
    expect(repository.blockUser).toHaveBeenCalledWith(targetId);
    expect(repository.unblockUser).toHaveBeenCalledWith(targetId);
  });
});

describe("Prisma admin user repository", () => {
  it("applies active-status, text-search, and stable cursor filters to the user query", async () => {
    const cursorDate = new Date("2026-11-06T12:00:00.000Z");
    const prisma = {
      user: { findMany: vi.fn(async () => []), update: vi.fn() },
    };
    const repository = createPrismaAdminUserRepository(prisma as unknown as PrismaClient);
    await repository.findUsers({
      filter: "active",
      search: "hana",
      limit: 10,
      cursor: { createdAt: cursorDate, id: targetId },
    });

    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        isBlocked: false,
        OR: [
          { displayName: { contains: "hana", mode: "insensitive" } },
          { telegramUsername: { contains: "hana", mode: "insensitive" } },
        ],
        AND: [{
          OR: [
            { createdAt: { lt: cursorDate } },
            { createdAt: cursorDate, id: { lt: targetId } },
          ],
        }],
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 11,
    }));
  });

  it("atomically blocks a user and deletes their listings", async () => {
    const tx = {
      user: { findUnique: vi.fn(async () => ({ id: targetId })), update: vi.fn(async () => ({})) },
      listing: { deleteMany: vi.fn(async () => ({ count: 2 })) },
    };
    const prisma = {
      $transaction: vi.fn(async (work: (transaction: typeof tx) => Promise<boolean>) => work(tx)),
      user: { update: vi.fn() },
    };
    const repository = createPrismaAdminUserRepository(prisma as unknown as PrismaClient);

    expect(await repository.blockUser(targetId)).toBe(true);
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: targetId }, data: { isBlocked: true } });
    expect(tx.listing.deleteMany).toHaveBeenCalledWith({ where: { sellerId: targetId } });
  });
});
