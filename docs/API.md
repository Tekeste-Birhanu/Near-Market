# REST API Contract

## 1. Purpose and conventions

- **Base path:** `/api/v1`
- **Consumers:** Marketplace Mini App, Admin Mini App, and the shared Node.js service.
- **Format:** JSON for request and response data. Listing image uploads use `multipart/form-data`; image reads return image bytes.
- **Transport:** HTTPS outside local development.
- **Time and identifiers:** Timestamps are ISO 8601 UTC strings. Public resource IDs are UUIDs; Telegram user IDs are never returned to Mini App clients.
- **Money:** Prices are decimal ETB amounts. House rental prices are monthly. `priceAmount: null` means Contact for price; it is not the same as zero.
- **Unknown fields:** The server ignores no invalid fields silently; unsupported or malformed input returns a validation error.

All Mini App routes, including browse routes, require a valid Telegram-authenticated session. Browsing does not require a username. The first request exchanges Telegram Mini App `initData` for a short-lived application access token; the backend validates `initData` and creates or updates the registered user record. Do not send `initDataUnsafe` or accept identity, username, or admin status from ordinary request fields.

Authenticated requests use:

```http
Authorization: Bearer <access-token>
```

The token is issued by this API and is scoped to the authenticated Telegram user. Admin authorization is checked server-side on every admin route using the stored user role. Bot tokens remain server-side and are never exposed to either Mini App.

## 2. Authentication and profile

### `POST /auth/session`

Exchange validated Telegram Mini App `initData` for an API session. The body contains the raw `initData` string provided by Telegram Web Apps.

```json
{ "initData": "<Telegram.WebApp.initData>" }
```

**Success `200`:**

```json
{
  "accessToken": "<signed-bearer-token>",
  "expiresAt": "2026-01-01T12:00:00Z",
  "user": {
    "id": "uuid",
    "telegramUsername": "seller_name",
    "displayName": "Seller",
    "phoneNumber": null,
    "isAdmin": false
  }
}
```

The server validates the raw query string using Telegram's bot-token HMAC-SHA-256 procedure and `auth_date`; it accepts data no older than five minutes and allows up to 30 seconds of future clock skew. It tries the configured marketplace and admin bot tokens, so both Mini Apps use the same endpoint. It creates the user on first authenticated open, initializes `displayName` from Telegram `first_name` and optional `last_name`, and refreshes the Telegram username on later exchanges without overwriting the user's editable marketplace display name. A missing Telegram username does not prevent a session or browsing, but prevents listing creation with `403 USERNAME_REQUIRED`.

The API returns a signed bearer token that expires one hour after issuance. It is signed with the server-only `SESSION_SECRET`, which must contain at least 32 bytes. The token carries the internal user ID, issue and expiry times, and a random nonce; it contains no role claims. Admin status is read from the database and is never trusted from the token or client. Set `DATABASE_URL`, `SESSION_SECRET`, and at least one bot token to enable session creation. Without those settings, `POST /auth/session` returns `503 AUTHENTICATION_UNAVAILABLE`; the health endpoint remains available.

For initial admin provisioning, an operator may set `INITIAL_ADMIN_TELEGRAM_USER_ID` in the server environment to the intended administrator's numeric Telegram user ID. On that user's next successfully validated session, the server sets the stored role to admin. This setting never appears in API responses and does not revoke existing admins when removed or changed. To revoke the configured operator, remove or change the setting and then clear the stored role through a trusted database operation; leaving the same ID configured grants admin again at the next session. Do not put a real Telegram ID in committed examples or logs.

### `GET /me`

Return the authenticated user's current profile and role using the same `user` shape as the session response.

### `PATCH /me`

Update editable seller profile fields. At least one supported field is required.

```json
{ "displayName": "My marketplace name", "phoneNumber": "+2519..." }
```

`phoneNumber` may be `null` to clear it. The client cannot set Telegram identity, username, or `isAdmin`. The optional phone number belongs to the seller profile and is shared across the seller's listings; it is returned only on listing details.

`displayName` must contain 1–80 characters after trimming. `phoneNumber` must contain 1–32 characters after trimming, or be `null` to clear it. Empty strings and unsupported fields, including Telegram identity and admin fields, return `400 VALIDATION_ERROR`.

## 3. Listings

### Shared listing representation

```json
{
  "id": "uuid",
  "type": "ITEM",
  "title": "Phone",
  "description": "Seller-entered text",
  "category": "ELECTRONICS",
  "condition": "USED",
  "rentalAddress": null,
  "priceAmount": "12500.00",
  "status": "AVAILABLE",
  "images": [
    { "id": "uuid", "position": 1, "url": "/api/v1/listings/uuid/images/uuid" }
  ],
  "seller": {
    "id": "uuid",
    "displayName": "Seller",
    "telegramUsername": "seller_name",
    "phoneNumber": "+2519..."
  },
  "createdAt": "2026-01-01T12:00:00Z",
  "updatedAt": "2026-01-01T12:00:00Z"
}
```

`category` and `condition` are populated for items only; `rentalAddress` is populated for house rentals only. Listing feeds omit the seller's phone number; listing details include `seller.phoneNumber` when present. Public seller data never includes Telegram user IDs or admin fields.

### `GET /listings`

Browse the selected feed. This route returns available listings only and defaults to newest first.

| Query                  | Meaning                                                                                                                 |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `type`                 | Required: `ITEM` or `HOUSE_RENTAL`.                                                                                     |
| `sort`                 | Optional `NEWEST` or `OLDEST`; defaults to `NEWEST`. |
| `q`                    | Optional case-insensitive search over title and description; rental address is also searchable for house rentals. The value is trimmed and limited to 100 characters. |
| `category`             | Optional item category: `ELECTRONICS`, `CLOTHING`, or `OTHER`; only valid with `type=ITEM`.                             |
| `condition`            | Optional `NEW` or `USED`; only valid with `type=ITEM`.                                                                  |
| `minPrice`, `maxPrice` | Optional inclusive ETB price bounds with up to two decimal places. Contact-for-price listings have no numeric price and do not match a numeric bound. |
| `limit`                | Optional page size from 1 to 50, default 20.                                                                            |
| `cursor`               | Optional opaque cursor from the previous response.                                                                      |

**Success `200`:** `{ "items": [<listing-summary>], "nextCursor": "..." }`; each feed summary includes the first listing image, seller display name and Telegram username, and never the seller phone number. Results are ordered by `createdAt` and ID in the selected direction for stable pagination. `nextCursor` is opaque and is `null` when there are no more results. Invalid combinations, unknown query fields, or bounds return `400 VALIDATION_ERROR`.

### `GET /listings/{listingId}`

Return listing details, all ordered images, and seller profile including the seller's optional profile phone number for an available listing. The listing owner and an authorized admin may also retrieve retained listings regardless of availability so they can manage or review them. A different user opening a sold or unavailable listing through an old link receives `410 LISTING_UNAVAILABLE`; a deleted or unknown listing returns `404 NOT_FOUND`.

### `GET /listings/{listingId}/images/{imageId}`

Return the requested image bytes with the stored verified raster image media type (`image/webp`) and `X-Content-Type-Options: nosniff`. The image must belong to the specified listing. Public users can retrieve images for available listings; the listing owner and an authorized admin can also retrieve images for retained sold or unavailable listings. Return `404` if either ID is invalid or the listing is not visible to the caller.

### `POST /listings`

Create an item or house rental. Requires authentication and a current Telegram username from the stored user record. Submit `multipart/form-data` with listing fields and one to three `images` files (each at most 5 MB before processing). Accept JPEG, PNG, and non-animated WebP inputs up to 25 megapixels; do not trust the filename or client MIME header. The server applies orientation, resizes images to fit within 1600 × 1600 pixels, converts them to WebP, and writes the Available listing and all image rows in one database transaction. Unsupported fields, invalid images, or invalid type-specific combinations return `400 VALIDATION_ERROR` (invalid image bytes use `400 INVALID_IMAGE`); files over 5 MB return `413 PAYLOAD_TOO_LARGE`. A missing username returns `403 USERNAME_REQUIRED`. On success, return `201` and the created listing details.

Item fields:

```text
type=ITEM
title, description, category, condition, priceAmount
images=<file, repeated 1-3 times>
```

House rental fields:

```text
type=HOUSE_RENTAL
description, rentalAddress, priceAmount
images=<file, repeated 1-3 times>
```

House rental clients do not send a title. The server stores the required rental address in the response's `title` field for compatibility; clients display the localized House rental label and the address separately. Use an empty `priceAmount` to represent Contact for price. Otherwise price must be zero or greater. New listings are created with `status=AVAILABLE`; clients cannot choose another initial status. On success, return `201` and the created listing details.

### `GET /me/listings`

Return the authenticated seller's listings, including sold and unavailable listings, newest first. Supports `type`, `limit`, and `cursor` as in the public feed. This route does not return listings owned by other users.

### `PATCH /listings/{listingId}`

Update a listing owned by the authenticated user. Accept `multipart/form-data` with editable listing fields. Items require `title`; house rentals omit it and the server updates its internal compatibility value from `rentalAddress`. The listing type cannot be changed. If no `images` files are sent, keep existing images; if images are sent, replace the complete image set with one to three new files. Validate the full resulting listing before saving. Return `200` and the updated listing. Return `403 FORBIDDEN` for a listing owned by someone else.

### `PATCH /listings/{listingId}/status`

Change availability on a listing owned by the authenticated user:

```json
{ "status": "SOLD" }
```

Items accept `AVAILABLE` or `SOLD`; house rentals accept `AVAILABLE` or `UNAVAILABLE`. Return `200` and the updated listing. Invalid type/status combinations return `400 VALIDATION_ERROR`.

### `DELETE /listings/{listingId}`

Permanently delete an owned listing and its images. The client must ask for confirmation before calling this route. Return `204` on success. Return `403 FORBIDDEN` if the listing belongs to another user.

## 4. Seller profile

### `GET /sellers/{sellerId}`

Return the seller's public profile: `{ "id", "displayName", "telegramUsername" }`. Do not return the phone number on the standalone profile response.

### `GET /sellers/{sellerId}/listings`

Return that seller's available listings, newest first, using the standard `items` and `nextCursor` response. Optional `type` limits results to `ITEM` or `HOUSE_RENTAL`; if omitted, include both types. `limit` and `cursor` follow the feed rules. Listing summaries omit the seller's phone number.

## 5. Admin API

Dashboard metrics, listing review/removal, and user management routes. Verification status is tracked in `TASKS.md` T20–T23 and T26.

All `/admin` routes require a valid authenticated session and stored admin permission. A client-supplied role never grants access.

### `GET /admin/dashboard`

Return the MVP dashboard metrics:

```json
{
  "totalUsers": 120,
  "totalListings": 84,
  "totalItemListings": 55,
  "totalHouseRentalListings": 29,
  "itemListingsByCategory": [
    { "category": "ELECTRONICS", "count": 35 },
    { "category": "CLOTHING", "count": 20 },
    { "category": "OTHER", "count": 10 }
  ]
}
```

Count every registered user. Count all retained listings, including sold and unavailable listings; deleted/admin-removed listings are not counted. Return the item and house rental subtotals; they sum to `totalListings`. Return every item category with its retained item listing count, including zero counts. House rentals are excluded. Order categories by count descending and then category name ascending so ties are stable. When every category count is zero, the client shows an empty category message.

### `GET /admin/listings`

Search and browse all retained listings, including sold and unavailable, for admin review/removal. Supports `type`, `sort`, `q`, `category`, `condition`, `minPrice`, `maxPrice`, `limit`, and `cursor` with the same meanings as `GET /listings`. Category and condition filters apply only to `ITEM`; price filters apply to either type. Feed summaries include listing status, and results remain ordered newest-first by default.

### `GET /admin/listings/{listingId}`

Return a listing's details to an admin regardless of availability status, including seller contact details needed to identify the seller. This route remains unavailable to regular users.

### `GET /admin/listings/{listingId}/images/{imageId}`

Return the image bytes for a retained listing to an admin regardless of availability status. Validate both IDs and return `404` if the image or listing is absent. Responses use the stored image media type, set `X-Content-Type-Options: nosniff`, and use `Cache-Control: private, no-store`.

### `DELETE /admin/listings/{listingId}`

Permanently remove a listing and its images. After the database deletion succeeds, send the seller the agreed Telegram notice through the marketplace bot, without a reason; configure `MARKETPLACE_BOT_TOKEN` for notice delivery. If notification delivery fails or the token is not configured, keep the listing removed and return `204`; log only a generic delivery failure. Return `204` on successful removal. Unknown listings return `404`.

### `GET /admin/users`

Return a paginated list of all registered users, newest registered first.

**Query parameters:** `search` (string, up to 100 chars — matches display name or Telegram username, case-insensitive substring), `filter` (`all` | `active` | `blocked`, default `all`), `limit` (integer 1–50, default 20), `cursor` (opaque pagination token).

**Success `200`:**

```json
{
  "items": [
    {
      "id": "uuid",
      "displayName": "Seller Name",
      "telegramUsername": "seller_name",
      "isBlocked": false,
      "createdAt": "2026-01-01T10:00:00Z"
    }
  ],
  "nextCursor": "<opaque-string-or-null>"
}
```

Do not include `telegramUserId`, `phoneNumber`, `isAdmin`, or any other private fields in the response.

### `POST /admin/users/{userId}/block`

Block a user and permanently remove all of their listings and listing images in one atomic transaction. No notifications are sent to the blocked user or to buyers of removed listings. The admin's own account cannot be blocked.

Returns `204` on success. Returns `404` if the user does not exist. Returns `409 CANNOT_BLOCK_SELF` if the authenticated admin attempts to block themselves.

### `POST /admin/users/{userId}/unblock`

Restore access for a blocked user. Does not restore listings removed at block time.

Returns `204` on success. Returns `404` if the user does not exist.

## 6. Telegram bot integration

The implementation uses separate Telegraf bots for the marketplace and admin launch paths. Marketplace `/start` and `/app` commands check the sender's stored blocked status; blocked senders receive a suspension message in English and Amharic instead of the Mini App button. Other users receive the marketplace button. The admin bot's `/start` and `/app` commands return its Admin Mini App button. Bot updates are not Mini App REST endpoints. Bot tokens and Mini App URLs are server-side configuration. Development bot startup is opt-in and uses Telegraf's default long polling; production webhook or polling configuration is deferred with hosting in `ARCHITECTURE.md`.

The backend validates Telegram Mini App `initData` in `POST /auth/session`; Telegraf bot context is not a substitute for Mini App authentication. Admin access is based on the authenticated user's server-side `isAdmin` value.

## 7. Error format and status codes

Errors use one JSON shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request could not be accepted.",
    "fields": { "title": "Required" }
  }
}
```

`fields` is optional and contains safe, field-specific validation messages. Do not include tokens, raw `initData`, stack traces, database details, or private Telegram identifiers.

| HTTP status | Use                                                                                       |
| ----------- | ----------------------------------------------------------------------------------------- |
| `400`       | Malformed request, invalid enum, invalid filter combination, or field validation failure. |
| `401`       | Missing, invalid, or expired API access token; invalid Telegram `initData`.               |
| `403`       | Authenticated user lacks permission, lacks a Telegram username required to post (`USERNAME_REQUIRED`), or is blocked (`ACCOUNT_BLOCKED`). |
| `404`       | Resource does not exist or is not visible to this caller.                                 |
| `409`       | Conflict; for example, an admin attempting to block themselves (`CANNOT_BLOCK_SELF`).     |
| `410`       | Listing exists but is sold or unavailable to public view.                                 |
| `413`       | Request or image exceeds the allowed upload size.                                         |
| `429`       | Request rate limit exceeded; response includes `Retry-After` and rate limit headers.       |
| `503`       | Authentication cannot run because required server configuration is missing.                |
| `500`       | Unexpected server error; return a generic message and log details safely.                 |

## 8. Contract rules and deferred details

- Validate and normalize all request values on the server. Use parameterized database operations and enforce ownership/admin access on every protected operation.
- Public feeds include available listings only. Seller and admin views have the additional visibility defined above.
- Search and filters apply only to the selected listing type, matching the Mini App tabs.
- Do not expose Telegram user IDs, bot tokens, private profile data in feeds, or admin fields in public responses.
- The initial API rate limit is 100 requests per client IP per 60-second window, configurable with `RATE_LIMIT_MAX` and `RATE_LIMIT_WINDOW_MS`. The server returns `429 RATE_LIMIT_EXCEEDED` with `Retry-After` and rate-limit headers. Revisit the limits and trusted proxy configuration for the chosen production host before release.
- The exact Telegram webhook/polling configuration remains deferred until the server is hosted.

## 9. Alignment notes

- The optional phone number is stored on the seller profile, shared across that seller's listings, and returned only on listing details, consistent with the product requirement.
- Listing creation, editing, admin removal, user management (block/unblock), and the dashboard follow the shared schema and `APP_FLOW.md`. Buyer reporting is not included in the MVP API.
