import type { PrismaClient } from "../../generated/prisma/client.ts";
import type { TelegramMiniAppUser } from "./telegram-init-data.ts";

export interface AuthenticatedUser {
  id: string;
  telegramUsername: string | null;
  displayName: string;
  phoneNumber: string | null;
  isAdmin: boolean;
}

export interface AuthUserRepository {
  upsertTelegramUser(user: TelegramMiniAppUser): Promise<AuthenticatedUser>;
  getUserById(userId: string): Promise<AuthenticatedUser | null>;
  updateProfile(userId: string, profile: { displayName?: string; phoneNumber?: string | null }): Promise<AuthenticatedUser | null>;
}

export function createPrismaUserRepository(
  prisma: PrismaClient,
  initialAdminTelegramUserId?: bigint,
): AuthUserRepository {
  return {
    async upsertTelegramUser(telegramUser) {
      const user = await prisma.user.upsert({
        where: { telegramUserId: telegramUser.telegramUserId },
        create: {
          telegramUserId: telegramUser.telegramUserId,
          telegramUsername: telegramUser.telegramUsername,
          displayName: telegramUser.displayName,
          ...(telegramUser.telegramUserId === initialAdminTelegramUserId ? { isAdmin: true } : {}),
        },
        update: {
          telegramUsername: telegramUser.telegramUsername,
          ...(telegramUser.telegramUserId === initialAdminTelegramUserId ? { isAdmin: true } : {}),
        },
        select: {
          id: true,
          telegramUsername: true,
          displayName: true,
          phoneNumber: true,
          isAdmin: true,
        },
      });

      return user;
    },
    async getUserById(userId) {
      return prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, telegramUsername: true, displayName: true, phoneNumber: true, isAdmin: true },
      });
    },
    async updateProfile(userId, profile) {
      try {
        return await prisma.user.update({
          where: { id: userId },
          data: profile,
          select: { id: true, telegramUsername: true, displayName: true, phoneNumber: true, isAdmin: true },
        });
      } catch (error) {
        if (typeof error === "object" && error !== null && "code" in error && error.code === "P2025") return null;
        throw error;
      }
    },
  };
}
