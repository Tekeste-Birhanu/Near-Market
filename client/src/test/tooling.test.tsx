import { render, screen } from "@testing-library/react";
import { App } from "../App";
import { describe, expect, it } from "vitest";

describe("Near Market client", () => {
  it("renders the local Listings design preview", async () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Near Market", level: 1 })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Near Market" })).toBeInTheDocument();
  });
});
