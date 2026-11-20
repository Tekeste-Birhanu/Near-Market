import type { Express } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.ts";
import { issueAccessToken } from "../src/auth/session-token.ts";
import type { ListingFeedRecord } from "../src/listings/feed-route.ts";
import type { ListingDetailsRecord, ListingImageRecord, ListingReadRepository, PublicSellerProfile } from "../src/listings/read-route.ts";

const sessionSecret = "local-test-session-secret-32-characters-minimum";
const buyerId = "dd7320bd-8c00-42da-9ee8-5fe6bcba7cf2";
const sellerId = "aefedb35-bf6e-4e3d-b890-18e7ee172428";
const adminId = "30f175ea-d21e-43df-a0f8-3a7d273acaa2";
const listingId = "46da38a3-ae4c-4d62-8b8c-5414fe7f341c";
const imageId = "61269c61-347d-4b5a-899b-9f84d6726473";
const listingCreatedAt = new Date("2026-11-07T12:00:00.000Z");

function summary(overrides: Partial<ListingFeedRecord> = {}): ListingFeedRecord {
  return {
    id: listingId,
    listingType: "ITEM",
    title: "Samsung phone",
    description: "Used phone in good condition",
    itemCategory: "ELECTRONICS",
    itemCondition: "USED",
    rentalAddress: null,
    priceAmount: "12500.00",
    availabilityStatus: "AVAILABLE",
    createdAt: listingCreatedAt,
    updatedAt: listingCreatedAt,
    images: [{ id: imageId, position: 1 }],
    seller: { id: sellerId, displayName: "Hana", telegramUsername: "hana" },
    ...overrides,
  };
}

function details(overrides: Partial<ListingDetailsRecord> = {}): ListingDetailsRecord {
  return {
    ...summary(),
    sellerId,
    seller: { id: sellerId, displayName: "Hana", telegramUsername: "hana", phoneNumber: "+251911234567" },
    images: [
      { id: imageId, position: 1 },
      { id: "bd8dafec-f6a8-4cb0-9a49-825c7f6edc37", position: 2 },
    ],
    ...overrides,
  };
}

function makeRepository(options: {
  listing?: ListingDetailsRecord | null;
  image?: ListingImageRecord | null;
  viewerIsAdmin?: boolean;
  seller?: PublicSellerProfile | null;
  sellerListings?: ListingFeedRecord[];
} = {}) {
  const record = options.listing === undefined ? details() : options.listing;
  const image = options.image === undefined ? {
    sellerId,
    status: record?.availabilityStatus ?? "AVAILABLE",
    mimeType: "image/jpeg",
    imageBytes: Buffer.from([255, 216, 255]),
  } : options.image;
  const seller = options.seller === undefined
    ? { id: sellerId, displayName: "Hana", telegramUsername: "hana" }
    : options.seller;
  const repository: ListingReadRepository = {
    findAvailable: vi.fn(async () => []),
    findDetails: vi.fn(async () => record),
    findImage: vi.fn(async (requestedListingId, requestedImageId) =>
      requestedListingId === listingId && requestedImageId === imageId ? image : null),
    findViewerRole: vi.fn(async (userId) => userId === adminId ? { isAdmin: options.viewerIsAdmin ?? true } : { isAdmin: false }),
    findSeller: vi.fn(async () => seller),
    findSellerAvailable: vi.fn(async () => options.sellerListings ?? [summary()]),
  };
  const app = createApp(
    { rateLimitMax: 100, rateLimitWindowMs: 60_000 },
    { auth: { sessionSecret }, listingReadRepository: repository },
  );
  return { app, repository };
}

function authed(app: Express, path: string, userId = buyerId) {
  const token = issueAccessToken(userId, sessionSecret).accessToken;
  return request(app).get(path).set("Authorization", `Bearer ${token}`);
}

describe("listing details and seller endpoints", () => {
  it("returns full details and the optional seller phone for an available listing", async () => {
    const { app, repository } = makeRepository();
    const response = await authed(app, `/api/v1/listings/${listingId}`);

    expect(response.status).toBe(200);
    expect(response.body.images).toHaveLength(2);
    expect(response.body.seller.phoneNumber).toBe("+251911234567");
    expect(response.body.seller).not.toHaveProperty("telegramUserId");
    expect(repository.findViewerRole).not.toHaveBeenCalled();
  });

  it("lets the owner retrieve a retained listing and returns unavailable to other buyers", async () => {
    const soldListing = details({ availabilityStatus: "SOLD" });
    const { app } = makeRepository({ listing: soldListing });

    expect((await authed(app, `/api/v1/listings/${listingId}`, sellerId)).status).toBe(200);
    const response = await authed(app, `/api/v1/listings/${listingId}`);
    expect(response.status).toBe(410);
    expect(response.body.error.code).toBe("LISTING_UNAVAILABLE");
  });

  it("lets a stored admin retrieve a retained listing", async () => {
    const { app } = makeRepository({ listing: details({ availabilityStatus: "UNAVAILABLE" }) });
    expect((await authed(app, `/api/v1/listings/${listingId}`, adminId)).status).toBe(200);
  });

  it("returns not found for deleted or malformed listing IDs", async () => {
    const { app } = makeRepository({ listing: null });
    expect((await authed(app, `/api/v1/listings/${listingId}`)).status).toBe(404);
    expect((await authed(app, "/api/v1/listings/not-a-uuid")).status).toBe(404);
  });

  it("returns seller profile without a phone number", async () => {
    const { app } = makeRepository();
    const response = await authed(app, `/api/v1/sellers/${sellerId}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ id: sellerId, displayName: "Hana", telegramUsername: "hana" });
    expect(response.body).not.toHaveProperty("phoneNumber");
  });

  it("returns only available seller listings and supports type and cursor pagination", async () => {
    const first = summary();
    const records = [first, summary({
      id: "f5e039c0-34a5-4be9-8ea7-a0e88fd20ad5",
      createdAt: new Date("2026-11-06T12:00:00.000Z"),
    })];
    const { app, repository } = makeRepository({ sellerListings: records });
    const response = await authed(app, `/api/v1/sellers/${sellerId}/listings?type=ITEM&limit=1`);

    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(1);
    expect(response.body.nextCursor).toEqual(expect.any(String));
    expect(response.body.items[0].seller).not.toHaveProperty("phoneNumber");
    expect(repository.findSellerAvailable).toHaveBeenCalledWith(sellerId, { type: "ITEM", limit: 1 });
    await authed(app, `/api/v1/sellers/${sellerId}/listings?limit=1&cursor=${response.body.nextCursor}`);
    expect(repository.findSellerAvailable).toHaveBeenNthCalledWith(2, sellerId, {
      limit: 1,
      cursor: { createdAt: first.createdAt, id: first.id },
    });
  });

  it("rejects unsupported seller-listing query fields and reports missing sellers", async () => {
    const { app } = makeRepository();
    expect((await authed(app, `/api/v1/sellers/${sellerId}/listings?q=phone`)).status).toBe(400);
    const missingSellerApp = makeRepository({ seller: null }).app;
    expect((await authed(missingSellerApp, `/api/v1/sellers/${sellerId}/listings`)).status).toBe(404);
  });
});

describe("listing image access", () => {
  it("returns image bytes with the stored media type and nosniff protection", async () => {
    const { app } = makeRepository();
    const response = await authed(app, `/api/v1/listings/${listingId}/images/${imageId}`);

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("image/jpeg");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(Buffer.from(response.body)).toEqual(Buffer.from([255, 216, 255]));
  });

  it("allows owners and admins to view retained listing images but hides them from other buyers", async () => {
    const soldImage = {
      sellerId,
      status: "SOLD" as const,
      mimeType: "image/png",
      imageBytes: Buffer.from([1, 2, 3]),
    };
    const { app } = makeRepository({ image: soldImage });

    expect((await authed(app, `/api/v1/listings/${listingId}/images/${imageId}`, sellerId)).status).toBe(200);
    expect((await authed(app, `/api/v1/listings/${listingId}/images/${imageId}`, adminId)).status).toBe(200);
    expect((await authed(app, `/api/v1/listings/${listingId}/images/${imageId}`)).status).toBe(404);
  });

  it("returns not found for mismatched image IDs and does not serve unapproved media types", async () => {
    const mismatch = makeRepository();
    expect((await authed(mismatch.app, `/api/v1/listings/${listingId}/images/bd8dafec-f6a8-4cb0-9a49-825c7f6edc37`)).status).toBe(404);
    expect(mismatch.repository.findImage).toHaveBeenCalledWith(listingId, "bd8dafec-f6a8-4cb0-9a49-825c7f6edc37");
    const missingImageApp = makeRepository({ image: null }).app;
    expect((await authed(missingImageApp, `/api/v1/listings/${listingId}/images/${imageId}`)).status).toBe(404);
    const invalidTypeApp = makeRepository({ image: {
      sellerId,
      status: "AVAILABLE",
      mimeType: "text/html",
      imageBytes: Buffer.from("<script>"),
    } }).app;
    expect((await authed(invalidTypeApp, `/api/v1/listings/${listingId}/images/${imageId}`)).status).toBe(500);
  });
});
