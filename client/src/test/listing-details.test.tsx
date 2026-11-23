import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearStoredSession, saveSession, type Session } from "../auth/session";
import { clearImageCache } from "../api/image-cache";
import { ListingsPage } from "../pages/ListingsPage";
import { translate } from "../i18n/translations";

const session: Session = {
  accessToken: "test-token",
  expiresAt: "2099-01-01T00:00:00.000Z",
  user: { id: "buyer-1", telegramUsername: "buyer", displayName: "Buyer", phoneNumber: null, isAdmin: false },
};

const summary = {
  id: "listing-1",
  type: "ITEM",
  title: "Samsung phone",
  description: "Used phone in good condition",
  category: "ELECTRONICS",
  condition: "USED",
  rentalAddress: null,
  priceAmount: "12500.00",
  status: "AVAILABLE",
  images: [],
  seller: { id: "seller-1", displayName: "Hana", telegramUsername: "hana" },
};

const details = {
  ...summary,
  images: [
    { id: "image-1", position: 1, url: "/api/v1/listings/listing-1/images/image-1" },
    { id: "image-2", position: 2, url: "/api/v1/listings/listing-1/images/image-2" },
  ],
  seller: { ...summary.seller, phoneNumber: "+251911234567" },
};

const sellerListing = {
  ...summary,
  id: "listing-2",
  title: "Another phone",
};

const rentalSummary = {
  ...summary,
  id: "rental-1",
  type: "HOUSE_RENTAL",
  title: "Bright family house",
  category: null,
  condition: null,
  rentalAddress: "Bole, near the market",
  priceAmount: "24000.00",
};

const rentalDetails = {
  ...rentalSummary,
  images: [],
  seller: { id: "seller-1", displayName: "Hana", telegramUsername: "hana", phoneNumber: null },
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function renderListings() {
  return render(<ListingsPage theme="light" onThemeChange={vi.fn()} language="en" onLanguageChange={vi.fn()} t={translate("en")} onPost={vi.fn()} />);
}

afterEach(() => {
  clearStoredSession();
  clearImageCache();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("listing details and seller profile", () => {
  it("shows listing photos and details, keeps phone on details, and opens seller profile listings", async () => {
    saveSession(session);
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.startsWith("/api/v1/listings?type=ITEM")) return Promise.resolve(response({ items: [summary], nextCursor: null }));
      if (url === "/api/v1/listings/listing-1") return Promise.resolve(response(details));
      if (url === "/api/v1/sellers/seller-1") return Promise.resolve(response({ id: "seller-1", displayName: "Hana", telegramUsername: "hana" }));
      if (url === "/api/v1/sellers/seller-1/listings?limit=20") return Promise.resolve(response({ items: [sellerListing], nextCursor: null }));
      if (url.includes("/images/")) return Promise.resolve(new Response(new Blob(["image"], { type: "image/jpeg" }), { status: 200 }));
      return Promise.resolve(response({ error: { code: "NOT_FOUND", message: "Not found" } }, 404));
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:test-image"), revokeObjectURL: vi.fn() });
    const user = userEvent.setup();
    renderListings();

    expect(await screen.findByText("Samsung phone")).toBeInTheDocument();
    await user.type(screen.getByRole("searchbox", { name: "Search listings" }), "phone");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/v1/listings?type=ITEM&limit=20&q=phone", expect.any(Object)));
    await user.click(screen.getByRole("button", { name: "View details" }));
    const dialog = await screen.findByRole("dialog", { name: "Listing details" });
    expect(within(dialog).getByRole("heading", { name: "Samsung phone" })).toBeInTheDocument();
    expect(dialog).toHaveTextContent("ETB 12,500");
    expect(dialog).toHaveTextContent("Used phone in good condition");
    expect(within(dialog).getByRole("link", { name: /Phone number/ })).toHaveAttribute("href", "tel:+251911234567");
    expect(within(dialog).getByRole("link", { name: "Contact seller" })).toHaveAttribute("href", "https://t.me/hana");

    await user.click(within(dialog).getByRole("button", { name: "Next photo" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/v1/listings/listing-1/images/image-2", expect.any(Object)));

    await user.click(within(dialog).getByRole("button", { name: /Hana/ }));
    const sellerDialog = await screen.findByRole("dialog", { name: "Seller profile" });
    expect(within(sellerDialog).getByRole("heading", { name: "Hana" })).toBeInTheDocument();
    expect(sellerDialog).not.toHaveTextContent("+251911234567");
    expect(await within(sellerDialog).findByText("Another phone")).toBeInTheDocument();
    expect(within(sellerDialog).getByRole("link", { name: "@hana" })).toHaveAttribute("href", "https://t.me/hana");

    await user.click(within(sellerDialog).getByRole("button", { name: "Back" }));
    expect(await screen.findByRole("dialog", { name: "Listing details" })).toHaveTextContent("Samsung phone");
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByText("Samsung phone")).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Search listings" })).toHaveValue("phone");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows rental address and monthly price in details and returns to the selected rental feed", async () => {
    saveSession(session);
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === "/api/v1/listings?type=ITEM&limit=20") return Promise.resolve(response({ items: [], nextCursor: null }));
      if (url === "/api/v1/listings?type=HOUSE_RENTAL&limit=20") return Promise.resolve(response({ items: [rentalSummary], nextCursor: null }));
      if (url === "/api/v1/listings/rental-1") return Promise.resolve(response(rentalDetails));
      return Promise.resolve(response({ error: { code: "NOT_FOUND", message: "Not found" } }, 404));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderListings();

    await user.click(await screen.findByRole("tab", { name: "House rentals" }));
    expect(await screen.findByText("House rental")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "View details" }));
    const dialog = await screen.findByRole("dialog", { name: "Listing details" });
    expect(dialog).toHaveTextContent("ETB 24,000");
    expect(dialog).toHaveTextContent("/ month");
    expect(dialog).toHaveTextContent("Bole, near the market");
    await user.click(within(dialog).getByRole("button", { name: "Back" }));
    expect(await screen.findByText("House rental")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "House rentals" })).toHaveAttribute("aria-selected", "true");
  });

  it("shows the agreed unavailable message for a retained sold listing opened from an old link", async () => {
    saveStoredBuyer();
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === "/api/v1/listings?type=ITEM&limit=20") return Promise.resolve(response({ items: [summary], nextCursor: null }));
      return Promise.resolve(response({ error: { code: "LISTING_UNAVAILABLE", message: "This listing is no longer available." } }, 410));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderListings();
    await user.click(await screen.findByRole("button", { name: "View details" }));
    expect(await screen.findByRole("heading", { name: "This listing is no longer available." })).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Back" })[0]);
    expect(await screen.findByText("Samsung phone")).toBeInTheDocument();
  });
});

function saveStoredBuyer() {
  saveSession(session);
}

describe("image cache integration", () => {
  const imagePath = "/api/v1/listings/listing-1/images/image-1";

  function buildFetchMock(imageCallTracker: { count: number }) {
    return vi.fn().mockImplementation((url: string) => {
      if (url.startsWith("/api/v1/listings?type=ITEM")) {
        return Promise.resolve(response({ items: [summary], nextCursor: null }));
      }
      if (url === "/api/v1/listings/listing-1") {
        return Promise.resolve(response({ ...details, images: [{ id: "image-1", position: 1, url: imagePath }] }));
      }
      if (url === "/api/v1/sellers/seller-1") {
        return Promise.resolve(response({ id: "seller-1", displayName: "Hana", telegramUsername: "hana" }));
      }
      if (url === "/api/v1/sellers/seller-1/listings?limit=20") {
        return Promise.resolve(response({ items: [], nextCursor: null }));
      }
      if (url.includes("/images/")) {
        imageCallTracker.count += 1;
        return Promise.resolve(new Response(new Blob(["img"], { type: "image/webp" }), { status: 200 }));
      }
      return Promise.resolve(response({ error: { code: "NOT_FOUND", message: "Not found" } }, 404));
    });
  }

  it("does not issue a second image request when the same listing is opened twice in the same session", async () => {
    saveSession(session);
    const imageCallTracker = { count: 0 };
    vi.stubGlobal("fetch", buildFetchMock(imageCallTracker));
    vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:test"), revokeObjectURL: vi.fn() });
    const user = userEvent.setup();

    renderListings();
    await screen.findByText("Samsung phone");

    // Open details — image fetched for the first time.
    await user.click(screen.getByRole("button", { name: "View details" }));
    await screen.findByRole("dialog", { name: "Listing details" });
    await waitFor(() => expect(imageCallTracker.count).toBe(1));

    // Close and reopen.
    await user.click(screen.getByRole("button", { name: "Back" }));
    await screen.findByText("Samsung phone");
    await user.click(screen.getByRole("button", { name: "View details" }));
    await screen.findByRole("dialog", { name: "Listing details" });

    // The image should be served from cache — still only one network call.
    await waitFor(() => expect(imageCallTracker.count).toBe(1));
  });

  it("re-fetches the image after the cache is cleared (session change)", async () => {
    saveSession(session);
    const imageCallTracker = { count: 0 };
    vi.stubGlobal("fetch", buildFetchMock(imageCallTracker));
    vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:test"), revokeObjectURL: vi.fn() });
    const user = userEvent.setup();

    renderListings();
    await screen.findByText("Samsung phone");

    await user.click(screen.getByRole("button", { name: "View details" }));
    await screen.findByRole("dialog", { name: "Listing details" });
    await waitFor(() => expect(imageCallTracker.count).toBe(1));

    // Simulate a session change clearing the cache.
    clearImageCache();

    // Close and reopen.
    await user.click(screen.getByRole("button", { name: "Back" }));
    await screen.findByText("Samsung phone");
    await user.click(screen.getByRole("button", { name: "View details" }));
    await screen.findByRole("dialog", { name: "Listing details" });

    // Cache was cleared — a new fetch must have been made.
    await waitFor(() => expect(imageCallTracker.count).toBe(2));
  });
});
