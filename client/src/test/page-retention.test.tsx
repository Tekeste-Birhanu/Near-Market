import { render, screen, waitFor } from "@testing-library/react";
import * as React from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DesignPreview } from "../App";
import { clearStoredSession, saveSession, type Session } from "../auth/session";
import { translate } from "../i18n/translations";
import type { MainPage } from "../components/SharedUI";

const session: Session = {
  accessToken: "test-token",
  expiresAt: "2099-01-01T00:00:00.000Z",
  user: { id: "user-1", telegramUsername: "seller", displayName: "Seller", phoneNumber: null, isAdmin: false },
};

function TestApp() {
  const [page, setPage] = useStateForTest();
  return <DesignPreview
    activePage={page}
    onPageChange={setPage}
    theme="dark"
    onThemeChange={vi.fn()}
    language="en"
    onLanguageChange={vi.fn()}
    user={session.user}
    onUserChange={vi.fn()}
    onListingPublished={vi.fn()}
    newListingId={null}
    onNewListingOpened={vi.fn()}
    postSuccessNotice=""
    t={translate("en")}
    previewMode={false}
    adminMode={false}
  />;
}

function useStateForTest(): [MainPage, (page: MainPage) => void] {
  // Keep the test harness's navigation state separate from DesignPreview.
  const [page, setPage] = React.useState<MainPage>("listings");
  return [page, setPage];
}

afterEach(() => {
  clearStoredSession();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("visited page mounting", () => {
  it("waits to request profile data until visited and preserves Listings state while hidden", async () => {
    saveSession(session);
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/me")) return Promise.resolve(new Response(JSON.stringify(session.user), { status: 200 }));
      return Promise.resolve(new Response(JSON.stringify({ items: [], nextCursor: null }), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<TestApp />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/v1/listings?type=ITEM&limit=20", expect.anything()));
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/me"))).toBe(false);

    const search = screen.getByRole("searchbox", { name: "Search listings" });
    await user.type(search, "phone");
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes("q=phone"))).toBe(true));

    await user.click(screen.getByRole("button", { name: "Profile" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/me"))).toBe(true));
    expect(search.closest("[hidden]")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Listings" }));
    expect(screen.getByRole("searchbox", { name: "Search listings" })).toHaveValue("phone");
    expect(screen.getByRole("searchbox", { name: "Search listings" }).closest("[hidden]")).not.toBeInTheDocument();
  });
});
