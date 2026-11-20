import type { PrismaClient, Prisma } from "../../generated/prisma/client.ts";
import type { ListingFeedRecord, ListingFeedRepository } from "./feed-route.ts";
import type { ListingDetailsRecord, ListingReadRepository } from "./read-route.ts";

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
  images: {
    take: 1,
    orderBy: { position: "asc" },
    select: { id: true, position: true },
  },
  seller: { select: { id: true, displayName: true, telegramUsername: true } },
} satisfies Prisma.ListingSelect;

const cursorWhere = (cursor: { createdAt: Date; id: string } | undefined): Prisma.ListingWhereInput | undefined => cursor && ({
  OR: [
    { createdAt: { lt: cursor.createdAt } },
    { createdAt: cursor.createdAt, id: { lt: cursor.id } },
  ],
});

export function createPrismaListingReadRepository(
  prisma: PrismaClient,
  feedRepository: ListingFeedRepository,
): ListingReadRepository {
  return {
    findAvailable: (query) => feedRepository.findAvailable(query),

    async findDetails(listingId): Promise<ListingDetailsRecord | null> {
      return prisma.listing.findUnique({
        where: { id: listingId },
        select: {
          ...feedSelect,
          sellerId: true,
          images: {
            orderBy: { position: "asc" },
            select: { id: true, position: true },
          },
          seller: { select: { id: true, displayName: true, telegramUsername: true, phoneNumber: true } },
        },
      });
    },

    async findImage(listingId, imageId) {
      const image = await prisma.listingImage.findFirst({
        where: { id: imageId, listingId },
        select: {
          mimeType: true,
          imageBytes: true,
          listing: { select: { sellerId: true, availabilityStatus: true } },
        },
      });
      if (!image) return null;
      return {
        sellerId: image.listing.sellerId,
        status: image.listing.availabilityStatus,
        mimeType: image.mimeType,
        imageBytes: image.imageBytes,
      };
    },

    async findViewerRole(userId) {
      return prisma.user.findUnique({ where: { id: userId }, select: { isAdmin: true } });
    },

    async findSeller(sellerId) {
      return prisma.user.findUnique({
        where: { id: sellerId },
        select: { id: true, displayName: true, telegramUsername: true },
      });
    },

    async findSellerAvailable(sellerId, query) {
      const and = cursorWhere(query.cursor);
      return prisma.listing.findMany({
        where: {
          sellerId,
          availabilityStatus: "AVAILABLE",
          ...(query.type ? { listingType: query.type } : {}),
          ...(and ? { AND: [and] } : {}),
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: query.limit + 1,
        select: feedSelect,
      }) as Promise<ListingFeedRecord[]>;
    },
  };
}
