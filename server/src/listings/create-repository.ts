import type { Prisma, PrismaClient } from "../../generated/prisma/client.ts";
import type { ListingCreateInput, ListingCreateRepository, ListingCreateResult } from "./create-route.ts";

const createListingInclude = {
  images: { orderBy: { position: "asc" }, select: { id: true, position: true } },
  seller: { select: { id: true, displayName: true, telegramUsername: true, phoneNumber: true } },
} satisfies Prisma.ListingInclude;

export function createPrismaListingCreateRepository(prisma: PrismaClient): ListingCreateRepository {
  return {
    async createListing(userId, input: ListingCreateInput): Promise<ListingCreateResult> {
      return prisma.$transaction(async (transaction) => {
        const seller = await transaction.user.findUnique({
          where: { id: userId },
          select: { telegramUsername: true },
        });
        if (!seller) return { kind: "not-found" };
        if (!seller.telegramUsername?.trim()) return { kind: "username-required" };

        const listing = await transaction.listing.create({
          data: {
            sellerId: userId,
            listingType: input.listingType,
            title: input.title,
            description: input.description,
            itemCategory: input.itemCategory,
            itemCondition: input.itemCondition,
            rentalAddress: input.rentalAddress,
            priceAmount: input.priceAmount,
            availabilityStatus: "AVAILABLE",
            images: {
              create: input.images.map((image, index) => ({
                position: index + 1,
                mimeType: image.mimeType,
                imageBytes: Uint8Array.from(image.imageBytes),
              })),
            },
          },
          include: createListingInclude,
        });

        return { kind: "created", listing };
      });
    },
  };
}
