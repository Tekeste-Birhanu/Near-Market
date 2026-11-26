import type { PrismaClient, Prisma } from "../../generated/prisma/client.ts";
import type { ListingFeedQuery, ListingFeedRepository, ListingFeedRecord } from "./feed-route.ts";

export function createPrismaListingFeedRepository(prisma: PrismaClient): ListingFeedRepository {
  return {
    async findAvailable(query: ListingFeedQuery): Promise<ListingFeedRecord[]> {
      const and: Prisma.ListingWhereInput[] = [];
      if (query.q) {
        const searchFields: Prisma.ListingWhereInput[] = [
          { title: { contains: query.q, mode: "insensitive" } },
          { description: { contains: query.q, mode: "insensitive" } },
        ];
        if (query.type === "HOUSE_RENTAL") {
          searchFields.push({ rentalAddress: { contains: query.q, mode: "insensitive" } });
        }
        and.push({ OR: searchFields });
      }
      if (query.cursor) {
        const olderThanCursor = query.sort !== "OLDEST";
        and.push({
          OR: [
            { createdAt: { [olderThanCursor ? "lt" : "gt"]: query.cursor.createdAt } },
            { createdAt: query.cursor.createdAt, id: { [olderThanCursor ? "lt" : "gt"]: query.cursor.id } },
          ],
        });
      }

      const where: Prisma.ListingWhereInput = {
        listingType: query.type,
        availabilityStatus: "AVAILABLE",
        seller: { isBlocked: false },
        ...(query.category ? { itemCategory: query.category } : {}),
        ...(query.condition ? { itemCondition: query.condition } : {}),
        ...((query.minPrice || query.maxPrice) ? {
          priceAmount: {
            ...(query.minPrice ? { gte: query.minPrice } : {}),
            ...(query.maxPrice ? { lte: query.maxPrice } : {}),
          },
        } : {}),
        ...(and.length ? { AND: and } : {}),
      };

      return prisma.listing.findMany({
        where,
        orderBy: query.sort === "OLDEST"
          ? [{ createdAt: "asc" }, { id: "asc" }]
          : [{ createdAt: "desc" }, { id: "desc" }],
        take: query.limit + 1,
        select: {
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
          images: {
            take: 1,
            orderBy: { position: "asc" },
            select: { id: true, position: true },
          },
          seller: {
            select: { id: true, displayName: true, telegramUsername: true },
          },
        },
      });
    },
  };
}
