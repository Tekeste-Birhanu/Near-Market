import type { PrismaClient } from "../../generated/prisma/client.ts";
import type { AdminDashboardRepository } from "./dashboard-route.ts";

export function createPrismaAdminDashboardRepository(prisma: PrismaClient): AdminDashboardRepository {
  return {
    async getMetrics() {
      const [totalUsers, totalListings, totalItemListings, totalHouseRentalListings, categories] = await Promise.all([
        prisma.user.count(),
        prisma.listing.count(),
        prisma.listing.count({ where: { listingType: "ITEM" } }),
        prisma.listing.count({ where: { listingType: "HOUSE_RENTAL" } }),
        prisma.listing.groupBy({
          by: ["itemCategory"],
          where: { listingType: "ITEM", itemCategory: { not: null } },
          _count: { _all: true },
        }),
      ]);
      const categoryCounts = new Map(
        categories.flatMap((item) => item.itemCategory ? [[item.itemCategory, item._count._all] as const] : []),
      );
      const itemListingsByCategory = (["ELECTRONICS", "CLOTHING", "FURNITURE", "OTHER"] as const)
        .map((category) => ({ category, count: categoryCounts.get(category) ?? 0 }))
        .sort((left, right) => right.count - left.count || (left.category < right.category ? -1 : left.category > right.category ? 1 : 0));
      return {
        totalUsers,
        totalListings,
        totalItemListings,
        totalHouseRentalListings,
        itemListingsByCategory,
      };
    },
  };
}
