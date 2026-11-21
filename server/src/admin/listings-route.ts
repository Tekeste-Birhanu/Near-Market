import { Router, type Response } from "express";
import { requireAdmin } from "../auth/admin-auth.ts";
import type { AuthUserRepository } from "../auth/user-repository.ts";
import {
  decodeListingCursor,
  encodeListingCursor,
  serializeListingSummary,
  type ListingCursor,
  type ListingFeedRecord,
} from "../listings/feed-route.ts";
import type { ListingDetailsRecord, ListingImageRecord } from "../listings/read-route.ts";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const PRICE_PATTERN = /^\d{1,10}(?:\.\d{1,2})?$/;

export type AdminListingQuery = {
  type: "ITEM" | "HOUSE_RENTAL";
  sort: "NEWEST" | "OLDEST";
  q?: string;
  category?: "ELECTRONICS" | "CLOTHING" | "OTHER";
  condition?: "NEW" | "USED";
  minPrice?: string;
  maxPrice?: string;
  limit: number;
  cursor?: ListingCursor;
};

export interface AdminListingRepository {
  findRetained(query: AdminListingQuery): Promise<ListingFeedRecord[]>;
  findDetails(listingId: string): Promise<ListingDetailsRecord | null>;
  findImage(listingId: string, imageId: string): Promise<ListingImageRecord | null>;
  removeListing(listingId: string): Promise<{ sellerTelegramUserId: bigint } | null>;
}

function sendError(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ error: { code, message } });
}

function minorUnits(value: string): bigint {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}

function parseQuery(raw: Record<string, unknown>): AdminListingQuery | undefined {
  const allowed = new Set(["type", "sort", "q", "category", "condition", "minPrice", "maxPrice", "limit", "cursor"]);
  if (Object.keys(raw).some((key) => !allowed.has(key))) return undefined;
  if (raw.type !== "ITEM" && raw.type !== "HOUSE_RENTAL") return undefined;
  const type = raw.type;
  if (raw.sort !== undefined && raw.sort !== "NEWEST" && raw.sort !== "OLDEST") return undefined;
  const sort = (raw.sort ?? "NEWEST") as AdminListingQuery["sort"];
  if (raw.q !== undefined && typeof raw.q !== "string") return undefined;
  const q = typeof raw.q === "string" ? raw.q.trim() : "";
  if (q.length > 100) return undefined;
  if (raw.category !== undefined && (typeof raw.category !== "string" || type !== "ITEM" || !["ELECTRONICS", "CLOTHING", "OTHER"].includes(raw.category))) return undefined;
  if (raw.condition !== undefined && (typeof raw.condition !== "string" || type !== "ITEM" || !["NEW", "USED"].includes(raw.condition))) return undefined;

  const minPrice = raw.minPrice === undefined ? undefined : typeof raw.minPrice === "string" ? raw.minPrice : "";
  const maxPrice = raw.maxPrice === undefined ? undefined : typeof raw.maxPrice === "string" ? raw.maxPrice : "";
  if ((minPrice !== undefined && !PRICE_PATTERN.test(minPrice)) || (maxPrice !== undefined && !PRICE_PATTERN.test(maxPrice))) return undefined;
  if (minPrice !== undefined && maxPrice !== undefined && minorUnits(minPrice) > minorUnits(maxPrice)) return undefined;

  const limit = raw.limit === undefined ? 20 : typeof raw.limit === "string" && /^\d+$/.test(raw.limit) ? Number(raw.limit) : NaN;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) return undefined;
  let cursor: ListingCursor | undefined;
  if (raw.cursor !== undefined) {
    if (typeof raw.cursor !== "string") return undefined;
    cursor = decodeListingCursor(raw.cursor);
    if (!cursor) return undefined;
  }

  return {
    type,
    sort,
    ...(q ? { q } : {}),
    ...(typeof raw.category === "string" ? { category: raw.category as AdminListingQuery["category"] } : {}),
    ...(typeof raw.condition === "string" ? { condition: raw.condition as AdminListingQuery["condition"] } : {}),
    ...(minPrice !== undefined ? { minPrice } : {}),
    ...(maxPrice !== undefined ? { maxPrice } : {}),
    limit,
    ...(cursor ? { cursor } : {}),
  };
}

function listingPage(records: ListingFeedRecord[], limit: number) {
  const hasMore = records.length > limit;
  const page = records.slice(0, limit);
  return {
    items: page.map(serializeListingSummary),
    nextCursor: hasMore && page.length ? encodeListingCursor(page[page.length - 1]) : null,
  };
}

function serializeDetails(listing: ListingDetailsRecord) {
  return {
    ...serializeListingSummary(listing),
    images: listing.images.map((image) => ({
      ...image,
      url: `/api/v1/admin/listings/${listing.id}/images/${image.id}`,
    })),
    seller: { ...listing.seller, phoneNumber: listing.seller.phoneNumber },
  };
}

export function createAdminListingsRouter(
  userRepository?: AuthUserRepository,
  repository?: AdminListingRepository,
  notifySeller?: (telegramUserId: string) => Promise<void>,
) {
  const router = Router();
  router.use(requireAdmin(userRepository));

  router.get("/", async (req, res) => {
    if (!repository) return sendError(res, 503, "ADMIN_UNAVAILABLE", "Admin listings are unavailable.");
    const query = parseQuery(req.query as Record<string, unknown>);
    if (!query) return sendError(res, 400, "VALIDATION_ERROR", "The listing query is invalid.");
    const records = await repository.findRetained(query);
    res.status(200).json(listingPage(records, query.limit));
  });

  router.get("/:listingId/images/:imageId", async (req, res) => {
    if (!repository) return sendError(res, 503, "ADMIN_UNAVAILABLE", "Admin listing images are unavailable.");
    const { listingId, imageId } = req.params;
    if (!UUID_PATTERN.test(listingId) || !UUID_PATTERN.test(imageId)) return sendError(res, 404, "NOT_FOUND", "The requested resource was not found.");
    const image = await repository.findImage(listingId, imageId);
    if (!image) return sendError(res, 404, "NOT_FOUND", "The requested resource was not found.");
    if (!IMAGE_TYPES.has(image.mimeType)) return sendError(res, 500, "INTERNAL_ERROR", "An unexpected error occurred.");
    res.status(200)
      .set("Content-Type", image.mimeType)
      .set("Content-Length", String(image.imageBytes.byteLength))
      .set("X-Content-Type-Options", "nosniff")
      .set("Cache-Control", "private, no-store")
      .send(Buffer.from(image.imageBytes));
  });

  router.get("/:listingId", async (req, res) => {
    if (!repository) return sendError(res, 503, "ADMIN_UNAVAILABLE", "Admin listing details are unavailable.");
    const listingId = req.params.listingId;
    if (!UUID_PATTERN.test(listingId)) return sendError(res, 404, "NOT_FOUND", "The requested listing was not found.");
    const listing = await repository.findDetails(listingId);
    if (!listing) return sendError(res, 404, "NOT_FOUND", "The requested listing was not found.");
    res.status(200).json(serializeDetails(listing));
  });

  router.delete("/:listingId", async (req, res) => {
    if (!repository) return sendError(res, 503, "ADMIN_UNAVAILABLE", "Admin listing removal is unavailable.");
    const listingId = req.params.listingId;
    if (!UUID_PATTERN.test(listingId)) return sendError(res, 404, "NOT_FOUND", "The requested listing was not found.");
    const removed = await repository.removeListing(listingId);
    if (!removed) return sendError(res, 404, "NOT_FOUND", "The requested listing was not found.");
    if (notifySeller) {
      try {
        await notifySeller(removed.sellerTelegramUserId.toString());
      } catch {
        console.error("Seller notification failed after admin listing removal.");
      }
    } else {
      console.error("Seller notification unavailable after admin listing removal.");
    }
    res.status(204).end();
  });

  return router;
}
