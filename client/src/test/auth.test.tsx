import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "../api/client";
import { App } from "../App";
import { clearStoredSession, saveSession, type Session } from "../auth/session";

const testSession: Session = {
  accessToken: "signed-test-token",
  expiresAt: "2099-01-01T00:00:00.000Z",
  user: {
    id: "user-1",
    telegramUsername: "hana",
    displayName: "Hana",
    phoneNumber: null,
    isAdmin: false,
  },
};

afterEach(() => {
  clearStoredSession();
  Reflect.deleteProperty(window, "Telegram");
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Telegram client authentication", () => {
  it("exchanges only Telegram WebApp.initData and saves the returned token", async () => {
    window.Telegram = { WebApp: { initData: "signed-telegram-init-data" } };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(testSession), { status: 200 }))
      .mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ items: [], nextCursor: null }), { status: 200 })));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Near Market" })).toBeInTheDocument();
    await screen.findByText("No listings found");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/auth/session");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({
      initData: "signed-telegram-init-data",
    });

    await apiRequest("/me");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1][0]).toBe("/api/v1/listings?type=ITEM&limit=20");
    expect(fetchMock.mock.calls[1][1].headers.get("Authorization")).toBe("Bearer signed-test-token");
    expect(fetchMock.mock.calls[2][1].headers.get("Authorization")).toBe("Bearer signed-test-token");
  });

  it("refreshes an unexpired session from current Telegram initData", async () => {
    window.Telegram = { WebApp: { initData: "current-telegram-init-data" } };
    saveSession(testSession);
    const refreshedSession = { ...testSession, user: { ...testSession.user, telegramUsername: "updated_hana" } };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(refreshedSession), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [], nextCursor: null }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Near Market" })).toBeInTheDocument();
    expect(await screen.findByText("No listings found")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/auth/session");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({ initData: "current-telegram-init-data" });
    expect(JSON.parse(sessionStorage.getItem("near-market.session") as string).user.telegramUsername).toBe("updated_hana");
    expect(fetchMock.mock.calls[1][0]).toBe("/api/v1/listings?type=ITEM&limit=20");
  });

  it("exchanges initData again when the cached session has expired", async () => {
    window.Telegram = { WebApp: { initData: "fresh-telegram-init-data" } };
    saveSession({ ...testSession, expiresAt: "2000-01-01T00:00:00.000Z" });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(testSession), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Near Market" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({
      initData: "fresh-telegram-init-data",
    });
  });

  it("shows the safe server reason when Telegram sign-in fails", async () => {
    window.Telegram = { WebApp: { initData: "signed-telegram-init-data" } };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { code: "AUTHENTICATION_UNAVAILABLE", message: "Authentication is not configured." },
    }), { status: 503 })));

    render(<App />);

    expect(await screen.findByText("Could not sign in. Reopen the Mini App in Telegram and try again.")).toBeInTheDocument();
    expect(screen.getByText("Authentication is not configured.")).toBeInTheDocument();
  });

  it("shows response status and content type for non-API sign-in responses", async () => {
    window.Telegram = { WebApp: { initData: "signed-telegram-init-data" } };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Not found", {
      status: 404,
      headers: { "Content-Type": "text/html" },
    })));

    render(<App />);

    expect(await screen.findByText("Unexpected server response (HTTP 404, text/html)." )).toBeInTheDocument();
  });

  it("clears an expired API session after the server rejects its bearer token", async () => {
    saveSession(testSession);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } }), { status: 401 }),
    ));

    await expect(apiRequest("/me")).rejects.toMatchObject({ status: 401 });
    expect(sessionStorage.getItem("near-market.session")).toBeNull();
  });

  it("shows a local visual preview without creating an unauthenticated session outside Telegram", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Near Market" })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
