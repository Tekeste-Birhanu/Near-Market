import { Router, type Request, type Response } from "express";
import multer from "multer";
import sharp from "sharp";
import { serializeListingSummary, type ListingCategory, type ListingCondition, type ListingFeedRecord, type ListingFeedType } from "./feed-route.ts";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 25_000_000;
const ALLOWED_IMAGE_FORMATS = new Set(["jpeg", "png", "webp"]);
const COMMON_FIELDS = ["type", "description", "priceAmount"];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ListingCreateImage {
  mimeType: "image/webp";
  imageBytes: Buffer;
}

export interface ListingCreateInput {
  listingType: ListingFeedType;
  title: string;
  description: string;
  itemCategory: ListingCategory | null;
  itemCondition: ListingCondition | null;
  rentalAddress: string | null;
  priceAmount: string | null;
  images: ListingCreateImage[];
}

export interface ListingCreateRecord extends ListingFeedRecord {
  sellerId: string;
  seller: ListingFeedRecord["seller"] & { phoneNumber: string | null };
  images: Array<{ id: string; position: number }>;
}

export type ListingCreateResult =
  | { kind: "created"; listing: ListingCreateRecord }
  | { kind: "username-required" }
  | { kind: "not-found" };

export interface ListingCreateRepository {
  createListing(userId: string, input: ListingCreateInput): Promise<ListingCreateResult>;
}

type ParsedFields = Omit<ListingCreateInput, "images">;

function sendError(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ error: { code, message } });
}

export function parseListingFields(body: unknown): ParsedFields | undefined {
  if (!body || typeof body !== "object" || Array.isArray(body)) return undefined;
  const fields = body as Record<string, unknown>;
  if (fields.type !== "ITEM" && fields.type !== "HOUSE_RENTAL") return undefined;

  const allowedFields = fields.type === "ITEM"
    ? [...COMMON_FIELDS, "title", "category", "condition"]
    : [...COMMON_FIELDS, "rentalAddress"];
  if (Object.keys(fields).some((key) => !allowedFields.includes(key))) return undefined;

  if (typeof fields.description !== "string" || !fields.description.trim() || fields.description.trim().length > 5000) return undefined;
  let priceAmount: string | null;
  if (typeof fields.priceAmount !== "string") return undefined;
  if (fields.priceAmount === "") {
    priceAmount = null;
  } else {
    if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(fields.priceAmount)) return undefined;
    priceAmount = fields.priceAmount;
  }

  if (fields.type === "ITEM") {
    if (typeof fields.title !== "string" || !fields.title.trim() || fields.title.trim().length > 120) return undefined;
    if (fields.category !== "ELECTRONICS" && fields.category !== "CLOTHING" && fields.category !== "OTHER") return undefined;
    if (fields.condition !== "NEW" && fields.condition !== "USED") return undefined;
    return {
      listingType: "ITEM",
      title: fields.title.trim(),
      description: fields.description.trim(),
      itemCategory: fields.category,
      itemCondition: fields.condition,
      rentalAddress: null,
      priceAmount,
    };
  }

  if (typeof fields.rentalAddress !== "string" || !fields.rentalAddress.trim() || fields.rentalAddress.trim().length > 300) return undefined;
  return {
    listingType: "HOUSE_RENTAL",
    title: fields.rentalAddress.trim(),
    description: fields.description.trim(),
    itemCategory: null,
    itemCondition: null,
    rentalAddress: fields.rentalAddress.trim(),
    priceAmount,
  };
}

export async function compressListingImage(input: Buffer): Promise<ListingCreateImage | undefined> {
  try {
    const image = sharp(input, { limitInputPixels: MAX_IMAGE_PIXELS, failOn: "warning" });
    const metadata = await image.metadata();
    if (
      !metadata.format ||
      !ALLOWED_IMAGE_FORMATS.has(metadata.format) ||
      !metadata.width || !metadata.height ||
      metadata.pages !== undefined && metadata.pages > 1
    ) return undefined;

    const encodings = [
      { size: 1600, quality: 82 },
      { size: 1600, quality: 72 },
      { size: 1600, quality: 62 },
      { size: 1600, quality: 52 },
      { size: 1280, quality: 48 },
      { size: 1024, quality: 42 },
      { size: 800, quality: 36 },
    ];
    for (const { size, quality } of encodings) {
      const result = await sharp(input, { limitInputPixels: MAX_IMAGE_PIXELS, failOn: "warning" })
        .rotate()
        .resize({ width: size, height: size, fit: "inside", withoutEnlargement: true })
        .webp({ quality, effort: 4 })
        .toBuffer();
      if (result.byteLength > 0 && result.byteLength <= MAX_IMAGE_BYTES) {
        return { mimeType: "image/webp", imageBytes: result };
      }
    }
    return undefined;
  } catch {
    return undefined;
  }
}

const uploadImages = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 3, fields: 7, fieldSize: 10_000, parts: 10 },
}).array("images", 3);

export function handleListingImageUpload(req: Request, res: Response, next: (error?: unknown) => void): void {
  uploadImages(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      sendError(res, 413, "PAYLOAD_TOO_LARGE", "Each image must be 5 MB or smaller.");
      return;
    }
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_COUNT") {
      sendError(res, 400, "VALIDATION_ERROR", "Upload between one and three images.");
      return;
    }
    sendError(res, 400, "VALIDATION_ERROR", "The multipart upload is invalid.");
  });
}

export function createListingCreateRouter(repository?: ListingCreateRepository) {
  const router = Router();

  router.post("/listings", handleListingImageUpload, async (req, res) => {
    if (!repository) {
      sendError(res, 503, "LISTINGS_UNAVAILABLE", "Listing creation is not available.");
      return;
    }

    const fields = parseListingFields(req.body);
    const files = (req.files ?? []) as Express.Multer.File[];
    if (!fields || files.length < 1 || files.length > 3) {
      sendError(res, 400, "VALIDATION_ERROR", "Provide valid listing fields and one to three images.");
      return;
    }

    const images: ListingCreateImage[] = [];
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

    const result = await repository.createListing(userId, { ...fields, images });
    if (result.kind === "username-required") {
      sendError(res, 403, "USERNAME_REQUIRED", "Set a Telegram username before posting a listing.");
      return;
    }
    if (result.kind === "not-found") {
      sendError(res, 404, "NOT_FOUND", "The seller account was not found.");
      return;
    }

    const summary = serializeListingSummary(result.listing);
    res.status(201).json({
      ...summary,
      images: result.listing.images.map((image) => ({
        ...image,
        url: `/api/v1/listings/${result.listing.id}/images/${image.id}`,
      })),
      seller: result.listing.seller,
    });
  });

  return router;
}
