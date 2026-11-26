import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "../api/client";
import { AdminDashboardPage } from "../pages/AdminDashboardPage";
import { translate } from "../i18n/translations";

vi.mock("../api/client", () => ({ apiRequest: vi.fn() }));

const props = {
  theme: "dark" as const,
  onThemeChange: vi.fn(),
  language: "en" as const,
  onLanguageChange: vi.fn(),
  t: translate("en"),
};

afterEach(() => vi.clearAllMocks());

describe("Admin dashboard", () => {
  it("renders totals and category counts with the expanded list control", async () => {
    const metrics = {
      totalUsers: 12,
      totalListings: 8,
      totalItemListings: 5,
      totalHouseRentalListings: 3,
      itemListingsByCategory: [
        { category: "ELECTRONICS", count: 3 },
        { category: "CLOTHING", count: 2 },
        { category: "FURNITURE", count: 0 },
        { category: "OTHER", count: 0 },
      ],
    };
    vi.mocked(apiRequest).mockImplementation(async () => metrics as never);

    render(<AdminDashboardPage {...props} />);

    expect(await screen.findByText("12")).toBeInTheDocument();
    expect(screen.getByText("Total users")).toBeInTheDocument();
    expect(screen.getByText("Total listings")).toBeInTheDocument();
    expect(screen.getByText("Item listings")).toBeInTheDocument();
    expect(screen.getByText("House rentals")).toBeInTheDocument();
    expect(screen.getByText("Electronics")).toBeInTheDocument();
    expect(screen.getByText("Clothing")).toBeInTheDocument();
    expect(screen.getByText("Furniture")).toBeInTheDocument();
    expect(screen.queryByText("Other")).not.toBeInTheDocument();
    await screen.getByRole("button", { name: "Show all categories" }).click();
    expect(screen.getByText("Other")).toBeInTheDocument();
  });

  it("shows the concise empty category message when all category counts are zero", async () => {
    vi.mocked(apiRequest).mockImplementation(async () => ({
      totalUsers: 0,
      totalListings: 0,
      totalItemListings: 0,
      totalHouseRentalListings: 0,
      itemListingsByCategory: [
        { category: "ELECTRONICS", count: 0 },
        { category: "CLOTHING", count: 0 },
        { category: "FURNITURE", count: 0 },
        { category: "OTHER", count: 0 },
      ],
    }) as never);

    render(<AdminDashboardPage {...props} />);
    expect(await screen.findByText("No item listings yet")).toBeInTheDocument();
  });
});
