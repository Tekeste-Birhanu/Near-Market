import request from "supertest";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.ts";
import { issueAccessToken } from "../src/auth/session-token.ts";
import { createPrismaListingLifecycleRepository } from "../src/listings/lifecycle-repository.ts";
import type { ListingLifecycleRepository } from "../src/listings/lifecycle-route.ts";
import type { ListingDetailsRecord } from "../src/listings/read-route.ts";
import type { PrismaClient } from "../generated/prisma/client.ts";

const secret = "local-test-session-secret-32-characters-minimum";
const ownerId = "dd7320bd-8c00-42da-9ee8-5fe6bcba7cf2";
const otherId = "0c3a2c51-c3df-4d8a-8ef0-7ac4a63fb8a1";
const listingId = "46da38a3-ae4c-4d62-8b8c-5414fe7f341c";
const otherToken = issueAccessToken(otherId, secret).accessToken;

function listing(overrides: Partial<ListingDetailsRecord> = {}): ListingDetailsRecord {
  return {
    id: listingId,
    sellerId: ownerId,
    listingType: "ITEM",
    title: "Phone",
    description: "Used phone",
    itemCategory: "ELECTRONICS",
    itemCondition: "USED",
    rentalAddress: null,
    priceAmount: "10.00",
    availabilityStatus: "AVAILABLE",
    createdAt: new Date("2026-11-07T12:00:00.000Z"),
    updatedAt: new Date("2026-11-07T12:00:00.000Z"),
    images: [{ id: "61269c61-347d-4b5a-899b-9f84d6726470", position: 1 }],
    seller: { id: ownerId, displayName: "Hana", telegramUsername: "hana", phoneNumber: null },
    ...overrides,
  };
}

const validFields = (type = "ITEM") => ({
  type,
  title: "Updated phone",
  description: "Updated description",
  priceAmount: "0",
  ...(type === "ITEM" ? { category: "OTHER", condition: "NEW" } : { rentalAddress: "Near the market" }),
});

function app(repository: ListingLifecycleRepository) {
  return createApp({ rateLimitMax: 100, rateLimitWindowMs: 60_000 }, { auth: { sessionSecret: secret }, listingLifecycleRepository: repository });
}

function auth(test: request.Test, token = issueAccessToken(ownerId, secret).accessToken) {
  return test.set("Authorization", `Bearer ${token}`);
}

async function pngImage() {
  return sharp({ create: { width: 8, height: 6, channels: 3, background: "blue" } }).png().toBuffer();
}

describe("listing lifecycle API", () => {
  it("returns the authenticated owner's sold and unavailable listings, scoped and paginated by type", async () => {
    const sold = listing({ availabilityStatus: "SOLD" });
    const findMine = vi.fn(async () => [sold]);
    const response = await auth(request(app({ findMine, updateOwnedListing: vi.fn(), updateOwnedStatus: vi.fn(), deleteOwnedListing: vi.fn() })).get("/api/v1/me/listings?type=ITEM&limit=1"));

    expect(response.status).toBe(200);
    expect(response.body.items[0]).toMatchObject({ id: listingId, status: "SOLD" });
    expect(findMine).toHaveBeenCalledWith(ownerId, { type: "ITEM", limit: 1 });
  });

  it("updates owner data and compresses a complete replacement photo set", async () => {
    const updateOwnedListing = vi.fn(async (_userId, _listingId, input) => ({ kind: "updated" as const, listing: listing({ title: input.title }) }));
    const response = await auth(request(app({ findMine: vi.fn(), updateOwnedListing, updateOwnedStatus: vi.fn(), deleteOwnedListing: vi.fn() }))
      .patch(`/api/v1/listings/${listingId}`)
      .field("type", "ITEM").field("title", "Updated phone").field("description", "Updated description")
      .field("category", "OTHER").field("condition", "NEW").field("priceAmount", "0")
      .attach("images", await pngImage(), { filename: "replacement.png", contentType: "image/png" }));

    expect(response.status).toBe(200);
    expect(updateOwnedListing).toHaveBeenCalledWith(ownerId, listingId, expect.objectContaining({
      title: "Updated phone",
      images: [expect.objectContaining({ mimeType: "image/webp", imageBytes: expect.any(Buffer) })],
    }));
  });

  it("rejects attempts to manage another seller's listing", async () => {
    const deleteOwnedListing = vi.fn(async () => ({ kind: "forbidden" as const }));
    const response = await auth(request(app({ findMine: vi.fn(), updateOwnedListing: vi.fn(), updateOwnedStatus: vi.fn(), deleteOwnedListing } )).delete(`/api/v1/listings/${listingId}`), otherToken);
    expect(response.status).toBe(403);
    expect(deleteOwnedListing).toHaveBeenCalledWith(otherId, listingId);
  });

  it.each([
    ["ITEM", "SOLD", "updated"],
    ["ITEM", "UNAVAILABLE", "invalid-status"],
    ["HOUSE_RENTAL", "UNAVAILABLE", "updated"],
    ["HOUSE_RENTAL", "SOLD", "invalid-status"],
  ])("accepts only status %s/%s according to listing type", async (type, status, result) => {
    const updateOwnedStatus = vi.fn(async () => result === "updated"
      ? { kind: "updated" as const, listing: listing({ listingType: type as "ITEM" | "HOUSE_RENTAL", availabilityStatus: status as "AVAILABLE" | "SOLD" | "UNAVAILABLE" }) }
      : { kind: "invalid-status" as const });
    const response = await auth(request(app({ findMine: vi.fn(), updateOwnedListing: vi.fn(), updateOwnedStatus, deleteOwnedListing: vi.fn() }))
      .patch(`/api/v1/listings/${listingId}/status`).send({ status }));
    expect(response.status).toBe(result === "updated" ? 200 : 400);
    expect(updateOwnedStatus).toHaveBeenCalledWith(ownerId, listingId, status);
  });

  it("requires a non-empty replacement image set when the photo field is present", async () => {
    const updateOwnedListing = vi.fn();
    const response = await auth(request(app({ findMine: vi.fn(), updateOwnedListing, updateOwnedStatus: vi.fn(), deleteOwnedListing: vi.fn() }))
      .patch(`/api/v1/listings/${listingId}`).field("type", "ITEM").field("title", "Phone").field("description", "Description")
      .field("category", "OTHER").field("condition", "USED").field("priceAmount", "1")
      .attach("images", Buffer.from("not an image"), { filename: "bad.png", contentType: "image/png" }));
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_IMAGE");
    expect(updateOwnedListing).not.toHaveBeenCalled();
  });
});

describe("Prisma listing lifecycle repository", () => {
  it("scopes the seller query and retains all availability states", async () => {
    const findMany = vi.fn(async () => []);
    const repository = createPrismaListingLifecycleRepository({ listing: { findMany } } as unknown as PrismaClient);
    await repository.findMine(ownerId, { type: "ITEM", limit: 20 });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { sellerId: ownerId, listingType: "ITEM" },
      take: 21,
    }));
  });

  it("deletes a listing in an owner-checked transaction so schema cascades remove its images", async () => {
    const findUnique = vi.fn(async () => ({ sellerId: ownerId }));
    const deleteListing = vi.fn(async () => ({}));
    const transaction = vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({
      listing: { findUnique, delete: deleteListing },
    }));
    const repository = createPrismaListingLifecycleRepository({ $transaction: transaction } as unknown as PrismaClient);
    await expect(repository.deleteOwnedListing(ownerId, listingId)).resolves.toEqual({ kind: "deleted" });
    expect(findUnique).toHaveBeenCalledWith({ where: { id: listingId }, select: { sellerId: true } });
    expect(deleteListing).toHaveBeenCalledWith({ where: { id: listingId } });
  });

  it("leaves stored images untouched when an edit contains no replacement photos", async () => {
    const findUnique = vi.fn(async () => ({ sellerId: ownerId, listingType: "ITEM" }));
    const update = vi.fn(async () => listing({ title: "Updated phone" }));
    const deleteMany = vi.fn();
    const createMany = vi.fn();
    const transaction = vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({
      listing: { findUnique, update },
      listingImage: { deleteMany, createMany },
    }));
    const repository = createPrismaListingLifecycleRepository({ $transaction: transaction } as unknown as PrismaClient);
    const result = await repository.updateOwnedListing(ownerId, listingId, {
      listingType: "ITEM", title: "Updated phone", description: "Description", itemCategory: "OTHER", itemCondition: "NEW",
      rentalAddress: null, priceAmount: "0", images: [],
    });

    expect(result.kind).toBe("updated");
    expect(deleteMany).not.toHaveBeenCalled();
    expect(createMany).not.toHaveBeenCalled();
  });
});
