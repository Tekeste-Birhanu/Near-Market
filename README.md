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

## Local development

**Requirements:** Node.js 22.6+, npm 10+, and PostgreSQL.

1. Install dependencies and create your local environment file:

   ```sh
   npm install
   cp .env.example .env
   ```

2. Set `DATABASE_URL` and a `SESSION_SECRET` of at least 32 bytes in `.env`. Configure a Telegram bot token if you need Mini App authentication.
3. Generate the Prisma client and apply migrations:

   ```sh
   npm run db:generate --workspace=@near-market/server
   npm run db:migrate --workspace=@near-market/server
   ```

4. Start the API and client in separate terminals:

   ```sh
   npm run dev --workspace=@near-market/server
   npm run dev --workspace=@near-market/client
   ```

The client runs on Vite and proxies `/api` requests to `http://localhost:3001`. Check API health at `http://localhost:3001/health`.

## Telegram and admin setup

Bot processes are off by default. To enable one, set its `*_BOT_ENABLED=true`, bot token, and Mini App URL in `.env`. Telegram requires an HTTPS URL reachable by Telegram. For the admin bot, the URL should open the client with `?app=admin`. Admin listing removal notices use `MARKETPLACE_BOT_TOKEN` even when the marketplace bot process is off.

To provision the first admin, set `INITIAL_ADMIN_TELEGRAM_USER_ID` to the operator's numeric Telegram ID. Admin access is granted on their next authenticated Mini App session. Keep the ID and bot tokens private. Changing or removing the setting does not revoke an existing admin; revoke access through a trusted database operation after changing the setting.

## Checks

Run client and server unit tests with `npm test`, type checks with `npm run typecheck`, and a production build with `npm run build`. Database integration tests are separate and require a dedicated test database:

```sh
npm run test:db --workspace=@near-market/server
```
