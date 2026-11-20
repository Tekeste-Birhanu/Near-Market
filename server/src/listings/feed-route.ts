import { Router, type Response } from "express";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PRICE_PATTERN = /^\d{1,10}(?:\.\d{1,2})?$/;

export type ListingFeedType = "ITEM" | "HOUSE_RENTAL";
export type ListingSort = "NEWEST" | "OLDEST";
export type ListingCategory = "ELECTRONICS" | "CLOTHING" | "OTHER";
export type ListingCondition = "NEW" | "USED";

export interface ListingCursor {
  createdAt: Date;
  id: string;
}

export interface ListingFeedQuery {
  type: ListingFeedType;
  sort?: ListingSort;
  q?: string;
  category?: ListingCategory;
  condition?: ListingCondition;
  minPrice?: string;
  maxPrice?: string;
  limit: number;
  cursor?: ListingCursor;
}

export interface ListingFeedRecord {
  id: string;
  listingType: ListingFeedType;
  title: string;
  description: string;
  itemCategory: ListingCategory | null;
  itemCondition: ListingCondition | null;
  rentalAddress: string | null;
  priceAmount: { toFixed(decimalPlaces: number): string } | string | null;
  availabilityStatus: "AVAILABLE" | "SOLD" | "UNAVAILABLE";
  createdAt: Date;
  updatedAt: Date;
  images: Array<{ id: string; position: number }>;
  seller: { id: string; displayName: string; telegramUsername: string | null };
}

export interface ListingFeedRepository {
  findAvailable(query: ListingFeedQuery): Promise<ListingFeedRecord[]>;
}

function sendValidationError(res: Response): void {
  res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "The listing query is invalid." } });
}

function queryString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function encodeListingCursor(record: ListingFeedRecord): string {
  return Buffer.from(JSON.stringify({ createdAt: record.createdAt.toISOString(), id: record.id })).toString("base64url");
}

export function decodeListingCursor(value: string): ListingCursor | undefined {
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(value)) return undefined;
  try {
    const json = Buffer.from(value, "base64url").toString("utf8");
    if (Buffer.from(json).toString("base64url") !== value) return undefined;
    const record: unknown = JSON.parse(json);
    if (!record || typeof record !== "object" || Array.isArray(record)) return undefined;
    const cursor = record as { createdAt?: unknown; id?: unknown };
    if (typeof cursor.createdAt !== "string" || typeof cursor.id !== "string" || !UUID_PATTERN.test(cursor.id)) return undefined;
    const createdAt = new Date(cursor.createdAt);
    if (!Number.isFinite(createdAt.getTime()) || createdAt.toISOString() !== cursor.createdAt) return undefined;
    return { createdAt, id: cursor.id };
  } catch {
    return undefined;
  }
}

export function serializeListingSummary(listing: ListingFeedRecord) {
  return {
    id: listing.id,
    type: listing.listingType,
    title: listing.title,
    description: listing.description,
    category: listing.itemCategory,
    condition: listing.itemCondition,
    rentalAddress: listing.rentalAddress,
    priceAmount: listing.priceAmount === null
      ? null
      : typeof listing.priceAmount === "string"
        ? listing.priceAmount
        : listing.priceAmount.toFixed(2),
    status: listing.availabilityStatus,
    images: listing.images.map((image) => ({
      ...image,
      url: `/api/v1/listings/${listing.id}/images/${image.id}`,
    })),
    seller: listing.seller,
    createdAt: listing.createdAt.toISOString(),
    updatedAt: listing.updatedAt.toISOString(),
  };
}

function toMinorUnits(value: string): bigint {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}

export function createListingFeedRouter(repository?: ListingFeedRepository) {
  const router = Router();

  router.get("/listings", async (req, res) => {
    if (!repository) {
      res.status(503).json({ error: { code: "LISTINGS_UNAVAILABLE", message: "Listings are not available." } });
      return;
    }

    const raw = req.query as Record<string, unknown>;
    const allowedKeys = new Set(["type", "sort", "q", "category", "condition", "minPrice", "maxPrice", "limit", "cursor"]);
    if (Object.keys(raw).some((key) => !allowedKeys.has(key))) {
      sendValidationError(res);
      return;
    }

    const typeValue = queryString(raw.type);
    if (typeValue !== "ITEM" && typeValue !== "HOUSE_RENTAL") {
      sendValidationError(res);
      return;
    }

    const rawSortValue = raw.sort === undefined ? undefined : queryString(raw.sort);
    if (raw.sort !== undefined && rawSortValue !== "NEWEST" && rawSortValue !== "OLDEST") {
      sendValidationError(res);
      return;
    }
    const sortValue = rawSortValue as ListingSort | undefined;

    const qValue = raw.q === undefined ? undefined : queryString(raw.q);
    if (raw.q !== undefined && (qValue === undefined || qValue.trim().length > 100)) {
      sendValidationError(res);
      return;
    }
    const categoryValue = raw.category === undefined ? undefined : queryString(raw.category);
    if (raw.category !== undefined && (typeValue !== "ITEM" || !["ELECTRONICS", "CLOTHING", "OTHER"].includes(categoryValue ?? ""))) {
      sendValidationError(res);
      return;
    }
    const conditionValue = raw.condition === undefined ? undefined : queryString(raw.condition);
    if (raw.condition !== undefined && (typeValue !== "ITEM" || !["NEW", "USED"].includes(conditionValue ?? ""))) {
      sendValidationError(res);
      return;
    }

    const minPrice = raw.minPrice === undefined ? undefined : queryString(raw.minPrice);
    const maxPrice = raw.maxPrice === undefined ? undefined : queryString(raw.maxPrice);
    if (
      (raw.minPrice !== undefined && (minPrice === undefined || !PRICE_PATTERN.test(minPrice))) ||
      (raw.maxPrice !== undefined && (maxPrice === undefined || !PRICE_PATTERN.test(maxPrice))) ||
      (minPrice !== undefined && maxPrice !== undefined && toMinorUnits(minPrice) > toMinorUnits(maxPrice))
    ) {
      sendValidationError(res);
      return;
    }

    const rawLimit = raw.limit === undefined ? undefined : queryString(raw.limit);
    if (raw.limit !== undefined && (rawLimit === undefined || !/^\d+$/.test(rawLimit))) {
      sendValidationError(res);
      return;
    }
    const limit = rawLimit === undefined ? 20 : Number(rawLimit);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
      sendValidationError(res);
      return;
    }

    const cursorValue = raw.cursor === undefined ? undefined : queryString(raw.cursor);
    const cursor = cursorValue === undefined ? undefined : decodeListingCursor(cursorValue);
    if (raw.cursor !== undefined && (!cursorValue || !cursor)) {
      sendValidationError(res);
      return;
    }

    const query: ListingFeedQuery = {
      type: typeValue,
      ...(sortValue ? { sort: sortValue } : {}),
      ...(qValue?.trim() ? { q: qValue.trim() } : {}),
      ...(categoryValue ? { category: categoryValue as ListingCategory } : {}),
      ...(conditionValue ? { condition: conditionValue as ListingCondition } : {}),
      ...(minPrice ? { minPrice } : {}),
      ...(maxPrice ? { maxPrice } : {}),
      limit,
      ...(cursor ? { cursor } : {}),
    };

    const records = await repository.findAvailable(query);
    const hasMore = records.length > limit;
    const page = records.slice(0, limit);
    res.status(200).json({
      items: page.map(serializeListingSummary),
      nextCursor: hasMore && page.length ? encodeListingCursor(page[page.length - 1]) : null,
    });
  });

  return router;
}
