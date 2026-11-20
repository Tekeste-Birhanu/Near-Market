import request from "supertest";
import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.ts";
import { issueAccessToken } from "../src/auth/session-token.ts";
import { createPrismaListingCreateRepository } from "../src/listings/create-repository.ts";
import type { ListingCreateInput, ListingCreateRecord, ListingCreateRepository } from "../src/listings/create-route.ts";
import type { PrismaClient } from "../generated/prisma/client.ts";

const sessionSecret = "local-test-session-secret-32-characters-minimum";
const userId = "dd7320bd-8c00-42da-9ee8-5fe6bcba7cf2";
const listingId = "46da38a3-ae4c-4d62-8b8c-5414fe7f341c";
const token = issueAccessToken(userId, sessionSecret).accessToken;
const createdAt = new Date("2026-11-07T12:00:00.000Z");

async function pngImage(): Promise<Buffer<ArrayBufferLike>> {
  return sharp({ create: { width: 8, height: 6, channels: 3, background: { r: 20, g: 80, b: 160 } } })
    .png()
    .toBuffer();
}

function record(input: ListingCreateInput): ListingCreateRecord {
  return {
    id: listingId,
    sellerId: userId,
    listingType: input.listingType,
    title: input.title,
    description: input.description,
    itemCategory: input.itemCategory,
    itemCondition: input.itemCondition,
    rentalAddress: input.rentalAddress,
    priceAmount: input.priceAmount,
    availabilityStatus: "AVAILABLE",
    createdAt,
    updatedAt: createdAt,
    images: input.images.map((_image, index) => ({
      id: `61269c61-347d-4b5a-899b-9f84d672647${index}`,
      position: index + 1,
    })),
    seller: { id: userId, displayName: "Hana", telegramUsername: "hana", phoneNumber: null },
  };
}

function makeApp(repository: ListingCreateRepository = {
  createListing: vi.fn(async (_id: string, input: ListingCreateInput) => ({ kind: "created" as const, listing: record(input) })),
}) {
  return createApp(
    { rateLimitMax: 100, rateLimitWindowMs: 60_000 },
    { auth: { sessionSecret }, listingCreateRepository: repository },
  );
}

function authorized(testRequest: request.Test): request.Test {
  return testRequest.set("Authorization", `Bearer ${token}`);
}

function itemRequest(app: ReturnType<typeof makeApp>, image: Buffer<ArrayBufferLike> = Buffer.alloc(0)) {
  const test = authorized(request(app).post("/api/v1/listings"))
    .field("type", "ITEM")
    .field("title", "  Samsung phone  ")
    .field("description", "  Phone in good condition  ")
    .field("category", "ELECTRONICS")
    .field("condition", "USED")
    .field("priceAmount", "0");
  return image.length ? test.attach("images", image, { filename: "photo.txt", contentType: "text/plain" }) : test;
}

describe("POST /api/v1/listings", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("requires a valid API session", async () => {
    const response = await request(makeApp()).post("/api/v1/listings");
    expect(response.status).toBe(401);
  });

  it("validates and compresses an item image, then publishes an available listing", async () => {
    const createListing = vi.fn(async (_id: string, input: ListingCreateInput) => ({ kind: "created" as const, listing: record(input) }));
    const response = await itemRequest(makeApp({ createListing }), await pngImage());

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      id: listingId,
      type: "ITEM",
      title: "Samsung phone",
      description: "Phone in good condition",
      category: "ELECTRONICS",
      condition: "USED",
      priceAmount: "0",
      status: "AVAILABLE",
      seller: { id: userId, telegramUsername: "hana", phoneNumber: null },
      images: [{ position: 1, url: `/api/v1/listings/${listingId}/images/61269c61-347d-4b5a-899b-9f84d6726470` }],
    });
    expect(createListing).toHaveBeenCalledOnce();
    expect(createListing.mock.calls[0][0]).toBe(userId);
    expect(createListing.mock.calls[0][1].images[0].mimeType).toBe("image/webp");
    expect(createListing.mock.calls[0][1].images[0].imageBytes.length).toBeGreaterThan(0);
  });

  it("accepts a monthly house rental with seller-entered address and contact-for-price", async () => {
    const createListing = vi.fn(async (_id: string, input: ListingCreateInput) => ({ kind: "created" as const, listing: record(input) }));
    const image = await pngImage();
    const response = await authorized(request(makeApp({ createListing })).post("/api/v1/listings")
      .field("type", "HOUSE_RENTAL")
      .field("description", "Whole house for rent")
      .field("rentalAddress", "Near the market")
      .field("priceAmount", "")
      .attach("images", image, { filename: "house.png", contentType: "image/png" }));

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      type: "HOUSE_RENTAL",
      title: "Near the market",
      category: null,
      condition: null,
      rentalAddress: "Near the market",
      priceAmount: null,
      status: "AVAILABLE",
    });
    expect(createListing.mock.calls[0][1].listingType).toBe("HOUSE_RENTAL");
  });

  it("accepts the maximum of three images and preserves their order", async () => {
    const createListing = vi.fn(async (_id: string, input: ListingCreateInput) => ({ kind: "created" as const, listing: record(input) }));
    const image = await pngImage();
    const test = itemRequest(makeApp({ createListing }), image)
      .attach("images", image, { filename: "second.png", contentType: "image/png" })
      .attach("images", image, { filename: "third.png", contentType: "image/png" });
    const response = await test;

    expect(response.status).toBe(201);
    expect(createListing.mock.calls[0][1].images).toHaveLength(3);
    expect(response.body.images.map((entry: { position: number }) => entry.position)).toEqual([1, 2, 3]);
  });

  it("rejects a user whose current stored Telegram username is missing", async () => {
    const response = await itemRequest(makeApp({
      createListing: vi.fn(async () => ({ kind: "username-required" as const })),
    }), await pngImage());

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("USERNAME_REQUIRED");
  });

  it.each([
    ["item with an irrelevant rental address", ["rentalAddress", "somewhere"]],
    ["rental with an irrelevant category", ["category", "OTHER"]],
    ["rental missing its required address", ["rentalAddress", ""]],
    ["unknown field", ["availabilityStatus", "SOLD"]],
    ["invalid item category", ["category", "VEHICLES"]],
    ["invalid item condition", ["condition", "REFURBISHED"]],
    ["empty title", ["title", "   "]],
  ])("rejects %s before persistence", async (_label, [field, value]) => {
    const createListing = vi.fn();
    const test = itemRequest(makeApp({ createListing }), await pngImage()).field(field, value);
    const response = await test;
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(createListing).not.toHaveBeenCalled();
  });

  it.each([["-1"], ["1.234"], ["10000000000"], ["abc"]])("rejects invalid price %s", async (price) => {
    const createListing = vi.fn();
    const response = await itemRequest(makeApp({ createListing }), await pngImage()).field("priceAmount", price);
    expect(response.status).toBe(400);
    expect(createListing).not.toHaveBeenCalled();
  });

  it("requires at least one image and rejects invalid image content regardless of its filename or MIME header", async () => {
    const createListing = vi.fn();
    const app = makeApp({ createListing });
    expect((await itemRequest(app)).status).toBe(400);

    const invalidImage = await itemRequest(app, Buffer.from("not an image"));
    expect(invalidImage.status).toBe(400);
    expect(invalidImage.body.error.code).toBe("INVALID_IMAGE");
    expect(createListing).not.toHaveBeenCalled();
  });

  it("rejects uploads larger than 5 MB and more than three images", async () => {
    const app = makeApp({ createListing: vi.fn() });
    const oversized = await itemRequest(app, Buffer.alloc(5 * 1024 * 1024 + 1));
    expect(oversized.status).toBe(413);

    let test = authorized(request(app).post("/api/v1/listings"))
      .field("type", "ITEM")
      .field("title", "Phone")
      .field("description", "Phone")
      .field("category", "OTHER")
      .field("condition", "NEW")
      .field("priceAmount", "1");
    const image = await pngImage();
    for (let index = 0; index < 4; index += 1) {
      test = test.attach("images", image, { filename: `photo-${index}.png`, contentType: "image/png" });
    }
    expect((await test).status).toBe(400);
  });

  it("returns a safe server error when transactional persistence fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const app = makeApp({ createListing: vi.fn().mockRejectedValue(new Error("database connection string must stay private")) });
    const response = await itemRequest(app, await pngImage());

    expect(response.status).toBe(500);
    expect(response.body.error).toEqual({ code: "INTERNAL_ERROR", message: "An unexpected error occurred." });
    expect(JSON.stringify(response.body)).not.toContain("connection string");
  });
});

describe("Prisma listing creation repository", () => {
  it("checks the current database username and creates listing plus ordered images in one transaction", async () => {
    const listingCreate = vi.fn(async () => ({}));
    const userFindUnique = vi.fn(async () => ({ telegramUsername: "hana" }));
    const transaction = vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({
      user: { findUnique: userFindUnique },
      listing: { create: listingCreate },
    }));
    const repository = createPrismaListingCreateRepository({ $transaction: transaction } as unknown as PrismaClient);
    const input: ListingCreateInput = {
      listingType: "ITEM",
      title: "Phone",
      description: "Description",
      itemCategory: "OTHER",
      itemCondition: "NEW",
      rentalAddress: null,
      priceAmount: "2",
      images: [
        { mimeType: "image/webp", imageBytes: Buffer.from("first") },
        { mimeType: "image/webp", imageBytes: Buffer.from("second") },
      ],
    };

    await repository.createListing(userId, input);

    expect(transaction).toHaveBeenCalledOnce();
    expect(userFindUnique).toHaveBeenCalledWith({ where: { id: userId }, select: { telegramUsername: true } });
    expect(listingCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        sellerId: userId,
        availabilityStatus: "AVAILABLE",
        images: { create: [
          expect.objectContaining({ position: 1, mimeType: "image/webp" }),
          expect.objectContaining({ position: 2, mimeType: "image/webp" }),
        ] },
      }),
      include: expect.objectContaining({ images: expect.any(Object), seller: expect.any(Object) }),
    }));
  });

  it("does not create a listing if the seller has no username in the database", async () => {
    const listingCreate = vi.fn();
    const transaction = vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({
      user: { findUnique: vi.fn(async () => ({ telegramUsername: null })) },
      listing: { create: listingCreate },
    }));
    const repository = createPrismaListingCreateRepository({ $transaction: transaction } as unknown as PrismaClient);
    const result = await repository.createListing(userId, {
      listingType: "ITEM", title: "Phone", description: "Description", itemCategory: "OTHER", itemCondition: "NEW",
      rentalAddress: null, priceAmount: null, images: [{ mimeType: "image/webp", imageBytes: Buffer.from("image") }],
    });

    expect(result).toEqual({ kind: "username-required" });
    expect(listingCreate).not.toHaveBeenCalled();
  });

  it("propagates transaction failures so the API can return a safe error without partial success", async () => {
    const transaction = vi.fn().mockRejectedValue(new Error("database failure"));
    const repository = createPrismaListingCreateRepository({ $transaction: transaction } as unknown as PrismaClient);
    await expect(repository.createListing(userId, {
      listingType: "ITEM", title: "Phone", description: "Description", itemCategory: "OTHER", itemCondition: "NEW",
      rentalAddress: null, priceAmount: "0", images: [{ mimeType: "image/webp", imageBytes: Buffer.from("image") }],
    })).rejects.toThrow("database failure");
    expect(transaction).toHaveBeenCalledOnce();
  });
});
