import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PostPage } from "../pages/PostPage";
import { saveSession, type Session, type SessionUser } from "../auth/session";
import { translate } from "../i18n/translations";

const user: SessionUser = {
  id: "item-seller",
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

async function openItemForm(action: ReturnType<typeof userEvent.setup>) {
  await action.click(screen.getByRole("button", { name: "Sell an item" }));
}

async function chooseCategory(action: ReturnType<typeof userEvent.setup>) {
  await action.click(screen.getByRole("button", { name: "Category Choose a category" }));
  await action.click(screen.getByRole("option", { name: "Other" }));
}

beforeEach(() => {
  window.localStorage.setItem("near-market.post-rules-seen.item-seller", "true");
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

describe("Item listing form", () => {
  it("shows field errors beside required fields and requires at least one photo", async () => {
    const action = userEvent.setup();
    renderPost();
    await openItemForm(action);
    await action.click(screen.getByRole("button", { name: "Publish item" }));

    expect(screen.getAllByText("This field is required.")).toHaveLength(5);
    expect(screen.getByText("Add at least one photo.")).toBeInTheDocument();
  });

  it("publishes valid item fields as multipart data and routes to the created listing", async () => {
    const created = {
      id: "created-listing-id",
      type: "ITEM",
      title: "Desk lamp",
      description: "Good condition",
      category: "OTHER",
      condition: "USED",
      rentalAddress: null,
      priceAmount: "250.00",
      status: "AVAILABLE",
      images: [{ id: "image-id", position: 1, url: "/api/v1/listings/created-listing-id/images/image-id" }],
      seller: { id: user.id, displayName: user.displayName, telegramUsername: user.telegramUsername, phoneNumber: null },
      createdAt: "2026-11-09T10:00:00.000Z",
      updatedAt: "2026-11-09T10:00:00.000Z",
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(created), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const onPublished = vi.fn();
    const onDirtyChange = vi.fn();
    const action = userEvent.setup();
    renderPost(onPublished, onDirtyChange);
    await openItemForm(action);

    await action.type(screen.getByRole("textbox", { name: "Item name" }), "Desk lamp");
    await action.type(screen.getByRole("textbox", { name: "Description" }), "Good condition");
    await chooseCategory(action);
    await action.click(screen.getByRole("radio", { name: "Used" }));
    await action.type(screen.getByRole("spinbutton", { name: "Price in ETB" }), "250");
    const photo = new File([new Uint8Array([1, 2, 3])], "lamp.png", { type: "image/png" });
    await action.upload(screen.getByLabelText("Choose photos"), photo);
    await action.click(screen.getByRole("button", { name: "Publish item" }));

    await waitFor(() => expect(onPublished).toHaveBeenCalledWith("created-listing-id"));
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/listings");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).has("Content-Type")).toBe(false);
    expect(init.body).toBeInstanceOf(FormData);
    const body = init.body as FormData;
    expect(body.get("type")).toBe("ITEM");
    expect(body.get("title")).toBe("Desk lamp");
    expect(body.get("category")).toBe("OTHER");
    expect(body.get("condition")).toBe("USED");
    expect(body.get("priceAmount")).toBe("250");
    expect(body.getAll("images")).toHaveLength(1);
    expect(window.sessionStorage.getItem("near-market.item-draft.item-seller")).toBeNull();
  });

  it("allows contact for price and sends a blank amount", async () => {
    const created = { id: "new-listing", type: "ITEM", title: "Chair", description: "Chair", category: "OTHER", condition: "NEW", rentalAddress: null, priceAmount: null, status: "AVAILABLE", images: [], seller: { id: user.id, displayName: "Seller", telegramUsername: "seller", phoneNumber: null }, createdAt: "2026-11-09T10:00:00.000Z", updatedAt: "2026-11-09T10:00:00.000Z" };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(created), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const action = userEvent.setup();
    renderPost();
    await openItemForm(action);
    await action.type(screen.getByRole("textbox", { name: "Item name" }), "Chair");
    await action.type(screen.getByRole("textbox", { name: "Description" }), "Chair");
    await chooseCategory(action);
    await action.click(screen.getByRole("radio", { name: "New" }));
    await action.click(screen.getByRole("radio", { name: "Contact for price" }));
    await action.upload(screen.getByLabelText("Choose photos"), new File([new Uint8Array([1])], "chair.webp", { type: "image/webp" }));
    await action.click(screen.getByRole("button", { name: "Publish item" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const body = fetchMock.mock.calls[0][1].body as FormData;
    expect(body.get("priceAmount")).toBe("");
  });

  it("limits photos to three and lets the seller remove a selected photo", async () => {
    const action = userEvent.setup();
    renderPost();
    await openItemForm(action);
    const chooser = screen.getByLabelText("Choose photos");
    const photos = [1, 2, 3, 4].map((number) => new File([new Uint8Array([number])], `photo-${number}.png`, { type: "image/png" }));
    await action.upload(chooser, photos);

    expect(await screen.findByText("You can add up to three photos.")).toBeInTheDocument();
    await action.upload(chooser, photos.slice(0, 3));
    expect(screen.getAllByRole("img")).toHaveLength(3);
    await action.click(screen.getByRole("button", { name: "Remove photo 2" }));
    expect(screen.getAllByRole("img")).toHaveLength(2);
  });

  it("preserves item fields after a publish failure so the seller can retry", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: "INTERNAL_ERROR", message: "Temporary failure" } }), { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "retried-listing" }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const onPublished = vi.fn();
    const action = userEvent.setup();
    renderPost(onPublished);
    await openItemForm(action);
    await action.type(screen.getByRole("textbox", { name: "Item name" }), "Lamp");
    await action.type(screen.getByRole("textbox", { name: "Description" }), "Works");
    await chooseCategory(action);
    await action.click(screen.getByRole("radio", { name: "Used" }));
    await action.type(screen.getByRole("spinbutton", { name: "Price in ETB" }), "100");
    await action.upload(screen.getByLabelText("Choose photos"), new File([new Uint8Array([1])], "lamp.jpg", { type: "image/jpeg" }));
    await action.click(screen.getByRole("button", { name: "Publish item" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not publish your item");
    expect(screen.getByRole("textbox", { name: "Item name" })).toHaveValue("Lamp");
    expect(screen.getByRole("textbox", { name: "Description" })).toHaveValue("Works");
    expect(screen.getByAltText("lamp.jpg")).toBeInTheDocument();
    expect(JSON.parse(window.sessionStorage.getItem("near-market.item-draft.item-seller") ?? "{}")).toMatchObject({ title: "Lamp", description: "Works" });

    await action.click(screen.getByRole("button", { name: "Publish item" }));
    await waitFor(() => expect(onPublished).toHaveBeenCalledWith("retried-listing"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("asks for confirmation before discarding an unsaved draft", async () => {
    const action = userEvent.setup();
    renderPost();
    await openItemForm(action);
    await action.type(screen.getByRole("textbox", { name: "Item name" }), "Lamp");
    await action.click(screen.getByRole("button", { name: "Discard draft" }));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByText("Discard this item draft? Your unsaved changes will be lost.")).toBeInTheDocument();

    await action.click(screen.getAllByRole("button", { name: "Discard draft" }).at(-1)!);
    expect(screen.getByRole("button", { name: "Sell an item" })).toBeInTheDocument();
    expect(window.sessionStorage.getItem("near-market.item-draft.item-seller")).toBeNull();
  });
});
