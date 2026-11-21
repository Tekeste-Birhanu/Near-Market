import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../generated/prisma/client.ts";
import { createPrismaUserRepository } from "../src/auth/user-repository.ts";

const initialTelegramUserId = 456789012n;
const user = {
  id: "30f175ea-d21e-43df-a0f8-3a7d273acaa2",
  telegramUsername: "operator",
  displayName: "Operator",
  phoneNumber: null,
  isAdmin: true,
};

describe("trusted initial admin provisioning", () => {
  it("grants the configured Telegram identity admin status on create and subsequent session upsert", async () => {
    const upsert = vi.fn(async (_args: { create: Record<string, unknown>; update: Record<string, unknown> }) => user);
    const prisma = { user: { upsert } } as unknown as PrismaClient;
    const repository = createPrismaUserRepository(prisma, initialTelegramUserId);

    const result = await repository.upsertTelegramUser({
      telegramUserId: initialTelegramUserId,
      telegramUsername: "operator",
      displayName: "Operator",
    });

    expect(result.isAdmin).toBe(true);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ isAdmin: true }),
      update: expect.objectContaining({ isAdmin: true }),
    }));
  });

  it("does not set admin status for a different Telegram identity", async () => {
    const upsert = vi.fn(async (_args: { create: Record<string, unknown>; update: Record<string, unknown> }) => ({ ...user, isAdmin: false }));
    const prisma = { user: { upsert } } as unknown as PrismaClient;
    const repository = createPrismaUserRepository(prisma, initialTelegramUserId);

    await repository.upsertTelegramUser({
      telegramUserId: initialTelegramUserId + 1n,
      telegramUsername: "ordinary_user",
      displayName: "Ordinary User",
    });

    const args = upsert.mock.calls[0][0];
    expect(args.create).not.toHaveProperty("isAdmin");
    expect(args.update).not.toHaveProperty("isAdmin");
  });
});
