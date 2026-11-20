import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProfilePage } from "../pages/ProfilePage";
import { clearStoredSession, saveSession, type Session, type SessionUser } from "../auth/session";
import { translate } from "../i18n/translations";

const user: SessionUser = {
  id: "user-1",
  telegramUsername: "hana",
  displayName: "Hana",
  phoneNumber: null,
  isAdmin: false,
};

const session: Session = {
  accessToken: "signed-test-token",
  expiresAt: "2099-01-01T00:00:00.000Z",
  user,
};

function renderProfile(onUserChange = vi.fn()) {
  return render(
    <ProfilePage
      theme="light"
      onThemeChange={vi.fn()}
      language="en"
      onLanguageChange={vi.fn()}
      user={user}
      onUserChange={onUserChange}
      t={translate("en")}
    />,
  );
}

afterEach(() => {
  clearStoredSession();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Profile settings", () => {
  it("loads profile data and saves display name and phone number", async () => {
    saveSession(session);
    const updatedUser = { ...user, displayName: "Hana Market", phoneNumber: "+251911234567" };
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/v1/me" && init?.method === "PATCH") return Promise.resolve(new Response(JSON.stringify(updatedUser), { status: 200 }));
      if (String(input) === "/api/v1/me") return Promise.resolve(new Response(JSON.stringify(user), { status: 200 }));
      if (String(input).startsWith("/api/v1/me/listings")) return Promise.resolve(new Response(JSON.stringify({ items: [], nextCursor: null }), { status: 200 }));
      return Promise.resolve(new Response("Not found", { status: 404 }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const onUserChange = vi.fn();
    const userAction = userEvent.setup();

    renderProfile(onUserChange);

    await userAction.click(screen.getByRole("button", { name: "Settings" }));

    const nameInput = await screen.findByRole("textbox", { name: "Display name" });
    expect(nameInput).toHaveValue("Hana");
    expect(screen.getByRole("textbox", { name: "Telegram username" })).toHaveValue("@hana");
    expect(screen.getByRole("textbox", { name: "Telegram username" })).toHaveAttribute("readonly");

    await userAction.clear(nameInput);
    await userAction.type(nameInput, "Hana Market");
    const phoneInput = screen.getByRole("textbox", { name: /Phone number/ });
    await userAction.type(phoneInput, "+251911234567");
    await userAction.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Profile updated.");
    const patchCall = fetchMock.mock.calls.find(([url, options]) => String(url) === "/api/v1/me" && options?.method === "PATCH");
    expect(patchCall?.[1]?.method).toBe("PATCH");
    expect(JSON.parse(patchCall?.[1]?.body as string)).toEqual({
      displayName: "Hana Market",
      phoneNumber: "+251911234567",
    });
    await waitFor(() => expect(onUserChange).toHaveBeenCalledWith(updatedUser));
  });

  it("sends null when the seller clears their phone number", async () => {
    saveSession({ ...session, user: { ...user, phoneNumber: "+251911234567" } });
    const userWithPhone = { ...user, phoneNumber: "+251911234567" };
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/v1/me" && init?.method === "PATCH") return Promise.resolve(new Response(JSON.stringify(user), { status: 200 }));
      if (String(input) === "/api/v1/me") return Promise.resolve(new Response(JSON.stringify(userWithPhone), { status: 200 }));
      if (String(input).startsWith("/api/v1/me/listings")) return Promise.resolve(new Response(JSON.stringify({ items: [], nextCursor: null }), { status: 200 }));
      return Promise.resolve(new Response("Not found", { status: 404 }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const userAction = userEvent.setup();

    renderProfile();

    await userAction.click(screen.getByRole("button", { name: "Settings" }));

    await screen.findByRole("textbox", { name: "Display name" });
    await userAction.clear(screen.getByRole("textbox", { name: /Phone number/ }));
    await userAction.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Profile updated.");
    const patchCall = fetchMock.mock.calls.find(([url, options]) => String(url) === "/api/v1/me" && options?.method === "PATCH");
    expect(JSON.parse(patchCall?.[1]?.body as string)).toEqual({
      displayName: "Hana",
      phoneNumber: null,
    });
  });
});
