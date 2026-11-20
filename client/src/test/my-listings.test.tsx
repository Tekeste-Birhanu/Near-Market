import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProfilePage } from "../pages/ProfilePage";
import { clearStoredSession, saveSession, type SessionUser } from "../auth/session";
import { translate } from "../i18n/translations";

const user: SessionUser = { id: "dd7320bd-8c00-42da-9ee8-5fe6bcba7cf2", telegramUsername: "hana", displayName: "Hana", phoneNumber: null, isAdmin: false };
const listingId = "46da38a3-ae4c-4d62-8b8c-5414fe7f341c";
const listing = {
  id: listingId,
  type: "ITEM",
  title: "Phone",
  description: "Used phone",
  category: "ELECTRONICS",
  condition: "USED",
  rentalAddress: null,
  priceAmount: "10.00",
  status: "SOLD",
  images: [],
  seller: { id: user.id, displayName: "Hana", telegramUsername: "hana" },
  createdAt: "2026-11-07T12:00:00.000Z",
  updatedAt: "2026-11-07T12:00:00.000Z",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

function renderProfile() {
  return render(<ProfilePage theme="light" onThemeChange={vi.fn()} language="en" onLanguageChange={vi.fn()} user={user} onUserChange={vi.fn()} t={translate("en")} />);
}

afterEach(() => {
  clearStoredSession();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("My listings", () => {
  it("switches listing type when swiping across My listings content", async () => {
    saveSession({ accessToken: "signed-test-token", expiresAt: "2099-01-01T00:00:00.000Z", user });
    const rental = { ...listing, id: "rental-id", type: "HOUSE_RENTAL", title: "Bole home", rentalAddress: "Bole", category: null, condition: null, status: "AVAILABLE" };
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/v1/me") return Promise.resolve(json(user));
      if (url.includes("type=HOUSE_RENTAL")) return Promise.resolve(json({ items: [rental], nextCursor: null }));
      if (url.startsWith("/api/v1/me/listings")) return Promise.resolve(json({ items: [listing], nextCursor: null }));
      return Promise.resolve(json({}, 404));
    });
    vi.stubGlobal("fetch", fetchMock);

    renderProfile();
    const title = await screen.findByText("Phone");
    fireEvent.touchStart(title, { touches: [{ clientX: 240, clientY: 120 }] });
    fireEvent.touchEnd(title, { changedTouches: [{ clientX: 140, clientY: 122 }] });

    expect(await screen.findByText("Bole")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "House rentals" })).toHaveAttribute("aria-selected", "true");
  });

  it("shows retained sold listings and lets the owner restore availability", async () => {
    saveSession({ accessToken: "signed-test-token", expiresAt: "2099-01-01T00:00:00.000Z", user });
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/v1/me") return Promise.resolve(json(user));
      if (url.startsWith("/api/v1/me/listings")) return Promise.resolve(json({ items: [listing], nextCursor: null }));
      if (url === `/api/v1/listings/${listingId}/status` && init?.method === "PATCH") return Promise.resolve(json({ ...listing, status: "AVAILABLE" }));
      return Promise.resolve(json({ error: { code: "NOT_FOUND", message: "Not found" } }, 404));
    });
    vi.stubGlobal("fetch", fetchMock);
    const action = userEvent.setup();

    renderProfile();
    expect(await screen.findByText("Phone")).toBeInTheDocument();
    expect(screen.getByText("Status: Sold")).toBeInTheDocument();
    await action.click(screen.getByRole("button", { name: "Mark available" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(`/api/v1/listings/${listingId}/status`, expect.objectContaining({ method: "PATCH" })));
    expect(await screen.findByRole("status")).toHaveTextContent("Listing status updated.");
  });

  it("confirms deletion and removes the listing from the owner's list", async () => {
    saveSession({ accessToken: "signed-test-token", expiresAt: "2099-01-01T00:00:00.000Z", user });
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/v1/me") return Promise.resolve(json(user));
      if (url.startsWith("/api/v1/me/listings")) return Promise.resolve(json({ items: [listing], nextCursor: null }));
      if (url === `/api/v1/listings/${listingId}` && init?.method === "DELETE") return Promise.resolve(new Response(null, { status: 204 }));
      return Promise.resolve(json({}, 404));
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("confirm", vi.fn(() => true));
    const action = userEvent.setup();

    renderProfile();
    expect(await screen.findByText("Phone")).toBeInTheDocument();
    await action.click(screen.getByRole("button", { name: "Delete" }));

    expect(window.confirm).toHaveBeenCalledOnce();
    expect(await screen.findByText("You haven't posted any listings yet.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(`/api/v1/listings/${listingId}`, expect.objectContaining({ method: "DELETE" }));
  });

  it("edits listing fields while sending no photo replacements when the existing set is unchanged", async () => {
    saveSession({ accessToken: "signed-test-token", expiresAt: "2099-01-01T00:00:00.000Z", user });
    const imageId = "61269c61-347d-4b5a-899b-9f84d6726470";
    const details = { ...listing, images: [{ id: imageId, position: 1, url: `/api/v1/listings/${listingId}/images/${imageId}` }], seller: { ...listing.seller, phoneNumber: null } };
    const updated = { ...details, title: "Updated phone" };
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/v1/me") return Promise.resolve(json(user));
      if (url.startsWith("/api/v1/me/listings")) return Promise.resolve(json({ items: [{ ...listing, images: details.images }], nextCursor: null }));
      if (url === `/api/v1/listings/${listingId}` && (!init?.method || init.method === "GET")) return Promise.resolve(json(details));
      if (url.startsWith(`/api/v1/listings/${listingId}/images/`)) return Promise.resolve(new Response(new Blob(["image"], { type: "image/webp" }), { status: 200 }));
      if (url === `/api/v1/listings/${listingId}` && init?.method === "PATCH") return Promise.resolve(json(updated));
      return Promise.resolve(json({}, 404));
    });
    vi.stubGlobal("fetch", fetchMock);
    const action = userEvent.setup();

    renderProfile();
    await screen.findByText("Phone");
    await action.click(screen.getByRole("button", { name: "Edit" }));
    const titleInput = await screen.findByRole("textbox", { name: "Item name" });
    await action.clear(titleInput);
    await action.type(titleInput, "Updated phone");
    await action.click(screen.getByRole("button", { name: "Save listing" }));

    await screen.findByRole("status");
    const patchCall = fetchMock.mock.calls.find(([url, options]) => String(url) === `/api/v1/listings/${listingId}` && options?.method === "PATCH");
    expect(patchCall).toBeDefined();
    const body = patchCall?.[1]?.body as FormData;
    expect(body.get("title")).toBe("Updated phone");
    expect(body.getAll("images")).toHaveLength(0);
  });
});
