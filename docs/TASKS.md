# Implementation Tasks

Complete a task when its checkboxes are met. Tasks are listed in dependency order. Tests and checks belong with the feature they verify.

## M1 - Foundation and Telegram access

Set up the client, server, database, and Telegram access needed by the marketplace.

**T01 - Initialize the npm workspace**

- [x] Set up `client/` and `server/` workspaces, TypeScript defaults, scripts, `.gitignore`, and `.env.example`; use free tools/services for the MVP.
- [x] Add Tailwind CSS to the client using its Vite integration.
- [x] Configure Vitest, React Testing Library, and Supertest where applicable; install, type-check, test, and build successfully.

**T02 - Scaffold the React Mini App client**

- [x] Create the React + TypeScript + Vite client entry point.
- [x] Verify local startup, production build, and a basic render test.

**T03 - Scaffold the Express API server**

- [x] Create the Node.js + TypeScript + Express server, configuration loading, health endpoint, and centralized error handling.
- [x] Add API rate limiting with the standard `429` error response; settle and document limits before release.
- [x] Verify safe configuration errors and test the app with Supertest without opening a network port.

**T04 - Configure PostgreSQL and Prisma schema**

- [x] Implement the User, Listing, and ListingImage schema, enums, indexes, and constraints from `SCHEMA.md`; store compressed image bytes in PostgreSQL `bytea` with no external object storage.
- [x] Apply migrations to a clean local/test database; verify ownership, listing type/status, price, and image constraints.

**T05 - Implement Telegram Mini App authentication**

- [x] Validate raw Telegram `initData` in `POST /api/v1/auth/session`, upsert the user, set the initial display name from Telegram profile data, and issue the API access token from `API.md`.
- [x] Reject invalid or expired data; never trust client-supplied identity/admin fields or log secrets/raw authentication data.
- [x] Verify valid, tampered, expired, and username-less sessions with unit and Supertest tests.

**T06 - Add the marketplace Telegraf bot**

- [x] Configure the marketplace bot start/launch path to the Marketplace Mini App using a server-side token.
- [x] Allow local API work without a bot token; fail safely when bot startup is enabled with invalid configuration.
- [x] Test bot configuration without contacting Telegram.
- [ ] Verify the launch action with a reachable development Mini App URL; the last recorded Telegram check returned Cloudflare HTTP 502.

**T07 - Connect the client to Telegram authentication**

- [x] Send Telegram `initData` to the session endpoint and attach the returned token to API requests; never use `initDataUnsafe`.
- [x] Handle expired sessions and local development without weakening production validation; verify with client tests.

## M2 - Marketplace core

Build the shared Mini App experience: app shell and profile, browsing and contact, then posting and listing management.

### App shell and profile

**T08 - Build the Marketplace Mini App shell**

- [x] Add Listings, Post, and Profile navigation; show Items selected by default with House rentals as the other tab.
- [x] Localize all interface labels and messages in English and Amharic; default to English, show a persistent language toggle beside the theme toggle at the top right of every page, and save the choice locally.
- [x] Define shared Tailwind theme tokens for Near Market blue and light/dark surfaces; use the device system font, support narrow screens, and provide a persistent Light/Dark toggle at the top right of each page's own header. Keep app theme independent of Telegram's theme.

**T09 - Implement seller profile settings**

- [x] Implement authenticated `GET /me` and `PATCH /me` for display name and optional profile phone number.
- [x] Show a profile summary card above My listings with Items/Rentals tabs; allow tab taps and horizontal swipes from the tab row or listing content while preserving vertical scrolling. The card gear opens a separate Settings view, not a tab. Provide a visible My listings back control. Settings allows display-name edits, shows the Telegram username read-only, and allows an optional phone number.
- [x] Allow users to set, change, and clear their phone number.
- [x] Return the optional phone number to buyers only on listing details; keep it out of feeds and standalone seller profiles (implemented with T11).
- [x] Reject client attempts to change Telegram identity or admin role; verify API and UI behavior.

### Browse listings and contact sellers

**T10 - Implement listing read and search API**

- [x] Add available listing feeds with type-specific search (title/description and rental address), filters, selectable newest/oldest ordering, and cursor pagination.
- [x] Support item category, condition, and price filters; support rental price filters; reject invalid combinations.
- [x] Verify filters, visibility, newest/oldest ordering, cursor pagination in both directions, and errors with unit and Supertest tests.

**T11 - Implement listing details, images, and seller API**

- [x] Add listing details, image retrieval, seller profiles, and sellers' available-listings endpoints; let owners retrieve their retained listing details regardless of availability for management.
- [x] Allow public image reads only for available listings; allow the owner and admins to read images for retained listings regardless of status.
- [x] Return optional seller phone only on listing details; return unavailable to other users for sold/unavailable listings and not found for deleted records.
- [x] Verify image ownership, media type, visibility, and phone privacy with Supertest.

**T12 - Build item browsing UI**

- [x] Put search above the Items/House rentals tabs; switch listing types by tab or horizontal swipe while preserving vertical scroll; show inline filters only after Filter is tapped, and scope search/filters to Items.
- [x] Use vertically stacked compact cards with rounded subtle borders and no heavy shadows; place a square image about one-third width beside title/price, New/Used badge, and compact Contact/View details buttons side by side; aim to show three cards initially where screen size allows.
- [x] Make Contact open the seller's Telegram account and View details open the listing details.
- [x] Add loading, empty, error, and retry states; empty feeds include a Post action; verify with React Testing Library.

**T13 - Build house rental browsing UI**

- [x] Put search above the tabs; show inline price filters only after Filter is tapped, and scope search/filters to House rentals.
- [x] Use the same card layout as Items; show monthly ETB price and seller-entered address. Aim for three cards in the initial view where screen size allows.
- [x] Make Contact open the seller's Telegram account and View details open the listing details.
- [x] Add loading, empty, error, and retry states; empty feeds include a Post action; verify with React Testing Library.

**T14 - Build listing details, seller profile, and contact flows**

- [x] Show a large main photo first and allow swiping through up to three photos; show all listing details, including rental address, seller profile, and available seller listings.
- [x] Link to the seller's Telegram username and show optional phone only on details.
- [x] Restore the selected feed and position when returning from details; show the agreed unavailable message; verify navigation and contact behavior.

### Seller posting and listing management

**T15 - Implement posting entry, username gate, and rules notice**

- [x] Require a Telegram username before posting while keeping browsing available.
- [x] Before the first listing form, clearly say that all illegal listings, including drugs, are prohibited; do not require an acknowledgment checkbox. Remember the notice per authenticated user on the current device.
- [x] Add Item and House rental destinations from Post; leave the form contents to T17/T18 and verify the entry flow with UI tests.

**T16 - Implement listing creation and image validation API**

- [x] Add `POST /listings` with type-specific validation, current username enforcement, image validation/compression, and transactional persistence.
- [x] Accept one to three JPEG, PNG, or non-animated WebP images up to 5 MB each; reject invalid image data and type-specific field combinations; store resized WebP output.
- [x] Create listings as Available and publish immediately; posting is free. Accept zero-or-higher ETB price or Contact for price, and monthly rental prices; add no payment/checkout flow.
- [x] Verify validation, upload, transaction, and failure cases with unit and Supertest tests.

**T17 - Build item listing form and publish flow**

- [x] Add item title, description, category (Electronics, Clothing, Other), separate New/Used condition, ETB price or Contact for price, and one-to-three photo fields.
- [x] Validate required fields and at least one image before submission, show field errors beside inputs and loading/success feedback, and open details after success.
- [x] Keep seller-entered text in its original language without translated duplicate fields; use a scrollable form, photo thumbnails with remove controls, and place Publish at the end of the form; confirm before discarding unsaved changes.
- [x] Preserve form values after submission failure or interruption where feasible; verify required fields, image limits, success, and retry with React Testing Library.

**T18 - Build house rental form and publish flow**

- [x] Add whole-house-only description, required seller-entered address, monthly ETB price or Contact for price, and one-to-three photo fields; do not ask for a rental title.
- [x] Validate required fields and at least one image before submission, show field errors beside inputs and loading/success feedback, and open details after success.
- [x] Keep seller-entered text in its original language without translated duplicate fields; use a scrollable form, photo thumbnails with remove controls, and place Publish at the end of the form; confirm before discarding unsaved changes.
- [x] Verify title-free rental submissions, address-derived display, required fields, image limits, success, and retry with client and API tests.

**T19 - Implement My listings and listing lifecycle**

- [x] Add owner-scoped My listings, edit, availability status, and delete endpoints and UI.
- [x] Keep sold/unavailable listings visible to their owners, hide them from public feeds, enforce item Available/Sold and rental Available/Unavailable states, and never expire listings automatically.
- [x] Keep the existing photo set when no replacements are selected; when photos are changed, submit the complete replacement set with at least one and at most three images. Show photo thumbnails with remove controls; confirm deletion and remove listing images with the listing.
- [x] Verify ownership, status, edit, and delete behavior with API and UI tests.

## M3 - Admin dashboard and moderation

Add admin-only access, marketplace metrics, listing review, removal, seller notice, and user management.

**T20 - Establish trusted admin provisioning**

- [x] Add an operator-only method to grant the initial admin role; never allow Mini App requests to grant admin access.
- [x] Document the setup without committing Telegram IDs or secrets.
- [x] Verify regular users cannot elevate their role or access admin-only APIs.

**T21 - Build Admin Mini App entry and navigation**

- [x] Add admin authorization, Dashboard navigation, and the separate Telegraf admin bot launch action.
- [x] Give admins the shared Listings, Post, and Profile navigation plus Dashboard, opening on Dashboard; block non-admin access to admin screens/actions.
- [x] Keep the admin bot token server-side; defer production webhook/polling choice until hosting is selected.
- [x] Verify role provisioning, authorization, and admin bot command handlers with unit/API tests.
- [ ] Verify the launch action with a configured development bot.

**T22 - Implement admin dashboard metrics**

- [x] Add `/admin/dashboard` and cards for total users, total retained listings, item listings, house rentals, and item listing counts by category.
- [x] Count every registered user (buyers and sellers) and all retained listings, including sold/unavailable; split listing totals by type, count item categories only, and order category counts by count descending with alphabetical tie order.
- [x] Show the four summary metrics in separate cards and the category counts in a wider card.
- [x] Verify results, empty/tied data, admin authorization, and card rendering with tests.

**T23 - Implement admin listing review, removal, and seller notice**

- [x] Let admins browse/search the same Items and House rentals tabs within Listings as other users, with filters, and inspect retained listings and their images regardless of availability; deny these operations to non-admins.
- [x] Confirm removal, delete the listing and images, then send the seller notice through the marketplace bot without a reason.
- [x] Handle notification failures without restoring removed listings or logging private data.
- [x] Verify API authorization, removal, and mocked Telegram notification behavior; do not log private data.

**T24 - Cache listing images**

- [x] Reuse fetched image data across views and avoid duplicate requests.
- [x] Clear cached images when the session changes, and invalidate them when a listing is removed.
- [x] Keep the cache within a fixed memory limit.
- [x] Verify reuse, duplicate request handling, memory limits, invalidation, and clearing with tests.

**T25 - Load pages and images on demand**

- [x] Load each page the first time it is opened.
- [x] Preserve page state when navigating away and back.
- [x] Load listing images as they approach the visible area, with a fallback for browsers that lack the required observer.
- [x] Verify deferred page requests, state preservation, and deferred image requests with tests.

**T26 - Implement admin user management**

- [x] Add the blocked-user schema and migration; reject blocked users at session creation and on every authenticated API request.
- [x] Add admin-only user search and pagination, block, and unblock endpoints; blocking atomically marks the user and deletes their listings and images, prevents self-blocking, and sends no notifications.
- [x] Hide blocked users' listings and profiles from other users, and make the marketplace bot show blocked users a suspension message in English and Amharic.
- [x] Add the Admin Mini App Users tab with paginated user rows, debounced search, All / Active / Blocked filters, status, and confirmed block/unblock actions.
- [x] Verify blocked-user access, atomic block and unblock behavior, bot responses, user-list filtering and pagination, seller visibility, authorization, and core Users tab states with tests.
- [ ] Apply the migration to a clean database and verify the migrated schema.
## M4 - Release readiness

Verify complete journeys, review security and accessibility, and finalize release documentation.

**T27 - Verify end-to-end user journeys**

- [ ] Verify browse/contact, post/manage, admin dashboard, listing removal, user management (block/unblock), and seller notification for both listing types.
- [ ] Check loading, empty, validation, unavailable, unauthorized, and recoverable error states.
- [ ] Run configured test suites and record manual Telegram Mini App checks accurately.

**T28 - Review security, privacy, and accessibility**

- [ ] Verify server-side authentication, ownership, admin authorization, input validation, and image handling.
- [ ] Confirm phone numbers are absent from feeds/profile pages and secrets/raw `initData` are absent from logs.
- [ ] Check semantic labels, keyboard use, visible focus, descriptive alternative text for images, reduced motion, pressed/selected/disabled states, and contrast in both app themes.

**T29 - Finalize developer and release documentation**

- [ ] Add verified local setup, environment, test, migration, and run instructions to the README; keep the `docs/API.md` link.
- [ ] Confirm `.env.example` matches configuration and contains no secrets.
- [ ] Complete the release checklist; keep hosting deferred until a free-tier option is selected.

## Release checklist

- [ ] All Must requirements are implemented and verified.
- [ ] Configured tests, lint, type-check, and production builds pass; any unrun checks are reported.
- [ ] Authentication, authorization, validation, privacy, and error handling are reviewed.
- [ ] README and `.env.example` match the implementation.
- [ ] Hosting, migration, and rollback steps are addressed when a free-tier host is selected.
