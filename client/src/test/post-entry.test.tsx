import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PostPage } from "../pages/PostPage";
import type { SessionUser } from "../auth/session";
import { translate } from "../i18n/translations";

const seller: SessionUser = {
  id: "seller-15",
  telegramUsername: "seller",
  displayName: "Seller",
  phoneNumber: null,
  isAdmin: false,
};

function renderPost(user: SessionUser | null) {
  return render(
    <PostPage
      theme="light"
      onThemeChange={vi.fn()}
      language="en"
      onLanguageChange={vi.fn()}
      user={user}
      t={translate("en")}
    />,
  );
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("Post entry flow", () => {
  it("blocks posting without a Telegram username while explaining browsing remains available", () => {
    renderPost({ ...seller, telegramUsername: null });

    expect(screen.getByText("Telegram username required")).toBeInTheDocument();
    expect(screen.getByText(/You can still browse listings without one/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sell an item" })).not.toBeInTheDocument();
  });

  it("shows the prohibited-listings notice before type selection without a checkbox", async () => {
    const action = userEvent.setup();
    renderPost(seller);

    expect(screen.getByText("All illegal listings are prohibited, including drugs.")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sell an item" })).not.toBeInTheDocument();

    await action.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("button", { name: "Sell an item" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rent out a house" })).toBeInTheDocument();
  });

  it.each([
    ["Sell an item", "Post an item"],
    ["Rent out a house", "Post a house rental"],
  ])("routes %s to its matching form entry", async (buttonName, heading) => {
    window.localStorage.setItem("near-market.post-rules-seen.seller-15", "true");
    const action = userEvent.setup();
    renderPost(seller);

    await action.click(screen.getByRole("button", { name: buttonName }));
    expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    if (buttonName === "Sell an item") {
      expect(screen.getByRole("textbox", { name: "Item name" })).toBeInTheDocument();
    } else {
      expect(screen.getByRole("textbox", { name: "House address" })).toBeInTheDocument();
    }
    await action.click(screen.getByRole("button", { name: /Back/ }));
    expect(screen.getByRole("button", { name: "Sell an item" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rent out a house" })).toBeInTheDocument();
  });

  it("remembers that the rules were shown for this user on this device", async () => {
    const action = userEvent.setup();
    const first = renderPost(seller);
    await action.click(screen.getByRole("button", { name: "Continue" }));
    first.unmount();

    renderPost(seller);
    expect(screen.queryByText("All illegal listings are prohibited, including drugs.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sell an item" })).toBeInTheDocument();
  });
});
