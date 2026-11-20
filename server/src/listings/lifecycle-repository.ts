import type { Prisma, PrismaClient } from "../../generated/prisma/client.ts";
import type { ListingCursor, ListingFeedRecord, ListingFeedType } from "./feed-route.ts";
import type { ListingDetailsRecord } from "./read-route.ts";
import type { ListingCreateInput } from "./create-route.ts";
import type { ListingLifecycleRepository } from "./lifecycle-route.ts";

const listingSelect = {
  id: true,
  sellerId: true,
  listingType: true,
  title: true,
  description: true,
  itemCategory: true,
  itemCondition: true,
  rentalAddress: true,
  priceAmount: true,
  availabilityStatus: true,
  createdAt: true,
  updatedAt: true,
  images: { orderBy: { position: "asc" }, select: { id: true, position: true } },
  seller: { select: { id: true, displayName: true, telegramUsername: true, phoneNumber: true } },
} satisfies Prisma.ListingSelect;

const summarySelect = {
  ...listingSelect,
  images: { take: 1, orderBy: { position: "asc" }, select: { id: true, position: true } },
  seller: { select: { id: true, displayName: true, telegramUsername: true } },
} satisfies Prisma.ListingSelect;

export function createPrismaListingLifecycleRepository(prisma: PrismaClient): ListingLifecycleRepository {
  return {
    async findMine(userId, query): Promise<ListingFeedRecord[]> {
      const cursorFilter: Prisma.ListingWhereInput | undefined = query.cursor && {
        OR: [
          { createdAt: { lt: query.cursor.createdAt } },
          { createdAt: query.cursor.createdAt, id: { lt: query.cursor.id } },
        ],
      };
      return prisma.listing.findMany({
        where: {
          sellerId: userId,
          ...(query.type ? { listingType: query.type } : {}),
          ...(cursorFilter ? { AND: [cursorFilter] } : {}),
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: query.limit + 1,
        select: summarySelect,
      }) as Promise<ListingFeedRecord[]>;
    },

    async updateOwnedListing(userId, listingId, input: ListingCreateInput) {
      return prisma.$transaction(async (transaction) => {
        const current = await transaction.listing.findUnique({ where: { id: listingId }, select: { sellerId: true, listingType: true } });
        if (!current) return { kind: "not-found" as const };
        if (current.sellerId !== userId) return { kind: "forbidden" as const };
        if (current.listingType !== input.listingType) return { kind: "invalid-type" as const };

        if (input.images.length) {
          await transaction.listingImage.deleteMany({ where: { listingId } });
          await transaction.listingImage.createMany({
            data: input.images.map((image, index) => ({
              listingId,
              position: index + 1,
              mimeType: image.mimeType,
              imageBytes: Uint8Array.from(image.imageBytes),
            })),
          });
        }

        const listing = await transaction.listing.update({
          where: { id: listingId },
          data: {
            title: input.title,
            description: input.description,
            itemCategory: input.itemCategory,
            itemCondition: input.itemCondition,
            rentalAddress: input.rentalAddress,
            priceAmount: input.priceAmount,
          },
          select: listingSelect,
        });
        return { kind: "updated" as const, listing: listing as ListingDetailsRecord };
      });
    },

    async updateOwnedStatus(userId, listingId, status) {
      return prisma.$transaction(async (transaction) => {
        const current = await transaction.listing.findUnique({ where: { id: listingId }, select: { sellerId: true, listingType: true } });
        if (!current) return { kind: "not-found" as const };
        if (current.sellerId !== userId) return { kind: "forbidden" as const };
        if (current.listingType === "ITEM" && status !== "AVAILABLE" && status !== "SOLD") return { kind: "invalid-status" as const };
        if (current.listingType === "HOUSE_RENTAL" && status !== "AVAILABLE" && status !== "UNAVAILABLE") return { kind: "invalid-status" as const };
        const listing = await transaction.listing.update({
          where: { id: listingId },
          data: { availabilityStatus: status },
          select: listingSelect,
        });
        return { kind: "updated" as const, listing: listing as ListingDetailsRecord };
      });
    },

    async deleteOwnedListing(userId, listingId) {
      return prisma.$transaction(async (transaction) => {
        const current = await transaction.listing.findUnique({ where: { id: listingId }, select: { sellerId: true } });
        if (!current) return { kind: "not-found" as const };
        if (current.sellerId !== userId) return { kind: "forbidden" as const };
        await transaction.listing.delete({ where: { id: listingId } });
        return { kind: "deleted" as const };
      });
    },
  };
}

export type MyListingsQuery = { type?: ListingFeedType; limit: number; cursor?: ListingCursor };
