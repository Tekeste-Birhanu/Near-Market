import { createHmac, timingSafeEqual } from "node:crypto";

export const TELEGRAM_INIT_DATA_MAX_AGE_SECONDS = 5 * 60;
const FUTURE_CLOCK_SKEW_SECONDS = 30;
const MAX_INIT_DATA_LENGTH = 16_384;

export interface TelegramMiniAppUser {
  telegramUserId: bigint;
  telegramUsername: string | null;
  displayName: string;
}

export type TelegramInitDataFailureReason =
  | "MALFORMED_DATA"
  | "INVALID_SIGNATURE"
  | "INVALID_AUTH_DATE"
  | "EXPIRED_AUTH_DATE"
  | "INVALID_USER";

export type TelegramInitDataValidation =
  | { user: TelegramMiniAppUser }
  | { reason: TelegramInitDataFailureReason; ageSeconds?: number };

function safeHexEqual(left: string, right: string): boolean {
  if (!/^[a-f\d]{64}$/i.test(left) || !/^[a-f\d]{64}$/i.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

function validUserJson(value: string): TelegramMiniAppUser | undefined {
  let user: unknown;
  try {
    user = JSON.parse(value);
  } catch {
    return undefined;
  }
  if (!user || typeof user !== "object") return undefined;

  const record = user as Record<string, unknown>;
  if (!Number.isSafeInteger(record.id) || typeof record.id !== "number" || record.id <= 0) {
    return undefined;
  }
  if (typeof record.first_name !== "string") return undefined;
  if (record.last_name !== undefined && typeof record.last_name !== "string") return undefined;
  if (record.username !== undefined && typeof record.username !== "string") return undefined;

  const displayName = [record.first_name, record.last_name]
    .filter((part): part is string => typeof part === "string")
    .join(" ")
    .trim();
  if (!displayName) return undefined;

  const username = typeof record.username === "string" ? record.username.trim() : "";
  return {
    telegramUserId: BigInt(record.id),
    telegramUsername: username || null,
    displayName,
  };
}

export function validateTelegramInitDataDetailed(
  rawInitData: string,
  botTokens: readonly string[],
  nowMs = Date.now(),
): TelegramInitDataValidation {
  if (!rawInitData || rawInitData.length > MAX_INIT_DATA_LENGTH || botTokens.length === 0) {
    return { reason: "MALFORMED_DATA" };
  }

  const params = new URLSearchParams(rawInitData);
  const entries = [...params.entries()];
  if (entries.length === 0 || new Set(entries.map(([key]) => key)).size !== entries.length) {
    return { reason: "MALFORMED_DATA" };
  }

  const receivedHash = params.get("hash");
  if (!receivedHash || !/^[a-f\d]{64}$/i.test(receivedHash)) {
    return { reason: "MALFORMED_DATA" };
  }

  const dataCheckString = entries
    .filter(([key]) => key !== "hash")
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  let signatureValid = false;
  for (const botToken of botTokens) {
    const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
    const calculatedHash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
    signatureValid = safeHexEqual(calculatedHash, receivedHash) || signatureValid;
  }
  if (!signatureValid) return { reason: "INVALID_SIGNATURE" };

  const authDateRaw = params.get("auth_date");
  if (!authDateRaw || !/^\d+$/.test(authDateRaw)) {
    return { reason: "INVALID_AUTH_DATE" };
  }
  const authDate = Number(authDateRaw);
  const nowSeconds = Math.floor(nowMs / 1000);
  if (!Number.isSafeInteger(authDate) || authDate > nowSeconds + FUTURE_CLOCK_SKEW_SECONDS) {
    return { reason: "INVALID_AUTH_DATE" };
  }
  const ageSeconds = nowSeconds - authDate;
  if (ageSeconds > TELEGRAM_INIT_DATA_MAX_AGE_SECONDS) {
    return { reason: "EXPIRED_AUTH_DATE", ageSeconds };
  }

  const userJson = params.get("user");
  const user = userJson ? validUserJson(userJson) : undefined;
  if (!user) return { reason: "INVALID_USER", ageSeconds };
  return { user };
}

export function validateTelegramInitData(
  rawInitData: string,
  botTokens: readonly string[],
  nowMs = Date.now(),
): TelegramMiniAppUser | undefined {
  const result = validateTelegramInitDataDetailed(rawInitData, botTokens, nowMs);
  return "user" in result ? result.user : undefined;
}
