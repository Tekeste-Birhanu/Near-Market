import { createApp } from "./app.ts";
import { ConfigurationError, loadConfig } from "./config.ts";
import { createDatabaseClient } from "./database.ts";
import { loadProjectEnv } from "./load-env.ts";
import { createPrismaUserRepository } from "./auth/user-repository.ts";
import { createMarketplaceBot } from "./bots/marketplace.ts";
import { createAdminBot } from "./bots/admin.ts";
import { createPrismaListingFeedRepository } from "./listings/feed-repository.ts";
import { createPrismaListingReadRepository } from "./listings/read-repository.ts";
import { createPrismaListingCreateRepository } from "./listings/create-repository.ts";
import { createPrismaListingLifecycleRepository } from "./listings/lifecycle-repository.ts";
import { createPrismaAdminDashboardRepository } from "./admin/dashboard-repository.ts";
import { createPrismaAdminListingRepository } from "./admin/listings-repository.ts";
import { createPrismaAdminUserRepository } from "./admin/users-repository.ts";
import { Telegraf } from "telegraf";

async function startServer(): Promise<void> {
  loadProjectEnv();
  const config = loadConfig();
  const prisma = config.databaseUrl ? createDatabaseClient(config.databaseUrl) : undefined;
  const listingFeedRepository = prisma ? createPrismaListingFeedRepository(prisma) : undefined;
  const app = createApp(config, {
    listingFeedRepository,
    listingReadRepository: prisma && listingFeedRepository
      ? createPrismaListingReadRepository(prisma, listingFeedRepository)
      : undefined,
    listingCreateRepository: prisma ? createPrismaListingCreateRepository(prisma) : undefined,
    listingLifecycleRepository: prisma ? createPrismaListingLifecycleRepository(prisma) : undefined,
    adminDashboardRepository: prisma ? createPrismaAdminDashboardRepository(prisma) : undefined,
    adminListingRepository: prisma ? createPrismaAdminListingRepository(prisma) : undefined,
    adminUserRepository: prisma ? createPrismaAdminUserRepository(prisma) : undefined,
    notifyListingSeller: config.marketplaceBotToken
      ? (telegramUserId) => new Telegraf(config.marketplaceBotToken!).telegram.sendMessage(
        telegramUserId,
        "One of your listings was removed by a Near Market administrator.",
      ).then(() => undefined)
      : undefined,
    auth: {
      sessionSecret: config.sessionSecret,
      userRepository: prisma
        ? createPrismaUserRepository(prisma, config.initialAdminTelegramUserId)
        : undefined,
      botTokens: [config.marketplaceBotToken, config.adminBotToken].filter(
        (token): token is string => Boolean(token),
      ),
    },
  });

  app.listen(config.port, () => {
    console.info(`API server listening on port ${config.port}`);
  });

  if (config.marketplaceBotEnabled && config.marketplaceBotToken && config.marketplaceMiniAppUrl) {
    const marketplaceBot = createMarketplaceBot(
      config.marketplaceBotToken,
      config.marketplaceMiniAppUrl,
      prisma ? async (telegramUserId) => Boolean(await prisma.user.findUnique({ where: { telegramUserId: BigInt(telegramUserId) }, select: { isBlocked: true } }).then((user) => user?.isBlocked)) : undefined,
    );
    process.once("SIGINT", () => marketplaceBot.stop("SIGINT"));
    process.once("SIGTERM", () => marketplaceBot.stop("SIGTERM"));
    void marketplaceBot.telegram.getMe()
      .then(({ username }) => {
        console.info(`Marketplace bot token loaded for @${username ?? "unknown"}.`);
        return marketplaceBot.launch();
      })
      .catch((error: unknown) => {
        const telegramError = error as {
          response?: { error_code?: number; description?: string };
          code?: string;
        };
        console.error("Marketplace bot failed to connect; API remains available.", {
          telegramCode: telegramError.response?.error_code,
          telegramDescription: telegramError.response?.description,
          networkCode: telegramError.code,
        });
      });
  }

  if (config.adminBotEnabled && config.adminBotToken && config.adminMiniAppUrl) {
    const adminBot = createAdminBot(config.adminBotToken, config.adminMiniAppUrl);
    process.once("SIGINT", () => adminBot.stop("SIGINT"));
    process.once("SIGTERM", () => adminBot.stop("SIGTERM"));
    void adminBot.telegram.getMe()
      .then(({ username }) => {
        console.info(`Admin bot token loaded for @${username ?? "unknown"}.`);
        return adminBot.launch();
      })
      .catch((error: unknown) => {
        const telegramError = error as {
          response?: { error_code?: number; description?: string };
          code?: string;
        };
        console.error("Admin bot failed to connect; API remains available.", {
          telegramCode: telegramError.response?.error_code,
          telegramDescription: telegramError.response?.description,
          networkCode: telegramError.code,
        });
      });
  }
}

startServer().catch((error: unknown) => {
  if (error instanceof ConfigurationError) {
    console.error(error.message);
  } else {
    console.error("Server startup failed.");
  }
  process.exitCode = 1;
});
