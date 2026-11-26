import type { AuthUserRepository } from "../src/auth/user-repository.ts";

export function makeActiveAuthUserRepository(): AuthUserRepository {
  return {
    async upsertTelegramUser(user) {
      return { id: "dd7320bd-8c00-42da-9ee8-5fe6bcba7cf2", ...user, phoneNumber: null, isAdmin: false, isBlocked: false };
    },
    async getUserById(id) {
      return { id, telegramUsername: "test_user", displayName: "Test User", phoneNumber: null, isAdmin: false, isBlocked: false };
    },
    async updateProfile() {
      return null;
    },
  };
}
