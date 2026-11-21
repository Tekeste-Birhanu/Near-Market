import type { Prisma, PrismaClient } from "../../generated/prisma/client.ts";
import type { AdminListingQuery, AdminListingRepository } from "./listings-route.ts";
import type { ListingFeedRecord } from "../listings/feed-route.ts";
import type { ListingDetailsRecord } from "../listings/read-route.ts";

const feedSelect = {
  id: true,
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
  images: { take: 1, orderBy: { position: "asc" }, select: { id: true, position: true } },
  seller: { select: { id: true, displayName: true, telegramUsername: true } },
} satisfies Prisma.ListingSelect;

export function createPrismaAdminListingRepository(prisma: PrismaClient): AdminListingRepository {
  return {
    async findRetained(query): Promise<ListingFeedRecord[]> {
      const conditions: Prisma.ListingWhereInput[] = [];
      if (query.q) {
        const searchable: Prisma.ListingWhereInput[] = [
          { title: { contains: query.q, mode: "insensitive" } },
          { description: { contains: query.q, mode: "insensitive" } },
        ];
        if (query.type === "HOUSE_RENTAL") searchable.push({ rentalAddress: { contains: query.q, mode: "insensitive" } });
        conditions.push({ OR: searchable });
      }
      if (query.cursor) {
        const older = query.sort === "NEWEST";
        conditions.push({ OR: [
          { createdAt: { [older ? "lt" : "gt"]: query.cursor.createdAt } },
          { createdAt: query.cursor.createdAt, id: { [older ? "lt" : "gt"]: query.cursor.id } },
        ] });
      }
      return prisma.listing.findMany({
        where: {
          listingType: query.type,
          ...(query.category ? { itemCategory: query.category } : {}),
          ...(query.condition ? { itemCondition: query.condition } : {}),
          ...((query.minPrice || query.maxPrice) ? { priceAmount: {
            ...(query.minPrice ? { gte: query.minPrice } : {}),
            ...(query.maxPrice ? { lte: query.maxPrice } : {}),
          } } : {}),
          ...(conditions.length ? { AND: conditions } : {}),
        },
        orderBy: query.sort === "OLDEST" ? [{ createdAt: "asc" }, { id: "asc" }] : [{ createdAt: "desc" }, { id: "desc" }],
        take: query.limit + 1,
        select: feedSelect,
      }) as Promise<ListingFeedRecord[]>;
    },

    async findDetails(listingId): Promise<ListingDetailsRecord | null> {
      return prisma.listing.findUnique({
        where: { id: listingId },
        select: {
          ...feedSelect,
          sellerId: true,
          images: { orderBy: { position: "asc" }, select: { id: true, position: true } },
          seller: { select: { id: true, displayName: true, telegramUsername: true, phoneNumber: true } },
        },
      });
    },

    async findImage(listingId, imageId) {
      const image = await prisma.listingImage.findFirst({
        where: { id: imageId, listingId },
        select: { mimeType: true, imageBytes: true, listing: { select: { sellerId: true, availabilityStatus: true } } },
      });
      return image ? {
        sellerId: image.listing.sellerId,
        status: image.listing.availabilityStatus,
        mimeType: image.mimeType,
        imageBytes: image.imageBytes,
      } : null;
    },

    async removeListing(listingId) {
      return prisma.$transaction(async (tx) => {
        const listing = await tx.listing.findUnique({ where: { id: listingId }, select: { seller: { select: { telegramUserId: true } } } });
        if (!listing) return null;
        await tx.listing.delete({ where: { id: listingId } });
        return { sellerTelegramUserId: listing.seller.telegramUserId };
      });
    },
  };
}
