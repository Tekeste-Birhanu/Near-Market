import type { Express } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.ts";
import { createPrismaAdminDashboardRepository } from "../src/admin/dashboard-repository.ts";
import { issueAccessToken } from "../src/auth/session-token.ts";
import type { AuthUserRepository } from "../src/auth/user-repository.ts";
import type { AdminDashboardMetrics } from "../src/admin/dashboard-route.ts";
import type { PrismaClient } from "../generated/prisma/client.ts";

const secret = "local-test-session-secret-32-characters-minimum";
const adminId = "30f175ea-d21e-43df-a0f8-3a7d273acaa2";
const regularId = "dd7320bd-8c00-42ee-8da5-5fe6bcba7cf2";

function makeApp(metrics: AdminDashboardMetrics) {
  const userRepository: AuthUserRepository = {
    upsertTelegramUser: vi.fn(),
    getUserById: vi.fn(async (userId) => ({
      id: userId, telegramUsername: null, displayName: "User", phoneNumber: null, isAdmin: userId === adminId, isBlocked: false,
    })),
    updateProfile: vi.fn(),
  };
  return createApp({ rateLimitMax: 100, rateLimitWindowMs: 60_000 }, {
    auth: { sessionSecret: secret, userRepository },
    adminDashboardRepository: { getMetrics: vi.fn(async () => metrics) },
  });
}

function getDashboard(app: Express, userId: string) {
  const token = issueAccessToken(userId, secret).accessToken;
  return request(app).get("/api/v1/admin/dashboard").set("Authorization", `Bearer ${token}`);
}

describe("admin dashboard metrics", () => {
  it("returns metrics to admins and denies regular users", async () => {
    const metrics: AdminDashboardMetrics = {
      totalUsers: 5,
      totalListings: 4,
      totalItemListings: 3,
      totalHouseRentalListings: 1,
      itemListingsByCategory: [
        { category: "CLOTHING", count: 1 },
        { category: "ELECTRONICS", count: 1 },
        { category: "OTHER", count: 1 },
      ],
    };
    const app = makeApp(metrics);
    expect((await getDashboard(app, regularId)).status).toBe(403);
    const response = await getDashboard(app, adminId);
    expect(response.status).toBe(200);
    expect(response.body).toEqual(metrics);
  });

  it("calculates retained totals and returns zero-count categories in stable count order", async () => {
    const prisma = {
      user: { count: vi.fn(async () => 3) },
      listing: {
        count: vi.fn()
          .mockResolvedValueOnce(5)
          .mockResolvedValueOnce(4)
          .mockResolvedValueOnce(1),
        groupBy: vi.fn(async () => [
          { itemCategory: "OTHER", _count: { _all: 2 } },
          { itemCategory: "CLOTHING", _count: { _all: 2 } },
        ]),
      },
    } as unknown as PrismaClient;
    const metrics = await createPrismaAdminDashboardRepository(prisma).getMetrics();

    expect(metrics).toEqual({
      totalUsers: 3,
      totalListings: 5,
      totalItemListings: 4,
      totalHouseRentalListings: 1,
      itemListingsByCategory: [
        { category: "CLOTHING", count: 2 },
        { category: "OTHER", count: 2 },
        { category: "ELECTRONICS", count: 0 },
      ],
    });
  });

  it("returns all categories with zero counts when there are no item listings", async () => {
    const prisma = {
      user: { count: vi.fn(async () => 0) },
      listing: {
        count: vi.fn(async () => 0),
        groupBy: vi.fn(async () => []),
      },
    } as unknown as PrismaClient;
    const metrics = await createPrismaAdminDashboardRepository(prisma).getMetrics();
    expect(metrics.itemListingsByCategory).toEqual([
      { category: "CLOTHING", count: 0 },
      { category: "ELECTRONICS", count: 0 },
      { category: "OTHER", count: 0 },
    ]);
  });
});
