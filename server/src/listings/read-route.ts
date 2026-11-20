import { Router, type Response } from "express";
import {
  decodeListingCursor,
  encodeListingCursor,
  serializeListingSummary,
  type ListingCursor,
  type ListingFeedQuery,
  type ListingFeedRecord,
  type ListingFeedRepository,
  type ListingFeedType,
} from "./feed-route.ts";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export interface ListingDetailsRecord extends ListingFeedRecord {
  sellerId: string;
  seller: ListingFeedRecord["seller"] & { phoneNumber: string | null };
  images: Array<{ id: string; position: number }>;
}

export interface ListingImageRecord {
  sellerId: string;
  status: "AVAILABLE" | "SOLD" | "UNAVAILABLE";
  mimeType: string;
  imageBytes: Uint8Array;
}

export interface PublicSellerProfile {
  id: string;
  displayName: string;
  telegramUsername: string | null;
}

export interface ListingReadRepository extends ListingFeedRepository {
  findDetails(listingId: string): Promise<ListingDetailsRecord | null>;
  findImage(listingId: string, imageId: string): Promise<ListingImageRecord | null>;
  findViewerRole(userId: string): Promise<{ isAdmin: boolean } | null>;
  findSeller(sellerId: string): Promise<PublicSellerProfile | null>;
  findSellerAvailable(sellerId: string, query: { type?: ListingFeedType; limit: number; cursor?: ListingCursor }): Promise<ListingFeedRecord[]>;
}

function sendNotFound(res: Response): void {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "The requested resource was not found." } });
}

function sendValidationError(res: Response): void {
  res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "The listing query is invalid." } });
}

function toSellerListingsQuery(raw: Record<string, unknown>): { type?: ListingFeedType; limit: number; cursor?: ListingCursor } | undefined {
  if (Object.keys(raw).some((key) => !["type", "limit", "cursor"].includes(key))) return undefined;

  let type: ListingFeedType | undefined;
  if (raw.type !== undefined) {
    if (raw.type !== "ITEM" && raw.type !== "HOUSE_RENTAL") return undefined;
    type = raw.type;
  }

  let limit = 20;
  if (raw.limit !== undefined) {
    if (typeof raw.limit !== "string" || !/^\d+$/.test(raw.limit)) return undefined;
    limit = Number(raw.limit);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) return undefined;
  }

  let cursor: ListingCursor | undefined;
  if (raw.cursor !== undefined) {
    if (typeof raw.cursor !== "string") return undefined;
    cursor = decodeListingCursor(raw.cursor);
    if (!cursor) return undefined;
  }

  return { ...(type ? { type } : {}), limit, ...(cursor ? { cursor } : {}) };
}

function paginatedResponse(records: ListingFeedRecord[], limit: number) {
  const hasMore = records.length > limit;
  const page = records.slice(0, limit);
  return {
    items: page.map(serializeListingSummary),
    nextCursor: hasMore && page.length ? encodeListingCursor(page[page.length - 1]) : null,
  };
}

export function createListingReadRouter(repository?: ListingReadRepository) {
  const router = Router();

  router.get("/listings/:listingId/images/:imageId", async (req, res) => {
    if (!repository) {
      res.status(503).json({ error: { code: "LISTINGS_UNAVAILABLE", message: "Listings are not available." } });
      return;
    }
    const { listingId, imageId } = req.params;
    if (!UUID_PATTERN.test(listingId) || !UUID_PATTERN.test(imageId)) {
      sendNotFound(res);
      return;
    }
    const image = await repository.findImage(listingId, imageId);
    if (!image) {
      sendNotFound(res);
      return;
    }

    const userId = res.locals.authenticatedUserId as string;
    if (image.status !== "AVAILABLE" && image.sellerId !== userId) {
      const viewer = await repository.findViewerRole(userId);
      if (!viewer?.isAdmin) {
        sendNotFound(res);
        return;
      }
    }
    if (!IMAGE_TYPES.has(image.mimeType)) {
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." } });
      return;
    }

    res
      .status(200)
      .set("Content-Type", image.mimeType)
      .set("Content-Length", String(image.imageBytes.byteLength))
      .set("X-Content-Type-Options", "nosniff")
      .set("Cache-Control", image.status === "AVAILABLE" ? "public, max-age=300" : "private, no-store")
      .send(Buffer.from(image.imageBytes));
  });

  router.get("/listings/:listingId", async (req, res) => {
    if (!repository) {
      res.status(503).json({ error: { code: "LISTINGS_UNAVAILABLE", message: "Listings are not available." } });
      return;
    }
    const { listingId } = req.params;
    if (!UUID_PATTERN.test(listingId)) {
      sendNotFound(res);
      return;
    }
    const listing = await repository.findDetails(listingId);
    if (!listing) {
      sendNotFound(res);
      return;
    }

    const userId = res.locals.authenticatedUserId as string;
    if (listing.availabilityStatus !== "AVAILABLE" && listing.sellerId !== userId) {
      const viewer = await repository.findViewerRole(userId);
      if (!viewer?.isAdmin) {
        res.status(410).json({ error: { code: "LISTING_UNAVAILABLE", message: "This listing is no longer available." } });
        return;
      }
    }

    const summary = serializeListingSummary(listing);
    res.status(200).json({
      ...summary,
      images: listing.images.map((image) => ({
        ...image,
        url: `/api/v1/listings/${listing.id}/images/${image.id}`,
      })),
      seller: { ...listing.seller, phoneNumber: listing.seller.phoneNumber },
    });
  });

  router.get("/sellers/:sellerId", async (req, res) => {
    if (!repository) {
      res.status(503).json({ error: { code: "LISTINGS_UNAVAILABLE", message: "Seller profiles are not available." } });
      return;
    }
    if (!UUID_PATTERN.test(req.params.sellerId)) {
      sendNotFound(res);
      return;
    }
    const seller = await repository.findSeller(req.params.sellerId);
    if (!seller) {
      sendNotFound(res);
      return;
    }
    res.status(200).json(seller);
  });

  router.get("/sellers/:sellerId/listings", async (req, res) => {
    if (!repository) {
      res.status(503).json({ error: { code: "LISTINGS_UNAVAILABLE", message: "Seller listings are not available." } });
      return;
    }
    const { sellerId } = req.params;
    if (!UUID_PATTERN.test(sellerId)) {
      sendNotFound(res);
      return;
    }
    const query = toSellerListingsQuery(req.query as Record<string, unknown>);
    if (!query) {
      sendValidationError(res);
      return;
    }
    if (!await repository.findSeller(sellerId)) {
      sendNotFound(res);
      return;
    }

    const records = await repository.findSellerAvailable(sellerId, query);
    res.status(200).json(paginatedResponse(records, query.limit));
  });

  return router;
}
