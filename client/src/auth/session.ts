import { apiRequest } from "../api/client";

export interface SessionUser {
  id: string;
  telegramUsername: string | null;
  displayName: string;
  phoneNumber: string | null;
  isAdmin: boolean;
}

export interface Session {
  accessToken: string;
  expiresAt: string;
  user: SessionUser;
}

const SESSION_STORAGE_KEY = "near-market.session";

function isSession(value: unknown): value is Session {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Session>;
  return (
    typeof candidate.accessToken === "string" &&
    candidate.accessToken.length > 0 &&
    typeof candidate.expiresAt === "string" &&
    Number.isFinite(Date.parse(candidate.expiresAt)) &&
    Boolean(candidate.user) &&
    typeof candidate.user?.id === "string" &&
    (candidate.user.telegramUsername === null || typeof candidate.user.telegramUsername === "string") &&
    typeof candidate.user.displayName === "string" &&
    (candidate.user.phoneNumber === null || typeof candidate.user.phoneNumber === "string") &&
    typeof candidate.user.isAdmin === "boolean"
  );
}

export function getTelegramInitData(): string | null {
  const initData = window.Telegram?.WebApp?.initData;
  return typeof initData === "string" && initData.length > 0 ? initData : null;
}

export function readStoredSession(storage: Storage = window.sessionStorage): Session | null {
  const saved = storage.getItem(SESSION_STORAGE_KEY);
  if (!saved) return null;

  try {
    const session: unknown = JSON.parse(saved);
    if (!isSession(session) || Date.parse(session.expiresAt) <= Date.now()) {
      storage.removeItem(SESSION_STORAGE_KEY);
      return null;
    }
    return session;
  } catch {
    storage.removeItem(SESSION_STORAGE_KEY);
    return null;
  }
}

export function saveSession(session: Session, storage: Storage = window.sessionStorage): void {
  storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function clearStoredSession(storage: Storage = window.sessionStorage): void {
  storage.removeItem(SESSION_STORAGE_KEY);
}

export async function createSession(initData: string): Promise<Session> {
  const session = await apiRequest<Session>("/auth/session", {
    method: "POST",
    body: JSON.stringify({ initData }),
  }, { authenticated: false });

  if (!isSession(session)) {
    throw new Error("The server returned an invalid session.");
  }

  saveSession(session);
  return session;
}
