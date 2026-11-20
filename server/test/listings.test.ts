import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.ts";
import { issueAccessToken } from "../src/auth/session-token.ts";
import { createPrismaListingFeedRepository } from "../src/listings/feed-repository.ts";
import type { ListingFeedQuery, ListingFeedRecord } from "../src/listings/feed-route.ts";
import type { PrismaClient } from "../generated/prisma/client.ts";

const sessionSecret = "local-test-session-secret-32-characters-minimum";
const userId = "dd7320bd-8c00-42da-9ee8-5fe6bcba7cf2";
const token = issueAccessToken(userId, sessionSecret).accessToken;
const createdAt = new Date("2026-11-07T12:00:00.000Z");

function listing(overrides: Partial<ListingFeedRecord> = {}): ListingFeedRecord {
  return {
    id: "46da38a3-ae4c-4d62-8b8c-5414fe7f341c",
    listingType: "ITEM",
    title: "Samsung phone",
    description: "Used phone in good condition",
    itemCategory: "ELECTRONICS",
    itemCondition: "USED",
    rentalAddress: null,
    priceAmount: { toFixed: () => "12500.00" },
    availabilityStatus: "AVAILABLE",
    createdAt,
    updatedAt: createdAt,
    images: [{ id: "61269c61-347d-4b5a-899b-9f84d6726473", position: 1 }],
    seller: { id: userId, displayName: "Hana", telegramUsername: "hana" },
    ...overrides,
  };
}

function makeApp(records: ListingFeedRecord[]) {
  const findAvailable = vi.fn(async (_query: ListingFeedQuery) => records);
  const app = createApp(
    { rateLimitMax: 100, rateLimitWindowMs: 60_000 },
    { auth: { sessionSecret }, listingFeedRepository: { findAvailable } },
  );
  return { app, findAvailable };
}

const authorized = (testRequest: request.Test) => testRequest.set("Authorization", `Bearer ${token}`);

describe("GET /api/v1/listings", () => {
  it("requires authentication", async () => {
    const { app } = makeApp([]);
    expect((await request(app).get("/api/v1/listings?type=ITEM")).status).toBe(401);
  });

  it("returns a compact available-listing feed without seller phone numbers", async () => {
    const record = listing();
    const { app } = makeApp([record]);
    const response = await authorized(request(app).get("/api/v1/listings?type=ITEM"));

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      items: [{
        id: record.id,
        type: "ITEM",
        title: "Samsung phone",
        priceAmount: "12500.00",
        status: "AVAILABLE",
        images: [{ id: record.images[0].id, position: 1, url: `/api/v1/listings/${record.id}/images/${record.images[0].id}` }],
        seller: { id: userId, displayName: "Hana", telegramUsername: "hana" },
      }],
      nextCursor: null,
    });
    expect(response.body.items[0].seller).not.toHaveProperty("phoneNumber");
  });

  it("parses and forwards the selected feed, text search, item filters, price bounds and page size", async () => {
    const { app, findAvailable } = makeApp([]);
    const response = await authorized(request(app).get(
      "/api/v1/listings?type=ITEM&q=%20galaxy%20&category=ELECTRONICS&condition=USED&minPrice=100.50&maxPrice=20000&limit=7",
    ));

    expect(response.status).toBe(200);
    expect(findAvailable).toHaveBeenCalledWith({
      type: "ITEM",
      q: "galaxy",
      category: "ELECTRONICS",
      condition: "USED",
      minPrice: "100.50",
      maxPrice: "20000",
      limit: 7,
    });
  });

  it("accepts oldest-first ordering and rejects unknown sort values", async () => {
    const { app, findAvailable } = makeApp([]);
    const response = await authorized(request(app).get("/api/v1/listings?type=ITEM&sort=OLDEST"));

    expect(response.status).toBe(200);
    expect(findAvailable).toHaveBeenCalledWith({ type: "ITEM", sort: "OLDEST", limit: 20 });

    const invalid = await authorized(request(app).get("/api/v1/listings?type=ITEM&sort=RANDOM"));
    expect(invalid.status).toBe(400);
    expect(findAvailable).toHaveBeenCalledOnce();
  });

  it("supports rental text search including the seller-entered address", async () => {
    const rental = listing({
      listingType: "HOUSE_RENTAL",
      title: "Family house",
      itemCategory: null,
      itemCondition: null,
      rentalAddress: "Bole",
    });
    const { app, findAvailable } = makeApp([rental]);
    const response = await authorized(request(app).get("/api/v1/listings?type=HOUSE_RENTAL&q=Bole&minPrice=1000"));

    expect(response.status).toBe(200);
    expect(response.body.items[0]).toMatchObject({ type: "HOUSE_RENTAL", rentalAddress: "Bole" });
    expect(findAvailable).toHaveBeenCalledWith({ type: "HOUSE_RENTAL", q: "Bole", minPrice: "1000", limit: 20 });
  });

  it("returns a next cursor only when another page exists", async () => {
    const first = listing();
    const second = listing({ id: "f5e039c0-34a5-4be9-8ea7-a0e88fd20ad5", createdAt: new Date("2026-11-06T12:00:00.000Z") });
    const { app, findAvailable } = makeApp([first, second]);
    const firstPage = await authorized(request(app).get("/api/v1/listings?type=ITEM&limit=1"));

    expect(firstPage.body.items).toHaveLength(1);
    expect(firstPage.body.nextCursor).toEqual(expect.any(String));
    const nextPage = await authorized(request(app).get(`/api/v1/listings?type=ITEM&limit=1&cursor=${firstPage.body.nextCursor}`));

    expect(nextPage.status).toBe(200);
    expect(findAvailable.mock.calls[1][0].cursor).toEqual({ createdAt, id: first.id });
  });

  it.each([
    "",
    "?type=UNKNOWN",
    "?type=HOUSE_RENTAL&category=OTHER",
    "?type=ITEM&condition=AVAILABLE",
    "?type=ITEM&minPrice=-1",
    "?type=ITEM&minPrice=1.001",
    "?type=ITEM&minPrice=20&maxPrice=19.99",
    "?type=ITEM&limit=0",
    "?type=ITEM&limit=51",
    "?type=ITEM&unexpected=true",
    "?type=ITEM&cursor=not-a-cursor",
  ])("rejects invalid query string %s", async (query) => {
    const { app, findAvailable } = makeApp([]);
    const response = await authorized(request(app).get(`/api/v1/listings${query}`));

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(findAvailable).not.toHaveBeenCalled();
  });
});

describe("Prisma listing feed query", () => {
  let findMany: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    findMany = vi.fn().mockResolvedValue([]);
  });

  it("filters available items, applies case-insensitive text and typed filters, and orders deterministically", async () => {
    const repository = createPrismaListingFeedRepository({ listing: { findMany } } as unknown as PrismaClient);
    await repository.findAvailable({
      type: "ITEM",
      q: "phone",
      category: "ELECTRONICS",
      condition: "USED",
      minPrice: "1000",
      maxPrice: "20000.50",
      limit: 10,
    });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        listingType: "ITEM",
        availabilityStatus: "AVAILABLE",
        itemCategory: "ELECTRONICS",
        itemCondition: "USED",
        priceAmount: { gte: "1000", lte: "20000.50" },
        AND: [{
          OR: [
            { title: { contains: "phone", mode: "insensitive" } },
            { description: { contains: "phone", mode: "insensitive" } },
          ],
        }],
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 11,
    }));
  });

  it("searches rental addresses and adds an exclusive cursor condition", async () => {
    const repository = createPrismaListingFeedRepository({ listing: { findMany } } as unknown as PrismaClient);
    await repository.findAvailable({
      type: "HOUSE_RENTAL",
      q: "market",
      limit: 5,
      cursor: { createdAt, id: "46da38a3-ae4c-4d62-8b8c-5414fe7f341c" },
    });

    const args = findMany.mock.calls[0][0];
    expect(args.where.AND).toEqual([
      {
        OR: [
          { title: { contains: "market", mode: "insensitive" } },
          { description: { contains: "market", mode: "insensitive" } },
          { rentalAddress: { contains: "market", mode: "insensitive" } },
        ],
      },
      {
        OR: [
          { createdAt: { lt: createdAt } },
          { createdAt, id: { lt: "46da38a3-ae4c-4d62-8b8c-5414fe7f341c" } },
        ],
      },
    ]);
  });

  it("uses ascending ordering and an exclusive cursor for oldest-first pagination", async () => {
    const repository = createPrismaListingFeedRepository({ listing: { findMany } } as unknown as PrismaClient);
    const cursorId = "46da38a3-ae4c-4d62-8b8c-5414fe7f341c";
    await repository.findAvailable({
      type: "ITEM",
      sort: "OLDEST",
      limit: 5,
      cursor: { createdAt, id: cursorId },
    });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        AND: [{ OR: [{ createdAt: { gt: createdAt } }, { createdAt, id: { gt: cursorId } }] }],
      }),
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }));
  });
});
