import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "../api/client";
import { translate } from "../i18n/translations";
import { AdminUsersPage } from "../pages/AdminUsersPage";

vi.mock("../api/client", () => ({ apiRequest: vi.fn() }));

const props = {
  theme: "dark" as const,
  onThemeChange: vi.fn(),
  language: "en" as const,
  onLanguageChange: vi.fn(),
  t: translate("en"),
  isActive: true,
  currentUserId: "dd7320bd-8c00-42da-9ee8-5fe6bcba7cf2",
};
const admin = {
  id: props.currentUserId,
  displayName: "Admin Person",
  telegramUsername: "market_admin",
  isBlocked: false,
  createdAt: "2026-11-07T12:00:00.000Z",
};
const seller = {
  id: "aefedb35-bf6e-4e3d-b890-18e7ee172428",
  displayName: "Seller Person",
  telegramUsername: null,
  isBlocked: true,
  createdAt: "2026-11-06T12:00:00.000Z",
};

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("Admin users page", () => {
  it("shows users, filters, username fallback, and omits the current admin's action menu", async () => {
    vi.mocked(apiRequest).mockResolvedValue({ items: [admin, seller], nextCursor: null } as never);
    render(<AdminUsersPage {...props} />);

    expect(await screen.findByText("Admin Person")).toBeInTheDocument();
    expect(screen.getByText("Seller Person")).toBeInTheDocument();
    expect(screen.getByText("No username · Joined 11/6/2026")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Manage user actions" })).toHaveLength(1);
    expect(screen.getAllByText("Blocked")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Active" }));
    await waitFor(() => expect(apiRequest).toHaveBeenLastCalledWith("/admin/users?filter=active&limit=20", expect.any(Object)));
  });

  it("confirms blocking and sends the block request", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const activeSeller = { ...seller, isBlocked: false };
    vi.mocked(apiRequest).mockImplementation(async (_path, init) => {
      if (init?.method === "POST") return undefined as never;
      return { items: [activeSeller], nextCursor: null } as never;
    });
    render(<AdminUsersPage {...props} />);

    await screen.findByText("Seller Person");
    fireEvent.click(screen.getByRole("button", { name: "Manage user actions" }));
    fireEvent.click(screen.getByRole("button", { name: "Block user" }));

    expect(confirm).toHaveBeenCalledWith("Block Seller Person? This will remove all their listings and prevent them from accessing Near Market.");
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(`/admin/users/${seller.id}/block`, { method: "POST" }));
    expect(await screen.findByText("User blocked and their listings removed.")).toBeInTheDocument();
  });

  it("shows a recoverable load error and an empty result after retry", async () => {
    vi.mocked(apiRequest)
      .mockRejectedValueOnce(new Error("unavailable"))
      .mockResolvedValueOnce({ items: [], nextCursor: null } as never);
    render(<AdminUsersPage {...props} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load users.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("No users found.")).toBeInTheDocument();
  });
});
