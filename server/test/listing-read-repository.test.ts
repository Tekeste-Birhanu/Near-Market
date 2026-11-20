import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../generated/prisma/client.ts";
import { createPrismaListingFeedRepository } from "../src/listings/feed-repository.ts";
import { createPrismaListingReadRepository } from "../src/listings/read-repository.ts";

function makePrisma() {
  return {
    listing: {
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    listingImage: { findFirst: vi.fn() },
    user: { findUnique: vi.fn() },
  };
}

describe("Prisma listing read repository", () => {
  it("loads all ordered images and seller phone for details", async () => {
    const prisma = makePrisma();
    const repository = createPrismaListingReadRepository(
      prisma as unknown as PrismaClient,
      createPrismaListingFeedRepository(prisma as unknown as PrismaClient),
    );

    await repository.findDetails("listing-id");

    expect(prisma.listing.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "listing-id" },
      select: expect.objectContaining({
        sellerId: true,
        images: { orderBy: { position: "asc" }, select: { id: true, position: true } },
        seller: { select: { id: true, displayName: true, telegramUsername: true, phoneNumber: true } },
      }),
    }));
  });

  it("requires both listing and image IDs and reads status for visibility checks", async () => {
    const prisma = makePrisma();
    const repository = createPrismaListingReadRepository(
      prisma as unknown as PrismaClient,
      createPrismaListingFeedRepository(prisma as unknown as PrismaClient),
    );

    await repository.findImage("listing-id", "image-id");

    expect(prisma.listingImage.findFirst).toHaveBeenCalledWith({
      where: { id: "image-id", listingId: "listing-id" },
      select: {
        mimeType: true,
        imageBytes: true,
        listing: { select: { sellerId: true, availabilityStatus: true } },
      },
    });
  });

  it("reads admin permission from the stored user and omits phone from public seller queries", async () => {
    const prisma = makePrisma();
    const repository = createPrismaListingReadRepository(
      prisma as unknown as PrismaClient,
      createPrismaListingFeedRepository(prisma as unknown as PrismaClient),
    );

    await repository.findViewerRole("admin-id");
    expect(prisma.user.findUnique).toHaveBeenNthCalledWith(1, {
      where: { id: "admin-id" },
      select: { isAdmin: true },
    });

    await repository.findSeller("seller-id");
    expect(prisma.user.findUnique).toHaveBeenNthCalledWith(2, {
      where: { id: "seller-id" },
      select: { id: true, displayName: true, telegramUsername: true },
    });
  });

  it("limits seller feeds to available listings and supports stable cursor pagination", async () => {
    const prisma = makePrisma();
    const repository = createPrismaListingReadRepository(
      prisma as unknown as PrismaClient,
      createPrismaListingFeedRepository(prisma as unknown as PrismaClient),
    );
    const cursorDate = new Date("2026-11-06T12:00:00.000Z");

    await repository.findSellerAvailable("seller-id", {
      type: "HOUSE_RENTAL",
      limit: 10,
      cursor: { createdAt: cursorDate, id: "46da38a3-ae4c-4d62-8b8c-5414fe7f341c" },
    });

    expect(prisma.listing.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        sellerId: "seller-id",
        availabilityStatus: "AVAILABLE",
        listingType: "HOUSE_RENTAL",
        AND: [{
          OR: [
            { createdAt: { lt: cursorDate } },
            { createdAt: cursorDate, id: { lt: "46da38a3-ae4c-4d62-8b8c-5414fe7f341c" } },
          ],
        }],
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 11,
    }));
  });
});
