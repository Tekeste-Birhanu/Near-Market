import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PostPage } from "../pages/PostPage";
import { saveSession, type Session, type SessionUser } from "../auth/session";
import { translate } from "../i18n/translations";

const user: SessionUser = {
  id: "rental-seller",
  telegramUsername: "seller",
  displayName: "Seller",
  phoneNumber: null,
  isAdmin: false,
};
const session: Session = { accessToken: "test-token", expiresAt: "2099-01-01T00:00:00.000Z", user };

function renderPost(onPublished = vi.fn(), onDirtyChange = vi.fn()) {
  return render(<PostPage
    theme="light"
    onThemeChange={vi.fn()}
    language="en"
    onLanguageChange={vi.fn()}
    user={user}
    onPublished={onPublished}
    onDirtyChange={onDirtyChange}
    t={translate("en")}
  />);
}

async function openRentalForm(action: ReturnType<typeof userEvent.setup>) {
  await action.click(screen.getByRole("button", { name: "Rent out a house" }));
}

beforeEach(() => {
  window.localStorage.setItem("near-market.post-rules-seen.rental-seller", "true");
  saveSession(session);
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:test-photo") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
});

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  window.localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("House rental listing form", () => {
  it("requires a description, seller-entered address, monthly price, and at least one photo", async () => {
    const action = userEvent.setup();
    renderPost();
    await openRentalForm(action);
    await action.click(screen.getByRole("button", { name: "Publish house rental" }));

    expect(screen.getAllByText("This field is required.")).toHaveLength(3);
    expect(screen.getByText("Add at least one photo.")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /House address/ })).toHaveAttribute("aria-invalid", "true");
  });

  it("publishes whole-house details with the required address and monthly ETB price", async () => {
    const created = {
      id: "created-rental-id", type: "HOUSE_RENTAL", title: "Near the market, block 2", description: "Two bedrooms",
      category: null, condition: null, rentalAddress: "Near the market, block 2", priceAmount: "24000.00",
      status: "AVAILABLE", images: [],
      seller: { id: user.id, displayName: user.displayName, telegramUsername: user.telegramUsername, phoneNumber: null },
      createdAt: "2026-11-09T10:00:00.000Z", updatedAt: "2026-11-09T10:00:00.000Z",
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(created), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const onPublished = vi.fn();
    const onDirtyChange = vi.fn();
    const action = userEvent.setup();
    renderPost(onPublished, onDirtyChange);
    await openRentalForm(action);
    await action.type(screen.getByRole("textbox", { name: "Description" }), "Two bedrooms");
    await action.type(screen.getByRole("textbox", { name: "House address" }), "Near the market, block 2");
    await action.type(screen.getByRole("spinbutton", { name: "Monthly price in ETB" }), "24000");
    await action.upload(screen.getByLabelText("Choose photos"), new File([new Uint8Array([1, 2])], "house.jpg", { type: "image/jpeg" }));
    await action.click(screen.getByRole("button", { name: "Publish house rental" }));

    await waitFor(() => expect(onPublished).toHaveBeenCalledWith("created-rental-id"));
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/listings");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).has("Content-Type")).toBe(false);
    expect(init.body).toBeInstanceOf(FormData);
    const body = init.body as FormData;
    expect(body.get("type")).toBe("HOUSE_RENTAL");
    expect(body.get("title")).toBeNull();
    expect(body.get("rentalAddress")).toBe("Near the market, block 2");
    expect(body.get("priceAmount")).toBe("24000");
    expect(body.get("category")).toBeNull();
    expect(body.get("condition")).toBeNull();
    expect(body.getAll("images")).toHaveLength(1);
    expect(window.sessionStorage.getItem("near-market.house-rental-draft.rental-seller")).toBeNull();
  });

  it("allows contact for monthly rent", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "contact-rental-id" }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const action = userEvent.setup();
    renderPost();
    await openRentalForm(action);
    await action.type(screen.getByRole("textbox", { name: "Description" }), "Spacious house");
    await action.type(screen.getByRole("textbox", { name: "House address" }), "Main road");
    await action.click(screen.getByRole("radio", { name: "Contact for price" }));
    await action.upload(screen.getByLabelText("Choose photos"), new File([new Uint8Array([1])], "house.webp", { type: "image/webp" }));
    await action.click(screen.getByRole("button", { name: "Publish house rental" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const body = fetchMock.mock.calls[0][1].body as FormData;
    expect(body.get("priceAmount")).toBe("");
  });

  it("limits photos to three and lets the seller remove a selected photo", async () => {
    const action = userEvent.setup();
    renderPost();
    await openRentalForm(action);
    const chooser = screen.getByLabelText("Choose photos");
    const photos = [1, 2, 3, 4].map((number) => new File([new Uint8Array([number])], `house-${number}.png`, { type: "image/png" }));
    await action.upload(chooser, photos);

    expect(await screen.findByText("You can add up to three photos.")).toBeInTheDocument();
    await action.upload(chooser, photos.slice(0, 3));
    expect(screen.getAllByRole("img")).toHaveLength(3);
    await action.click(screen.getByRole("button", { name: "Remove photo 2" }));
    expect(screen.getAllByRole("img")).toHaveLength(2);
  });

  it("preserves rental fields after a publish failure so the seller can retry", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: "INTERNAL_ERROR", message: "Temporary failure" } }), { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "retried-rental" }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const onPublished = vi.fn();
    const action = userEvent.setup();
    renderPost(onPublished);
    await openRentalForm(action);
    await action.type(screen.getByRole("textbox", { name: "Description" }), "Works well");
    await action.type(screen.getByRole("textbox", { name: "House address" }), "Main road");
    await action.type(screen.getByRole("spinbutton", { name: "Monthly price in ETB" }), "15000");
    await action.upload(screen.getByLabelText("Choose photos"), new File([new Uint8Array([1])], "home.png", { type: "image/png" }));
    await action.click(screen.getByRole("button", { name: "Publish house rental" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not publish your house rental");
    expect(screen.getByRole("textbox", { name: "House address" })).toHaveValue("Main road");
    expect(screen.getByAltText("home.png")).toBeInTheDocument();
    expect(JSON.parse(window.sessionStorage.getItem("near-market.house-rental-draft.rental-seller") ?? "{}")).toMatchObject({ rentalAddress: "Main road" });

    await action.click(screen.getByRole("button", { name: "Publish house rental" }));
    await waitFor(() => expect(onPublished).toHaveBeenCalledWith("retried-rental"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("confirms before discarding an unsaved rental draft", async () => {
    const action = userEvent.setup();
    renderPost();
    await openRentalForm(action);
    await action.type(screen.getByRole("textbox", { name: "House address" }), "Main road");
    await action.click(screen.getByRole("button", { name: "Discard draft" }));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByText("Discard this house rental draft? Your unsaved changes will be lost.")).toBeInTheDocument();

    await action.click(screen.getAllByRole("button", { name: "Discard draft" }).at(-1)!);
    expect(screen.getByRole("button", { name: "Sell an item" })).toBeInTheDocument();
    expect(window.sessionStorage.getItem("near-market.house-rental-draft.rental-seller")).toBeNull();
  });
});
