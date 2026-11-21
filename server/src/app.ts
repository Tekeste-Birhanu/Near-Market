import express, { type ErrorRequestHandler } from "express";
import type { AppConfig } from "./config.ts";
import { createAuthRouter, type AuthSessionDependencies } from "./auth/session-route.ts";
import { createProfileRouter } from "./auth/profile-route.ts";
import { createListingFeedRouter, type ListingFeedRepository } from "./listings/feed-route.ts";
import { createListingReadRouter, type ListingReadRepository } from "./listings/read-route.ts";
import { createListingCreateRouter, type ListingCreateRepository } from "./listings/create-route.ts";
import { createListingLifecycleRouter, type ListingLifecycleRepository } from "./listings/lifecycle-route.ts";
import { requireSession } from "./auth/session-token.ts";
import { createRateLimiter } from "./rate-limit.ts";
import { createAdminRouter, type AdminDashboardRepository } from "./admin/dashboard-route.ts";
import { createAdminListingsRouter, type AdminListingRepository } from "./admin/listings-route.ts";

export interface AppDependencies {
  auth?: AuthSessionDependencies;
  listingFeedRepository?: ListingFeedRepository;
  listingReadRepository?: ListingReadRepository;
  listingCreateRepository?: ListingCreateRepository;
  listingLifecycleRepository?: ListingLifecycleRepository;
  adminDashboardRepository?: AdminDashboardRepository;
  adminListingRepository?: AdminListingRepository;
  notifyListingSeller?: (telegramUserId: string) => Promise<void>;
}

export function createApp(
  config: Pick<AppConfig, "rateLimitMax" | "rateLimitWindowMs">,
  dependencies: AppDependencies = {},
) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));
  app.use(createRateLimiter(config.rateLimitMax, config.rateLimitWindowMs));
  app.use("/api/v1/auth", createAuthRouter(dependencies.auth));
  app.use("/api/v1", requireSession(dependencies.auth?.sessionSecret, dependencies.auth?.now));
  app.use("/api/v1", createProfileRouter(dependencies.auth?.userRepository));
  app.use("/api/v1", createListingFeedRouter(dependencies.listingFeedRepository));
  app.use("/api/v1", createListingReadRouter(dependencies.listingReadRepository));
  app.use("/api/v1", createListingCreateRouter(dependencies.listingCreateRepository));
  app.use("/api/v1", createListingLifecycleRouter(dependencies.listingLifecycleRepository));
  app.use("/api/v1/admin/listings", createAdminListingsRouter(
    dependencies.auth?.userRepository,
    dependencies.adminListingRepository,
    dependencies.notifyListingSeller,
  ));
  app.use("/api/v1/admin", createAdminRouter(dependencies.auth?.userRepository, dependencies.adminDashboardRepository));

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.use((_req, res) => {
    res.status(404).json({
      error: { code: "NOT_FOUND", message: "The requested resource was not found." },
    });
  });

  const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    const status =
      typeof error === "object" && error !== null && "status" in error &&
      (error.status === 400 || error.status === 413)
        ? error.status
        : 500;
    const code = status === 400 ? "VALIDATION_ERROR" : status === 413 ? "PAYLOAD_TOO_LARGE" : "INTERNAL_ERROR";
    const message = status === 400
      ? "The request could not be accepted."
      : status === 413
        ? "The request exceeds the allowed size."
        : "An unexpected error occurred.";

    if (status === 500) console.error("Unhandled API error");
    res.status(status).json({ error: { code, message } });
  };

  app.use(errorHandler);
  return app;
}
