import type { Express } from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.ts";
import { issueAccessToken } from "../src/auth/session-token.ts";
import type { AuthUserRepository } from "../src/auth/user-repository.ts";
import type { AdminListingRepository } from "../src/admin/listings-route.ts";
import type { ListingDetailsRecord, ListingImageRecord } from "../src/listings/read-route.ts";
import type { ListingFeedRecord } from "../src/listings/feed-route.ts";

const secret = "local-test-session-secret-32-characters-minimum";
const adminId = "30f175ea-d21e-43df-a0f8-3a7d273acaa2";
const regularId = "dd7320bd-8c00-42ee-8da5-5fe6bcba7cf2";
const sellerId = "aefedb35-bf6e-4e3d-b890-18e7ee172428";
const listingId = "46da38a3-ae4c-4d62-8b8c-5414fe7f341c";
const imageId = "61269c61-347d-4b5a-899b-9f84d6726473";
const privateTelegramId = 123456789012345n;

function record(): ListingFeedRecord {
  const createdAt = new Date("2026-11-07T12:00:00.000Z");
  return {
    id: listingId,
    listingType: "ITEM",
    title: "Phone listing",
    description: "Listing details",
    itemCategory: "ELECTRONICS",
    itemCondition: "USED",
    rentalAddress: null,
    priceAmount: "12500.00",
    availabilityStatus: "SOLD",
    createdAt,
    updatedAt: createdAt,
    images: [{ id: imageId, position: 1 }],
    seller: { id: sellerId, displayName: "Seller", telegramUsername: "seller" },
  };
}

function makeApp(overrides: { admin?: boolean; notifySeller?: (telegramUserId: string) => Promise<void> } = {}) {
  const listing = record();
  const details: ListingDetailsRecord = {
    ...listing,
    sellerId,
    seller: { ...listing.seller, phoneNumber: "+251911000000" },
    images: [{ id: imageId, position: 1 }, { id: "bd8dafec-f6a8-4cb0-9a49-825c7f6edc37", position: 2 }],
  };
  const image: ListingImageRecord = {
    sellerId,
    status: "SOLD",
    mimeType: "image/jpeg",
    imageBytes: Buffer.from([255, 216, 255]),
  };
  const repository: AdminListingRepository = {
    findRetained: vi.fn(async () => [listing]),
    findDetails: vi.fn(async () => details),
    findImage: vi.fn(async () => image),
    removeListing: vi.fn(async () => ({ sellerTelegramUserId: privateTelegramId })),
  };
  const userRepository: AuthUserRepository = {
    upsertTelegramUser: vi.fn(),
    getUserById: vi.fn(async (userId) => ({
      id: userId,
      telegramUsername: null,
      displayName: "User",
      phoneNumber: null,
      isAdmin: userId === adminId && (overrides.admin ?? true),
    })),
    updateProfile: vi.fn(),
  };
  const app = createApp({ rateLimitMax: 100, rateLimitWindowMs: 60_000 }, {
    auth: { sessionSecret: secret, userRepository },
    adminListingRepository: repository,
    notifyListingSeller: overrides.notifySeller,
  });
  return { app, repository };
}

function asUser(app: Express, userId: string, method: "get" | "delete", path: string) {
  const token = issueAccessToken(userId, secret).accessToken;
  return request(app)[method](path).set("Authorization", `Bearer ${token}`);
}

afterEach(() => vi.restoreAllMocks());

describe("admin listing review and removal", () => {
  it("requires a stored admin for feeds, details, images, and removal", async () => {
    const { app, repository } = makeApp();
    const paths = [
      ["get", "/api/v1/admin/listings?type=ITEM"],
      ["get", `/api/v1/admin/listings/${listingId}`],
      ["get", `/api/v1/admin/listings/${listingId}/images/${imageId}`],
      ["delete", `/api/v1/admin/listings/${listingId}`],
    ] as const;

    for (const [method, path] of paths) {
      expect((await asUser(app, regularId, method, path)).status).toBe(403);
    }
    expect(repository.findRetained).not.toHaveBeenCalled();
    expect(repository.findDetails).not.toHaveBeenCalled();
    expect(repository.findImage).not.toHaveBeenCalled();
    expect(repository.removeListing).not.toHaveBeenCalled();
  });

  it("returns retained sold listings and forwards item filters to the repository", async () => {
    const { app, repository } = makeApp();
    const response = await asUser(app, adminId, "get", "/api/v1/admin/listings?type=ITEM&sort=OLDEST&q=phone&category=ELECTRONICS&condition=USED&minPrice=100&limit=7");

    expect(response.status).toBe(200);
    expect(response.body.items[0]).toMatchObject({ id: listingId, status: "SOLD" });
    expect(repository.findRetained).toHaveBeenCalledWith({
      type: "ITEM", sort: "OLDEST", q: "phone", category: "ELECTRONICS", condition: "USED", minPrice: "100", limit: 7,
    });
  });

  it("returns retained listing details and privately cached image bytes to admins", async () => {
    const { app } = makeApp();
    const details = await asUser(app, adminId, "get", `/api/v1/admin/listings/${listingId}`);
    expect(details.status).toBe(200);
    expect(details.body.status).toBe("SOLD");
    expect(details.body.images).toHaveLength(2);
    expect(details.body.images[0].url).toBe(`/api/v1/admin/listings/${listingId}/images/${imageId}`);

    const photo = await asUser(app, adminId, "get", `/api/v1/admin/listings/${listingId}/images/${imageId}`);
    expect(photo.status).toBe(200);
    expect(photo.headers["cache-control"]).toBe("private, no-store");
    expect(photo.headers["x-content-type-options"]).toBe("nosniff");
    expect(photo.body).toEqual(Buffer.from([255, 216, 255]));
  });

  it("removes a listing before notifying the seller, without a reason", async () => {
    const sequence: string[] = [];
    const notifySeller = vi.fn(async (telegramUserId: string) => {
      sequence.push(`notify:${telegramUserId}`);
    });
    const { app, repository } = makeApp({ notifySeller });
    vi.mocked(repository.removeListing).mockImplementation(async () => {
      sequence.push("remove");
      return { sellerTelegramUserId: privateTelegramId };
    });

    const response = await asUser(app, adminId, "delete", `/api/v1/admin/listings/${listingId}`);
    expect(response.status).toBe(204);
    expect(sequence).toEqual(["remove", `notify:${privateTelegramId}`]);
    expect(notifySeller).toHaveBeenCalledWith(privateTelegramId.toString());
  });

  it("does not restore the listing or log Telegram identifiers when notification fails", async () => {
    const logger = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { app, repository } = makeApp({ notifySeller: async () => { throw new Error(`failed for ${privateTelegramId}`); } });
    const response = await asUser(app, adminId, "delete", `/api/v1/admin/listings/${listingId}`);

    expect(response.status).toBe(204);
    expect(repository.removeListing).toHaveBeenCalledOnce();
    expect(logger).toHaveBeenCalledWith("Seller notification failed after admin listing removal.");
    expect(logger).not.toHaveBeenCalledWith(expect.stringContaining(privateTelegramId.toString()));
  });
});
