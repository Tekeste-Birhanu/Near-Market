# Product Requirements Document

## 1. Overview

- **Product:** Near Market
- **Summary:** A Telegram marketplace for people to post new and used goods and whole-house rentals. Buyers browse listings in a Telegram Mini App and contact sellers directly on Telegram; the marketplace does not handle the sale.
- **Target users:** Buyers and sellers.
- **Problem:** Provide a convenient way for buyers to discover listings, including where rental houses are located, and connect directly with sellers inside Telegram.

## 2. Goals and scope

- **Goals:**
  - Let buyers discover items and house rentals through separate searchable feeds within the Listings page.
  - Let sellers publish and manage listings without a pre-publication review.
  - Connect buyers to sellers through their Telegram usernames, with an optional phone number.
- **In-scope features:**
  - Telegram Mini App as the primary product surface, with **Items** and **House rentals** tabs within the Listings page. Each tab has its own recent-listings feed and search; listing details and seller profiles are also available.
  - The **Items** tab has the categories **Electronics**, **Clothing**, and **Other**. New/used condition is separate from item category. House rentals appear in their own tab, not as an item category.
  - Listing creation, editing, deletion, and seller-controlled availability/status updates.
  - Every page places the same English/Amharic and Light/Dark toggles at the top right. In the marketplace app, show Near Market branding on Listings only; in the Admin Mini App, show it on Dashboard only. Other pages use their own page titles. Default to English and Dark mode; persist both choices locally.
  - Admins can remove listings through a separate Admin Mini App launched by the admin bot.
  - Prohibited-listing rules, including a clear ban on all illegal listings such as drugs, are shown the first time a seller posts.
  - Free posting for v1.
- **Out of scope:**
  - A standalone marketplace website.
  - Marketplace-run payments, delivery, or transaction handling; buyer and seller arrange the sale directly.
  - Pre-publication listing review.
- **Constraints:** Every tool and hosted service used for the MVP must use a free tier.

## 3. User journeys

- **J-01 - Find a listing:** A buyer opens the Listings page in the Mini App, selects the Items or House rentals tab, browses its newest available listings or searches, applies relevant filters, opens a listing's details, and contacts its seller on Telegram or by optional phone.
- **J-02 - Post and manage a listing:** A seller taps **Post** in the main navigation, chooses Item or House rental, and completes the matching form. The seller provides listing details and at least one image, publishes immediately, and later edits, deletes, or updates availability/status.
- **J-03 - Explore a seller:** A buyer opens a seller profile from a listing and browses that seller's other available listings.

## 4. Functional requirements

| ID   | Requirement                                | Acceptance criteria                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Priority |
| ---- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| F-01 | Browse and search listings in the Mini App | Buyers can switch between Items and House rentals tabs within Listings. Each tab shows its own recent-listings feed, supports search, and opens listing details. Results default to newest first, can be sorted oldest first, and show available listings by default.                                                                                                                                                                                                                                                                                                                                      | Must     |
| F-02 | Filter listings                            | In the Items tab, buyers can filter by item category, condition, and price range in ETB. In the House rentals tab, buyers can filter by price range in ETB.                                                                                                                                                                                                                                                                                                                                                                                                  | Must     |
| F-03 | Create listings                            | The **Post** navigation item asks the seller to choose Item or House rental, then opens the matching form. Item listings include a seller-entered title, category (Electronics, Clothing, or Other), and condition (New or Used). House rental listings are for whole houses only, do not require a title, and require a seller-entered address shown in listing details. All listings include a description, price details, and at least one image (up to three); new listings are set to Available and sellers can later update availability. A seller may add an optional phone number to their profile; it is shown on their listing details. A Telegram username is required to post. | Must     |
| F-04 | Represent price                            | Prices are in ETB. Sellers can enter a price or select Contact for price. House rental prices are per month.                                                                                                                                                                                                                                                                                                                                                                                                                              | Must     |
| F-05 | Publish without pre-review                 | A successfully submitted listing appears immediately, without admin pre-approval.                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Must     |
| F-06 | Manage listings                            | Sellers can edit or delete their listings and mark goods sold or rentals unavailable. Sold and unavailable listings are excluded from the main feed by default, remain visible to the seller, and do not expire automatically.                                                                                                                                                                                                                                                                                                                                 | Must     |
| F-07 | Contact sellers                            | On a listing's details page, buyers can open the seller's Telegram account using the required username. If the seller supplied a phone number, buyers can view it there.                                                                                                                                                                                                                                                                                                                                                                                       | Must     |
| F-08 | View seller profiles                       | Buyers can open a seller profile and view that seller's other available listings. The profile name is used as the default marketplace display name; sellers can edit it later.                                                                                                                                                                                                                                                                                                                                                                                 | Must     |
| F-09 | Remove listings as an admin                | In the Admin Mini App, admins can browse, search, and filter retained listings in the same Items and House rentals tabs available to other users. Admins can inspect details and photos regardless of listing availability. Removal is offered from listing details only and requires confirmation; it deletes the listing and its photos. The Admin Mini App is launched by the separate admin bot and uses the shared backend. After deletion, the seller is notified on Telegram without a reason; notification failure does not restore the listing.                                                                                                                                                                                              | Must     |
| F-10 | Use English and Amharic                    | The interface defaults to English and offers an Amharic option. Listing text is entered by sellers; no translated duplicate listing fields are required.                                                                                                                                                                                                                                                                                                                                                                                                      | Must     |
| F-11 | Show prohibited-listing rules              | The first time a seller posts, clearly state that all illegal listings, including drugs, are not allowed. Do not require a separate acknowledgment checkbox.                                                                                                                                                                                                                                                                                                                                                                                                   | Must     |
| F-12 | View marketplace totals                    | The Admin Mini App shows the total of all registered users (buyers and sellers), total retained listings, retained item listings, and retained house rentals. It also shows retained item listing counts for Electronics, Clothing, and Other, ordered from highest count to lowest with alphabetical tie order. Listing totals include sold and unavailable listings; the category breakdown excludes house rentals. It is launched by the separate admin bot and uses the shared backend.                                                                                         | Should   |

- **Business rules:**
  - Posting is free in v1.
  - Condition and availability are separate fields. Goods use New/Used for condition and Available/Sold for availability. Whole-house rentals use Available/Unavailable for availability.
  - House rental prices are stated per month in ETB.
  - Listings do not expire automatically. Sellers maintain availability themselves.
  - Buyers and sellers arrange contact and transactions directly; the marketplace does not process the sale.

## 5. Quality requirements

- **Security and privacy:** Validate Telegram Mini App authentication data on the trusted server before accepting the Telegram identity or username for a listing. Show an optional phone number on the listing details page, not in the feed.
- **Reliability and recovery:** If a listing submission fails, preserve the seller's entered details where feasible and show a clear error so they can retry. (Detailed behavior to be designed.)
- **Other relevant needs:** Listings remain until sellers change their status, delete them, or an admin removes them.

## 6. Assumptions and open decisions

- **Assumptions:**
  - Sellers provide listing details in the language they choose; the interface itself supports Amharic and English.
  - A Telegram username is available and required for every seller who posts, so buyers have a direct contact path.
- **Dependencies / risks:**
  - With no pre-review and no automatic expiry, inaccurate or stale listings may remain visible until a seller or admin acts.
  - Telegram profile links based on user IDs can be constrained by Telegram privacy settings; v1 therefore requires a username for seller contact.
- **Open decisions:** Hosting provider selection is deferred until release readiness. Any selected hosting service must meet the free-tier constraint.

## 7. Definition of ready

- [ ] The problem, target users, and scope are clear enough to begin.
- [ ] Must-have requirements have testable acceptance criteria.
- [ ] Important business rules and permissions are defined or explicitly not applicable.
- [ ] Decisions that block the first implementation tasks are resolved; non-blocking questions are documented with a safe assumption or deferral.
- [ ] Relevant design and technical requirements are clear enough to proceed without consequential guesswork.
