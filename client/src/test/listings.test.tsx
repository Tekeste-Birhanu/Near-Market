import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearStoredSession, saveSession, type Session } from "../auth/session";
import { ListingsPage } from "../pages/ListingsPage";
import { translate } from "../i18n/translations";

const session: Session = {
  accessToken: "test-token",
  expiresAt: "2099-01-01T00:00:00.000Z",
  user: { id: "user-1", telegramUsername: "seller", displayName: "Seller", phoneNumber: null, isAdmin: false },
};

const item = {
  id: "listing-1",
  type: "ITEM",
  title: "Used phone",
  description: "Works well",
  category: "ELECTRONICS",
  condition: "USED",
  rentalAddress: null,
  priceAmount: "12500.00",
  images: [],
  seller: { telegramUsername: "seller_name" },
};

const rental = {
  id: "rental-1",
  type: "HOUSE_RENTAL",
  title: "Bright family house",
  description: "Two bedrooms near the market.",
  category: null,
  condition: null,
  rentalAddress: "Bole, near the market",
  priceAmount: "24000.00",
  images: [],
  seller: { telegramUsername: "home_owner" },
};

function renderListings() {
  return render(
    <ListingsPage
      theme="light"
      onThemeChange={vi.fn()}
      language="en"
      onLanguageChange={vi.fn()}
      t={translate("en")}
      onPost={vi.fn()}
    />,
  );
}

afterEach(() => {
  clearStoredSession();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Listings feed", () => {
  it("applies oldest-first ordering to the feed request", async () => {
    saveSession(session);
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [item], nextCursor: null }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderListings();
    expect(await screen.findByText("Used phone")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Sort listings Newest first" }));
    await user.click(screen.getByRole("option", { name: "Oldest first" }));

    await waitFor(() => expect(fetchMock.mock.calls.at(-1)?.[0]).toBe("/api/v1/listings?type=ITEM&limit=20&sort=OLDEST"));
  });

  it("switches listing type when swiping across the listing content", async () => {
    saveSession(session);
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      const items = String(url).includes("type=HOUSE_RENTAL") ? [rental] : [item];
      return Promise.resolve(new Response(JSON.stringify({ items, nextCursor: null }), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);
    renderListings();
    const listingTitle = await screen.findByText("Used phone");

    fireEvent.touchStart(listingTitle, { touches: [{ clientX: 240, clientY: 120 }] });
    fireEvent.touchEnd(listingTitle, { changedTouches: [{ clientX: 140, clientY: 122 }] });

    expect(await screen.findByText("House rental")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "House rentals" })).toHaveAttribute("aria-selected", "true");
  });

  it("loads item listings, filters them through the API, and opens seller contact and details", async () => {
    saveSession(session);
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [item], nextCursor: null }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderListings();

    expect(await screen.findByText("Used phone")).toBeInTheDocument();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/listings?type=ITEM&limit=20");
    expect(screen.getByRole("link", { name: "Contact" })).toHaveAttribute("href", "https://t.me/seller_name");

    await user.click(screen.getByRole("button", { name: "Filter" }));
    await user.click(screen.getByRole("button", { name: "Category All categories" }));
    await user.click(screen.getByRole("option", { name: "Electronics" }));

    await waitFor(() => expect(fetchMock.mock.calls.at(-1)?.[0]).toBe("/api/v1/listings?type=ITEM&limit=20&category=ELECTRONICS"));
    await user.type(screen.getByRole("searchbox", { name: "Search listings" }), "phone");
    await waitFor(() => expect(fetchMock.mock.calls.at(-1)?.[0]).toBe("/api/v1/listings?type=ITEM&limit=20&q=phone&category=ELECTRONICS"));
  });

  it("shows an empty feed with a Post action", async () => {
    saveSession(session);
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ items: [], nextCursor: null }), { status: 200 })));
    vi.stubGlobal("fetch", fetchMock);
    const onPost = vi.fn();
    render(<ListingsPage theme="light" onThemeChange={vi.fn()} language="en" onLanguageChange={vi.fn()} t={translate("en")} onPost={onPost} />);

    expect(await screen.findByText("No listings found")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("tab", { name: "House rentals" }));
    await waitFor(() => expect(fetchMock.mock.calls.at(-1)?.[0]).toBe("/api/v1/listings?type=HOUSE_RENTAL&limit=20"));
    expect(await screen.findByText("No listings found")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Post" }));
    expect(onPost).toHaveBeenCalledOnce();
  });

  it("opens listing details when returning to Listings after publishing", async () => {
    saveSession(session);
    const createdListing = {
      id: "created-listing-id",
      type: "ITEM",
      title: "Newly published lamp",
      description: "Works well",
      category: "OTHER",
      condition: "NEW",
      rentalAddress: null,
      priceAmount: "100.00",
      status: "AVAILABLE",
      images: [],
      seller: { id: session.user.id, displayName: "Seller", telegramUsername: "seller", phoneNumber: null },
      createdAt: "2026-11-09T10:00:00.000Z",
      updatedAt: "2026-11-09T10:00:00.000Z",
    };
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/listings/created-listing-id")) return Promise.resolve(new Response(JSON.stringify(createdListing), { status: 200 }));
      return Promise.resolve(new Response(JSON.stringify({ items: [], nextCursor: null }), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const onNewListingOpened = vi.fn();

    render(<ListingsPage
      theme="light"
      onThemeChange={vi.fn()}
      language="en"
      onLanguageChange={vi.fn()}
      t={translate("en")}
      onPost={vi.fn()}
      newListingId="created-listing-id"
      onNewListingOpened={onNewListingOpened}
    />);

    expect(await screen.findByRole("dialog", { name: "Listing details" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Newly published lamp" })).toBeInTheDocument();
    expect(onNewListingOpened).toHaveBeenCalledOnce();
  });

  it("loads rental search and price filters and renders a rental card with monthly price, address, and contact", async () => {
    saveSession(session);
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      const items = String(url).includes("type=HOUSE_RENTAL") ? [rental] : [];
      return Promise.resolve(new Response(JSON.stringify({ items, nextCursor: null }), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderListings();

    await user.click(await screen.findByRole("tab", { name: "House rentals" }));
    expect(await screen.findByText("House rental")).toBeInTheDocument();
    expect(screen.getByText("Bole, near the market")).toBeInTheDocument();
    expect(fetchMock.mock.calls.at(-1)?.[0]).toBe("/api/v1/listings?type=HOUSE_RENTAL&limit=20");
    expect(screen.getByText("ETB 24,000")).toBeInTheDocument();
    expect(screen.getByText("/ month")).toBeInTheDocument();
    expect(screen.getByText("Bole, near the market")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Contact" })).toHaveAttribute("href", "https://t.me/home_owner");

    await user.click(screen.getByRole("button", { name: "Filter" }));
    expect(screen.queryByRole("button", { name: /Category/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Condition/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Price Any price" }));
    await user.click(screen.getByRole("option", { name: "Under 5,000" }));
    await waitFor(() => expect(fetchMock.mock.calls.at(-1)?.[0]).toBe("/api/v1/listings?type=HOUSE_RENTAL&limit=20&maxPrice=4999.99"));

    await user.type(screen.getByRole("searchbox", { name: "Search listings" }), "house");
    await waitFor(() => expect(fetchMock.mock.calls.at(-1)?.[0]).toBe("/api/v1/listings?type=HOUSE_RENTAL&limit=20&q=house&maxPrice=4999.99"));
  });

  it("shows a retry action after feed failure", async () => {
    saveSession(session);
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [item], nextCursor: null }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderListings();

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not reach Near Market");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Used phone")).toBeInTheDocument();
  });
});
