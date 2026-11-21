import { Markup, Telegraf, type Context } from "telegraf";

export function createAdminBot(token: string, miniAppUrl: string): Telegraf {
  const bot = new Telegraf(token);
  registerAdminLaunchCommands(bot, miniAppUrl);
  bot.catch(() => console.error("Admin bot update failed."));
  return bot;
}

export function registerAdminLaunchCommands(bot: Telegraf, miniAppUrl: string): void {
  const launchApp = (ctx: Context) => ctx.reply(
    "Near Market administration. Open the Admin Mini App to review marketplace activity.",
    adminLaunchKeyboard(miniAppUrl),
  );
  bot.start(launchApp);
  bot.command("app", launchApp);
}

export function adminLaunchKeyboard(miniAppUrl: string) {
  return Markup.inlineKeyboard([Markup.button.webApp("Open Admin Dashboard", miniAppUrl)]);
}
