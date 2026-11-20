export type ListingType = "ITEM" | "HOUSE_RENTAL";
export type ItemCategory = "Electronics" | "Clothing" | "Other";
export type ItemCondition = "New" | "Used";

export interface PreviewListing {
  id: string;
  type: ListingType;
  title: string;
  price: number | null;
  image: string;
  category?: ItemCategory;
  condition?: ItemCondition;
  address?: string;
  description?: string;
  sellerUsername?: string | null;
  sellerId?: string;
  sellerDisplayName?: string;
  phoneNumber?: string | null;
  status?: "AVAILABLE" | "SOLD" | "UNAVAILABLE";
  imageUrl?: string;
}

export const previewListings: PreviewListing[] = [
  {
    id: "item-phone",
    type: "ITEM",
    title: "Samsung Galaxy phone",
    price: 12_500,
    condition: "Used",
    category: "Electronics",
    image: "https://images.unsplash.com/photo-1480694313141-fce5e697ee25?auto=format&fit=crop&w=480&q=85",
  },
  {
    id: "item-shoes",
    type: "ITEM",
    title: "Women’s everyday shoes",
    price: 2_800,
    condition: "New",
    category: "Clothing",
    image: "https://images.unsplash.com/photo-1697086317645-11bd9e74e2cf?auto=format&fit=crop&w=480&q=85",
  },
  {
    id: "item-headphones",
    type: "ITEM",
    title: "Wireless headphones",
    price: 3_500,
    condition: "Used",
    category: "Electronics",
    image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=480&q=85",
  },
  {
    id: "rental-house-1",
    type: "HOUSE_RENTAL",
    title: "Bright 2-bedroom house",
    price: 24_000,
    address: "Address provided by seller",
    image: "https://images.unsplash.com/photo-1568605114967-8130f3a36994?auto=format&fit=crop&w=480&q=85",
  },
  {
    id: "rental-house-2",
    type: "HOUSE_RENTAL",
    title: "Furnished family house",
    price: 32_000,
    address: "Address provided by seller",
    image: "https://images.unsplash.com/photo-1570129477492-45c003edd2be?auto=format&fit=crop&w=480&q=85",
  },
];
