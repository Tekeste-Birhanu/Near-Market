# Near Market

Near Market is a Telegram Mini App marketplace for new and used items and whole-house rentals. Buyers browse listings and contact sellers directly on Telegram.

## Technology stack

- React, TypeScript, Vite, and Tailwind CSS
- Node.js, TypeScript, Express, and Telegraf
- PostgreSQL with Prisma ORM

## Documentation

- [Product requirements](docs/PRD.md)
- [Application flow](docs/APP_FLOW.md)
- [Design](docs/DESIGN.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Database schema](docs/SCHEMA.md)
- [API contract](docs/API.md)
- [Implementation tasks](docs/TASKS.md)

## Local API development

Install dependencies from the repository root with `npm install`, then copy `.env.example` to `.env`. Set `DATABASE_URL` to a local PostgreSQL database and `SESSION_SECRET` to at least 32 random bytes. To use Telegram session authentication, set a matching server-side bot token. The API can start without a bot token; only session creation requires one.

To run the marketplace bot, set `MARKETPLACE_BOT_ENABLED=true`, `MARKETPLACE_BOT_TOKEN`, and `MARKETPLACE_MINI_APP_URL` to an HTTPS URL reachable from Telegram. The bot's `/start` and `/app` commands show a button that opens that Mini App. Bot startup is disabled by default, so local API work does not contact Telegram.

To run the separate admin bot in development, set `ADMIN_BOT_ENABLED=true`, `ADMIN_BOT_TOKEN`, and `ADMIN_MINI_APP_URL` to an HTTPS URL reachable from Telegram. The admin URL should open the client with `?app=admin` (for example, `https://your-host.example/?app=admin`). Its `/start` and `/app` commands open the Admin Mini App. The bot uses the shared API and database; production webhook or polling setup remains deferred until hosting is selected.

Admin removal notices are sent with `MARKETPLACE_BOT_TOKEN`. Keep this token configured when admins can remove listings; the marketplace bot does not need to be started just to send these notices.

To provision the initial administrator, set `INITIAL_ADMIN_TELEGRAM_USER_ID` in the server's uncommitted `.env` to that operator's numeric Telegram user ID. On the next successful Telegram Mini App session for that ID, the server grants the database user admin access. Keep this value private and out of logs, screenshots, and committed files. Removing or changing the setting does not revoke an existing admin. To revoke this operator, first remove or change the setting, then set that user's `is_admin` field to `false` through a trusted database operation; otherwise the configured ID receives admin access again at the next session. Never grant admin access through a Mini App request.

Generate the Prisma Client and apply database migrations:

```sh
npm run db:generate --workspace=@near-market/server
npm run db:migrate --workspace=@near-market/server
npm run test:db --workspace=@near-market/server
```

Use a dedicated local test database for `test:db`; the integration tests roll back their changes. Run the API with `npm run dev --workspace=@near-market/server` and the Mini App client with `npm run dev --workspace=@near-market/client`. Vite proxies client `/api` requests to the local API at `http://localhost:3001`. The health endpoint is available at `http://localhost:3001/health`.

Run the non-database test suites with `npm test`. The server's database integration suite is excluded from that command; run it separately with `npm run test:db --workspace=@near-market/server` only after configuring a dedicated test database.
