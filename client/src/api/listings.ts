import { apiRequest } from "./client";
import type { ListingType, PreviewListing } from "../data/listings";

export interface ListingImage {
  id: string;
  position: number;
  url: string;
}

export interface ListingSummary {
  id: string;
  type: ListingType;
  title: string;
  description: string;
  category: "ELECTRONICS" | "CLOTHING" | "OTHER" | null;
  condition: "NEW" | "USED" | null;
  rentalAddress: string | null;
  priceAmount: string | null;
  status: "AVAILABLE" | "SOLD" | "UNAVAILABLE";
  images: ListingImage[];
  seller: { id: string; displayName: string; telegramUsername: string | null };
}

export interface ListingFeedResponse {
  items: ListingSummary[];
  nextCursor: string | null;
}

export interface MyListingsQuery {
  type?: ListingType;
  cursor?: string;
}

export interface ListingDetails extends ListingSummary {
  seller: ListingSummary["seller"] & { phoneNumber: string | null };
}

export interface SellerProfile {
  id: string;
  displayName: string;
  telegramUsername: string | null;
}

export interface NewItemListing {
  title: string;
  description: string;
  category: NonNullable<ListingSummary["category"]>;
  condition: NonNullable<ListingSummary["condition"]>;
  priceAmount: string;
  images: File[];
}

export interface NewHouseRentalListing {
  description: string;
  rentalAddress: string;
  priceAmount: string;
  images: File[];
}

export async function createItemListing(input: NewItemListing): Promise<ListingDetails> {
  const body = new FormData();
  body.set("type", "ITEM");
  body.set("title", input.title);
  body.set("description", input.description);
  body.set("category", input.category);
  body.set("condition", input.condition);
  body.set("priceAmount", input.priceAmount);
  for (const image of input.images) body.append("images", image);
  return apiRequest<ListingDetails>("/listings", { method: "POST", body });
}

export async function createHouseRentalListing(input: NewHouseRentalListing): Promise<ListingDetails> {
  const body = new FormData();
  body.set("type", "HOUSE_RENTAL");
  body.set("description", input.description);
  body.set("rentalAddress", input.rentalAddress);
  body.set("priceAmount", input.priceAmount);
  for (const image of input.images) body.append("images", image);
  return apiRequest<ListingDetails>("/listings", { method: "POST", body });
}

export async function fetchMyListings(query: MyListingsQuery = {}, signal?: AbortSignal): Promise<ListingFeedResponse> {
  const params = new URLSearchParams({ limit: "20" });
  if (query.type) params.set("type", query.type);
  if (query.cursor) params.set("cursor", query.cursor);
  return apiRequest<ListingFeedResponse>(`/me/listings?${params.toString()}`, { signal });
}

export type UpdateListingInput = {
  type: "ITEM";
  title: string;
  description: string;
  category: NonNullable<ListingSummary["category"]>;
  condition: NonNullable<ListingSummary["condition"]>;
  priceAmount: string;
  images: File[];
} | {
  type: "HOUSE_RENTAL";
  description: string;
  rentalAddress: string;
  priceAmount: string;
  images: File[];
};

export async function updateListing(listingId: string, input: UpdateListingInput): Promise<ListingDetails> {
  const body = new FormData();
  body.set("type", input.type);
  body.set("description", input.description);
  body.set("priceAmount", input.priceAmount);
  if (input.type === "ITEM") {
    body.set("title", input.title);
    body.set("category", input.category);
    body.set("condition", input.condition);
  } else {
    body.set("rentalAddress", input.rentalAddress);
  }
  for (const image of input.images) body.append("images", image);
  return apiRequest<ListingDetails>(`/listings/${encodeURIComponent(listingId)}`, { method: "PATCH", body });
}

export async function updateListingStatus(listingId: string, status: ListingDetails["status"]): Promise<ListingDetails> {
  return apiRequest<ListingDetails>(`/listings/${encodeURIComponent(listingId)}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export async function deleteListing(listingId: string): Promise<void> {
  await apiRequest<void>(`/listings/${encodeURIComponent(listingId)}`, { method: "DELETE" });
}

export function toCardListing(item: ListingSummary): PreviewListing {
  const imagePath = item.images[0]?.url ?? "";
  return {
    id: item.id,
    type: item.type,
    title: item.title,
    description: item.description,
    category: item.category === "ELECTRONICS" ? "Electronics" : item.category === "CLOTHING" ? "Clothing" : item.category === "OTHER" ? "Other" : undefined,
    condition: item.condition === "NEW" ? "New" : item.condition === "USED" ? "Used" : undefined,
    address: item.rentalAddress ?? undefined,
    price: item.priceAmount === null ? null : Number(item.priceAmount),
    image: imagePath.startsWith("/api/v1") ? imagePath.slice("/api/v1".length) : imagePath,
    sellerId: item.seller.id,
    sellerDisplayName: item.seller.displayName,
    sellerUsername: item.seller.telegramUsername,
    status: item.status,
  };
}

export async function fetchListingDetails(listingId: string, signal?: AbortSignal): Promise<ListingDetails> {
  return apiRequest<ListingDetails>(`/listings/${encodeURIComponent(listingId)}`, { signal });
}

export async function fetchSellerProfile(sellerId: string, signal?: AbortSignal): Promise<SellerProfile> {
  return apiRequest<SellerProfile>(`/sellers/${encodeURIComponent(sellerId)}`, { signal });
}

export async function fetchSellerListings(sellerId: string, signal?: AbortSignal, cursor?: string): Promise<ListingFeedResponse> {
  const params = new URLSearchParams({ limit: "20" });
  if (cursor) params.set("cursor", cursor);
  return apiRequest<ListingFeedResponse>(`/sellers/${encodeURIComponent(sellerId)}/listings?${params.toString()}`, { signal });
}
