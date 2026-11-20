import { Router, type Response } from "express";
import { decodeListingCursor, encodeListingCursor, serializeListingSummary, type ListingCursor, type ListingFeedRecord, type ListingFeedType } from "./feed-route.ts";
import { compressListingImage, handleListingImageUpload, parseListingFields, type ListingCreateInput } from "./create-route.ts";
import type { ListingDetailsRecord } from "./read-route.ts";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type LifecycleResult =
  | { kind: "updated"; listing: ListingDetailsRecord }
  | { kind: "deleted" }
  | { kind: "not-found" }
  | { kind: "forbidden" }
  | { kind: "invalid-type" }
  | { kind: "invalid-status" };

export interface ListingLifecycleRepository {
  findMine(userId: string, query: { type?: ListingFeedType; limit: number; cursor?: ListingCursor }): Promise<ListingFeedRecord[]>;
  updateOwnedListing(userId: string, listingId: string, input: ListingCreateInput): Promise<LifecycleResult>;
  updateOwnedStatus(userId: string, listingId: string, status: "AVAILABLE" | "SOLD" | "UNAVAILABLE"): Promise<LifecycleResult>;
  deleteOwnedListing(userId: string, listingId: string): Promise<LifecycleResult>;
}

function sendError(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ error: { code, message } });
}

function toQuery(raw: Record<string, unknown>): { type?: ListingFeedType; limit: number; cursor?: ListingCursor } | undefined {
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

function pageResponse(records: ListingFeedRecord[], limit: number) {
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
      url: `/api/v1/listings/${listing.id}/images/${image.id}`,
    })),
    seller: { ...listing.seller, phoneNumber: listing.seller.phoneNumber },
  };
}

function serializeResult(result: LifecycleResult, res: Response): void {
  if (result.kind === "not-found") sendError(res, 404, "NOT_FOUND", "The requested listing was not found.");
  else if (result.kind === "forbidden") sendError(res, 403, "FORBIDDEN", "You cannot manage this listing.");
  else if (result.kind === "invalid-type") sendError(res, 400, "VALIDATION_ERROR", "A listing's type cannot be changed.");
  else if (result.kind === "invalid-status") sendError(res, 400, "VALIDATION_ERROR", "That status is not valid for this listing type.");
  else if (result.kind === "updated") res.status(200).json(serializeDetails(result.listing));
}

export function createListingLifecycleRouter(repository?: ListingLifecycleRepository) {
  const router = Router();

  router.get("/me/listings", async (req, res) => {
    if (!repository) {
      sendError(res, 503, "LISTINGS_UNAVAILABLE", "Seller listings are not available.");
      return;
    }
    const query = toQuery(req.query as Record<string, unknown>);
    if (!query) {
      sendError(res, 400, "VALIDATION_ERROR", "The listing query is invalid.");
      return;
    }
    const userId = res.locals.authenticatedUserId as string;
    const records = await repository.findMine(userId, query);
    res.status(200).json(pageResponse(records, query.limit));
  });

  router.patch("/listings/:listingId", handleListingImageUpload, async (req, res) => {
    if (!repository) {
      sendError(res, 503, "LISTINGS_UNAVAILABLE", "Listing updates are not available.");
      return;
    }
    const listingId = req.params.listingId;
    if (typeof listingId !== "string" || !UUID_PATTERN.test(listingId)) {
      sendError(res, 404, "NOT_FOUND", "The requested listing was not found.");
      return;
    }
    const fields = parseListingFields(req.body);
    const files = (req.files ?? []) as Express.Multer.File[];
    if (!fields || files.length > 3) {
      sendError(res, 400, "VALIDATION_ERROR", "Provide valid listing fields and at most three replacement images.");
      return;
    }
    const images: NonNullable<ListingCreateInput["images"]> = [];
    for (const file of files) {
      const compressed = await compressListingImage(file.buffer);
      if (!compressed) {
        sendError(res, 400, "INVALID_IMAGE", "Images must be valid, non-animated JPEG, PNG, or WebP files.");
        return;
      }
      images.push(compressed);
    }
    const userId = res.locals.authenticatedUserId as string;
    if (!UUID_PATTERN.test(userId)) {
      sendError(res, 401, "UNAUTHORIZED", "A valid API access token is required.");
      return;
    }
    const result = await repository.updateOwnedListing(userId, listingId, { ...fields, images });
    if (result.kind === "updated") res.status(200).json(serializeDetails(result.listing));
    else serializeResult(result, res);
  });

  router.patch("/listings/:listingId/status", async (req, res) => {
    if (!repository) {
      sendError(res, 503, "LISTINGS_UNAVAILABLE", "Listing status updates are not available.");
      return;
    }
    const listingId = req.params.listingId;
    if (typeof listingId !== "string" || !UUID_PATTERN.test(listingId)) {
      sendError(res, 404, "NOT_FOUND", "The requested listing was not found.");
      return;
    }
    const body = req.body as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 1 || !("status" in body)) {
      sendError(res, 400, "VALIDATION_ERROR", "Provide a valid listing status.");
      return;
    }
    const status = (body as { status: unknown }).status;
    if (status !== "AVAILABLE" && status !== "SOLD" && status !== "UNAVAILABLE") {
      sendError(res, 400, "VALIDATION_ERROR", "Provide a valid listing status.");
      return;
    }
    const result = await repository.updateOwnedStatus(res.locals.authenticatedUserId as string, listingId, status);
    if (result.kind === "updated") res.status(200).json(serializeDetails(result.listing));
    else serializeResult(result, res);
  });

  router.delete("/listings/:listingId", async (req, res) => {
    if (!repository) {
      sendError(res, 503, "LISTINGS_UNAVAILABLE", "Listing deletion is not available.");
      return;
    }
    const listingId = req.params.listingId;
    if (typeof listingId !== "string" || !UUID_PATTERN.test(listingId)) {
      sendError(res, 404, "NOT_FOUND", "The requested listing was not found.");
      return;
    }
    const result = await repository.deleteOwnedListing(res.locals.authenticatedUserId as string, listingId);
    if (result.kind === "deleted") res.status(204).end();
    else serializeResult(result, res);
  });

  return router;
}
