# Design and UX Specification

## 1. Design direction
- **Product feel:** Familiar and easy to use inside Telegram, with a distinct Near Market identity.
- **Appearance controls:** Reuse the same English/Amharic and Light/Dark toggles at the top right on every page. In the marketplace app, show Near Market branding on Listings only; other pages use their own page titles. In the Admin Mini App, show Near Market branding on Dashboard only; Listings, Post, and Profile use their own page titles. Default to English and Dark mode; persist both choices locally. Do not use Telegram's active theme as the default or override the user's selection.
- **Primary audience:** Buyers and sellers browsing and posting items or whole-house rentals, plus admins using the Admin Mini App.
- **Design priorities:** Make listings easy to scan, keep prices and contact actions clear, and keep posting straightforward on mobile.

## 2. Design principles
- Keep browsing focused: show the information buyers need to decide whether to open a listing.
- Use consistent layouts for item and house rental listings while showing only relevant details for each type.
- Make primary actions easy to find without crowding the screen.
- Use the device system font so Amharic and English render naturally across supported devices.

## 3. Visual foundations
- **Typography:** Use the device system font consistently, including its Amharic and English support. Use a compact mobile scale: page-title headers 16px, section headings and detail titles 16px, listing titles 13px, listing prices 15px, detail prices 18px, body and form text 14px, and supporting text 10–13px. Use weight and contrast for emphasis rather than oversized text.
- **Color:** Use the Near Market neutral and blue tokens below consistently. The app background surrounds each page; page backgrounds sit behind page content; cards and controls use the surface tokens. Use primary text for headings and values, secondary text for form labels and meaningful supporting details, and muted text for hints, counts, loading messages, and minor metadata. Use blue accent text on soft blue surfaces for selected states, and white text on primary blue actions. Keep success green reserved for success feedback.

| Token role | Light mode | Dark mode |
| --- | --- | --- |
| Page background | `#F0EFEC` | `#10110F` |
| App background | `#F8F7F4` | `#151613` |
| Cards and controls | `#FFFFFF` | `#1D1F1B` |
| Subtle surface | `#F1F0ED` | `#232520` |
| Raised surface | `#FFFFFF` | `#272A24` |
| Primary text | `#1D1D1A` | `#F2F2ED` |
| Secondary text | `#4B4C46` | `#C9CBC3` |
| Muted text | `#777A72` | `#91958B` |
| Default border | `#E2E0DA` | `#2D302A` |
| Strong border | `#D5D2CA` | `#3A3E36` |
| Primary blue | `#1686C8` | `#238BC6` |
| Blue hover | `#1178B5` | `#2E9BD7` |
| Soft blue background | `#E8F3FA` | `#1D303B` |
| Blue accent text | `#0C72AD` | `#5EB6E7` |
| Text on blue | `#FFFFFF` | `#FFFFFF` |

Use a shared card surface with a consistent radius, border, and background throughout the app; vary padding and layout to fit each card's content. Reserve strong borders for emphasized edges and focus states. Keep page and app backgrounds close in tone so their separation stays subtle. Maintain readable contrast in both themes. Use primary text for headings and values, secondary text for form labels and meaningful supporting details, and muted text for hints, counts, loading messages, and minor metadata.
- **Spacing:** Keep cards and forms comfortable to use while fitting three listing cards in the initial screen view where the device size allows.
- **Shape and elevation:** Use the shared rounded card surface for listing cards, filters, and form sections. Use spacing to separate the brand, search, and tabs. Give the brand row a very subtle background tint to distinguish it without adding a divider. Reserve stronger borders for interactive controls; keep full-width dividers subtle. Avoid relying on shadows to separate cards.
- **Icons and imagery:** Use clear listing photos and recognizable icons. Listing-card images are square and occupy about one-third of the card width.
- **Responsive behavior:** Design for narrow Telegram Mini App screens first. Keep card text and actions legible on small screens and adapt spacing without changing the item/rental layout pattern.

## 4. Components and patterns

| Component / pattern | Purpose | Relevant behavior / variants |
|---|---|---|
| Bottom navigation | Move between main areas of the Mini App. | Show an icon and label for Listings, Post, and Profile. The Admin Mini App also has Dashboard and Users (order: Dashboard · Users · Listings · Post · Profile). |
| Listing type tabs | Switch between Items and House rentals within Listings. | Place a simple tab bar outside and below the branding/search card, with a clear gap. Keep it on the page background without a separate card. Items is selected by default. Search applies only to the selected tab and sits above the tabs. Show a faint baseline across the row and an active underline spanning the selected tab segment; color the selected label blue. Allow horizontal swipes on listing content to switch tabs without interrupting vertical scrolling or controls. |
| Search and filters | Find listings in the selected listing type. | Keep filters hidden until Filter is tapped; show controls inline on Listings. Use app-styled, keyboard-accessible dropdowns. Include Clear filters to reset visible filter values without closing the panel or clearing search. |
| Appearance controls | Keep app language and theme settings consistent across pages. | Reuse the same 36px English/Amharic and Light/Dark toggles at the top right of every page. Keep page headers 64px tall, with 20px horizontal insets and the same safe-area top inset. On non-brand page headers, pair a 36px soft-accent icon tile with a 16px bold page title. Set a consistent 16px gap between the header and the first content block on every page. In the marketplace app, show Near Market branding on Listings only; in the Admin Mini App, show it on Dashboard only. Other pages show their own title. Default to English and Dark mode; persist both choices locally. The app theme is independent of Telegram's theme. |
| Profile card | Identify the signed-in seller and provide a Settings shortcut. | Show the seller's display name and Telegram username when available, plus a gear button. The gear opens a separate Settings view; it is not a Profile tab. |
| Listing card | Summarize a listing in the feed. | Stack cards vertically. Use a square image at about one-third width, with a compact heading, prominent price, and a compact Contact button beside a compact View details button. Item cards show their seller-entered title and New or Used. Rental cards use the localized House rental label as the heading and show the seller-entered address. Use the same layout for both listing types. |
| Photo gallery | Display listing photos on the details page. | Show a large main photo at the top and allow swiping through up to three photos. |
| Listing form | Create or edit a listing. | Use one scrollable form for each listing type. Show uploaded photos as thumbnails with a remove control. Place Discard draft and Publish at the end of the form, with enough bottom spacing to clear the fixed navigation. |
| Dashboard metric card | Present admin marketplace totals and the item category mix. | Show total users, total retained listings, item listings, and house rentals in separate summary cards. Use a wider card with Electronics, Clothing, and Other counts in descending count order and alphabetical tie order. Include sold and unavailable listings; exclude house rentals from the category breakdown. |

## 5. Screen-specific guidance

### Listings
- **Purpose:** Browse and search items or whole-house rentals.
- **Layout and hierarchy:** Put the Listings brand and top-right appearance toggles in a full-width brand row with no outer margin. Group Search/Filter and the Items/House rentals tabs below it on the page background, without a broad toolbar surface or separate tab card. Keep Search/Filter above the tabs and retain distinct borders on the search field and Filter button. Show filters inline only after Filter is tapped. Let the selected tab identify the feed; do not repeat its name as a heading. Show listing count and an interactive newest/oldest sort control in one row, then use vertically stacked compact listing cards; aim to show three cards in the initial view where screen size permits.
- **Primary action:** Each card has compact Contact and View details buttons side by side. Contact opens the seller's Telegram account.
- **Visual details:** Keep the price most prominent. Show New/Used on item cards and the seller-entered address on rental cards. Use a simple empty message with a Post button when the selected tab has no listings.
- **Related flow:** J-01 in `APP_FLOW.md`.

### Listing details
- **Purpose:** Let buyers review a listing and choose how to contact its seller.
- **Layout and hierarchy:** Show a large photo at the top, followed by listing information and contact options. Allow buyers to swipe through up to three photos.
- **Visual details:** Keep price easy to find. Show optional phone contact here, along with the Telegram contact action; do not put the phone number in the feed.
- **Related flow:** J-01 in `APP_FLOW.md`.

### Profile and Settings
- **Purpose:** Let sellers manage their own listings and profile details.
- **Layout and hierarchy:** Show the Profile page title and shared appearance controls, then a compact profile card with the seller's display name, Telegram username, and gear button. Below it, show My listings with Items and Rentals tabs. Switch these tabs by tapping or swiping horizontally from the tab row or listing content; preserve vertical scrolling and do not capture gestures that begin on other controls. The gear opens a separate Settings view while retaining the profile card; Settings is not a tab. Provide a visible My listings back control in Settings; the gear also returns to My listings.
- **Settings fields:** Allow the seller to edit their marketplace display name, show their Telegram username read-only, and add or clear an optional phone number.
- **Related flow:** J-03 in `APP_FLOW.md`.

### Item and house rental forms
- **Purpose:** Let sellers enter the details for the selected listing type.
- **Layout and hierarchy:** Use one scrollable page per form, grouped into distinct Details, Price, and Photos cards. Give each card a concise heading and consistent internal spacing. Place Discard draft and Publish at the end of the form, with enough bottom spacing to clear the fixed navigation. Display selected photos as thumbnails with a remove control and show the current photo count out of three.
- **Form spacing:** Keep 8px between a field label and its control, including the Price label and its pricing choices, and 12px between field groups. Use these same gaps in the item, rental, listing-edit, and profile-settings forms.
- **Type-specific fields:** Ask for a seller-entered title on item forms only. House rental forms do not have a title field; use the localized House rental label in the UI and show the required seller-entered address as the rental's identifying detail.
- **Text areas:** Keep description and house address boxes at a fixed height; users can scroll within them but cannot resize them.
- **Form controls:** Use app-styled, keyboard-accessible dropdowns for item category and radio buttons for the two condition choices (New and Used). For pricing, use mutually exclusive “Set a price” and “Contact for price” radio choices. Show the amount only with “Set a price” selected. Avoid browser-native selectors.
- **Related flow:** J-02 and J-03 in `APP_FLOW.md`.

### Post entry
- **Purpose:** Let sellers choose which type of listing to create.
- **Layout and hierarchy:** Keep the Post page title and shared appearance controls at the top; do not show the Near Market brand or extra subtitles here. Stack two compact, full-width choice cards vertically on mobile.
- **Choice cards:** Use a cube icon and concise action title for items, and a house icon and concise action title for whole-house rentals; include a trailing chevron. Use soft blue for the item icon tile and green for the house icon tile. Selecting either card opens its matching form.
- **Related flow:** J-02 in `APP_FLOW.md`.

### Admin dashboard
- **Purpose:** Give admins a quick view of marketplace totals.
- **Layout and hierarchy:** Present total users, total retained listings, item listings, and house rentals in compact cards. Show item listing counts for Electronics, Clothing, and Other in a wider card, ordered by count descending with alphabetical tie order. If all category counts are zero, show a concise empty message. If the category list grows beyond three rows, initially show three rows with a Show all categories control to expand it. Item and rental totals include sold and unavailable listings and sum to total listings.
- **Related flow:** J-04 in `APP_FLOW.md`.

### Admin listing review
- **Purpose:** Let admins inspect retained listings and remove prohibited or otherwise unsuitable listings.
- **Layout and behavior:** Reuse the Items and House rentals tabs, search, filters, and listing cards from Listings. Admin results include sold and unavailable listings. Details show the listing status and photos; provide a destructive Remove listing action with a confirmation that explains the seller will be notified.
- **Related flow:** J-04 in `APP_FLOW.md`.

### Admin user management
- **Purpose:** Let the admin view all registered users and control their access.
- **Layout and hierarchy:** Show the Users page title and shared appearance controls at the top. Below them, show the full-width search field using the shared Listings search style, then All / Active / Blocked filter pills on the next row. Show a compact, paginated list of users below; each row shows the display name, Telegram username (or a placeholder when absent), joined date, and an Active or Blocked status badge. Blocked rows use a visually distinct badge (e.g., red). Place a ⋯ icon button at the trailing edge of each row to open a per-user action menu with Block or Unblock.
- **Block confirmation:** Use a clear confirmation dialog before blocking. Copy: *"Block @username? This will remove all their listings and prevent them from accessing Near Market."* Use the display name when a user has no Telegram username. Provide distinct confirm and cancel actions. Unblocking does not require a confirmation.
- **Empty and loading states:** Show a loading skeleton while the list loads. Show a concise empty message when the search or filter returns no users.
- **Related flow:** J-05 in `APP_FLOW.md`.

## 6. Interaction and UI states
- **Interactive states:** Give buttons, tabs, filters, and cards clear pressed, selected, focus, and disabled states as applicable. Keep action buttons compact within listing cards.
- **Operation feedback:** Show clear loading and success feedback for listing submissions and other actions.
- **Validation and errors:** Place field validation near the relevant form field. Explain system errors clearly and provide a visible retry path where appropriate.
- **Empty states:** Use concise text and a Post button when a listing feed is empty. Avoid decorative illustrations that compete with the action.
- **Confirmation:** Use a clear confirmation dialog for destructive actions, with distinct confirm and cancel actions.

## 7. Accessibility
- Use semantic structure and meaningful labels.
- Ensure keyboard access and visible focus.
- Maintain readable contrast in both app themes and do not rely on color alone.
- Provide appropriate alternative text and accessible names.
- Respect reduced-motion preferences where animation is used.
- Ensure interactive controls work with relevant assistive technologies.

## 8. Content guidelines
- **Tone and terminology:** Use concise, familiar wording. Keep navigation and action labels consistent with Listings, Items, House rentals, Post, Profile, My listings, Settings, and Dashboard.
- **Labels and messages:** Localize interface labels and messages in English by default, with the Amharic toggle beside the theme toggle at the top right of every page. Keep seller-entered listing text in the language the seller chose; do not imply it is translated.
- **Dates, numbers, and localization:** Format listing prices in ETB. House rental prices are identified as monthly, consistent with the product requirements.
- **Errors:** State what happened and what the user can do next in plain language.

## 9. Open design questions
None currently identified.
