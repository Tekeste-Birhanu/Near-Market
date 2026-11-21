import { Router } from "express";
import { requireAdmin } from "../auth/admin-auth.ts";
import type { AuthUserRepository } from "../auth/user-repository.ts";

export interface AdminDashboardMetrics {
  totalUsers: number;
  totalListings: number;
  totalItemListings: number;
  totalHouseRentalListings: number;
  itemListingsByCategory: Array<{ category: "ELECTRONICS" | "CLOTHING" | "OTHER"; count: number }>;
}

export interface AdminDashboardRepository {
  getMetrics(): Promise<AdminDashboardMetrics>;
}

export function createAdminRouter(
  userRepository?: AuthUserRepository,
  dashboardRepository?: AdminDashboardRepository,
) {
  const router = Router();
  router.use(requireAdmin(userRepository));
  router.get("/dashboard", async (_req, res) => {
    if (!dashboardRepository) {
      res.status(503).json({ error: { code: "ADMIN_UNAVAILABLE", message: "Dashboard data is unavailable." } });
      return;
    }
    res.status(200).json(await dashboardRepository.getMetrics());
  });
  return router;
}
