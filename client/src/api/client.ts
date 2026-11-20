import { clearStoredSession, readStoredSession } from "../auth/session";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") || "/api/v1";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
  options: { authenticated?: boolean } = {},
): Promise<T> {
  const authenticated = options.authenticated ?? true;
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  if (authenticated) {
    const session = readStoredSession();
    if (!session) throw new ApiError("Your session has expired. Reopen the Mini App in Telegram.", 401);
    headers.set("Authorization", `Bearer ${session.accessToken}`);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  } catch {
    throw new ApiError("Could not reach Near Market. Check your connection and try again.", 0);
  }

  if (response.status === 401 && authenticated) {
    clearStoredSession();
    throw new ApiError("Your session expired. Reopen the Mini App in Telegram to sign in again.", 401);
  }

  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    const error = payload && typeof payload === "object" && "error" in payload
      ? (payload as { error?: { message?: unknown; code?: unknown } }).error
      : undefined;
    const contentType = response.headers.get("content-type")?.split(";")[0] || "unknown content type";
    const message = typeof error?.message === "string"
      ? error.message
      : `Unexpected server response (HTTP ${response.status}, ${contentType}).`;
    const code = typeof error?.code === "string" ? error.code : undefined;
    throw new ApiError(message, response.status, code);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function apiImageRequest(path: string): Promise<Blob> {
  const session = readStoredSession();
  if (!session) throw new ApiError("Your session has expired. Reopen the Mini App in Telegram.", 401);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });
  } catch {
    throw new ApiError("Could not reach Near Market. Check your connection and try again.", 0);
  }

  if (response.status === 401) {
    clearStoredSession();
    throw new ApiError("Your session expired. Reopen the Mini App in Telegram to sign in again.", 401);
  }
  if (!response.ok) throw new ApiError("The listing image could not be loaded.", response.status);
  return response.blob();
}
