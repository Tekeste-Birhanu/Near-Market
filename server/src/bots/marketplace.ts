import { Markup, Telegraf, type Context } from "telegraf";

export type BlockedUserLookup = (telegramUserId: string) => Promise<boolean>;

export function createMarketplaceBot(token: string, miniAppUrl: string, isBlocked?: BlockedUserLookup): Telegraf {
  const bot = new Telegraf(token);
  registerMarketplaceLaunchCommands(bot, miniAppUrl, isBlocked);
  bot.catch(() => {
    console.error("Marketplace bot update failed.");
  });

  return bot;
}

export function registerMarketplaceLaunchCommands(bot: Telegraf, miniAppUrl: string, isBlocked?: BlockedUserLookup): void {
  const launchApp = async (ctx: Context) => {
    const telegramUserId = ctx.from?.id;
    if (isBlocked && telegramUserId !== undefined && await isBlocked(String(telegramUserId))) {
      return ctx.reply("Your access to Near Market has been suspended. / ወደ ኒየር ማርኬት የሚያደርጉት መዳረሻ ታግዷል።");
    }
    return ctx.reply(
      "Welcome to Near Market. Browse items and house rentals, or post your own listing.",
      marketplaceLaunchKeyboard(miniAppUrl),
    );
  };

  bot.start(launchApp);
  bot.command("app", launchApp);
}

export function marketplaceLaunchKeyboard(miniAppUrl: string) {
  return Markup.inlineKeyboard([Markup.button.webApp("Open Near Market", miniAppUrl)]);
}
