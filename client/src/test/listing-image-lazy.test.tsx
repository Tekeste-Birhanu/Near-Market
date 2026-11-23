import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearStoredSession, saveSession, type Session } from "../auth/session";
import { ListingImage } from "../components/ListingComponents";
import { translate } from "../i18n/translations";

const session: Session = {
  accessToken: "test-token",
  expiresAt: "2099-01-01T00:00:00.000Z",
  user: { id: "user-1", telegramUsername: "seller", displayName: "Seller", phoneNumber: null, isAdmin: false },
};

afterEach(() => {
  clearStoredSession();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ListingImage lazy loading", () => {
  it("defers the protected image request until its observer reports it near the viewport", async () => {
    saveSession(session);
    let notifyIntersection: IntersectionObserverCallback | undefined;
    let observedTarget: Element | undefined;
    let options: IntersectionObserverInit | undefined;
    class ControlledIntersectionObserver {
      constructor(callback: IntersectionObserverCallback, observerOptions?: IntersectionObserverInit) {
        notifyIntersection = callback;
        options = observerOptions;
      }
      observe(target: Element) { observedTarget = target; }
      disconnect() {}
      unobserve() {}
      takeRecords() { return []; }
    }
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Blob(["image-bytes"], { type: "image/webp" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("IntersectionObserver", ControlledIntersectionObserver);
    vi.stubGlobal("URL", { ...URL, createObjectURL: vi.fn(() => "blob:test-image"), revokeObjectURL: vi.fn() });

    render(<ListingImage url="/listings/listing-1/images/image-1" alt="Phone" className="photo" t={translate("en")} />);
    expect(screen.getByRole("img", { name: "Listing image unavailable" })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(options?.rootMargin).toBe("200px");
    expect(observedTarget).toBeInTheDocument();

    notifyIntersection?.([{ isIntersecting: true, target: observedTarget! } as IntersectionObserverEntry], {} as IntersectionObserver);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/v1/listings/listing-1/images/image-1", expect.anything()));
    expect(await screen.findByRole("img", { name: "Phone" })).toHaveAttribute("src", "blob:test-image");
  });
});
