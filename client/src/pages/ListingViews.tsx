import { useEffect, useRef, useState } from "react";
import { ApiError } from "../api/client";
import { invalidateImages } from "../api/image-cache";
import {
  fetchListingDetails,
  fetchAdminListingDetails,
  fetchSellerListings,
  fetchSellerProfile,
  toCardListing,
  removeAdminListing,
  type ListingDetails,
  type ListingImage as ApiListingImage,
  type ListingSummary,
  type SellerProfile,
} from "../api/listings";
import { ListingCard, ListingCardSkeleton, ListingImage } from "../components/ListingComponents";
import { AppearanceControls, BackButton, Icon, SurfaceCard, type Theme } from "../components/SharedUI";
import type { Language, Translator } from "../i18n/translations";

type ViewRoute = { kind: "listing"; listingId: string } | { kind: "seller"; sellerId: string };

export function ListingViews({
  route,
  theme,
  onThemeChange,
  language,
  onLanguageChange,
  t,
  onBack,
  onSeller,
  onListing,
  adminMode = false,
  onListingRemoved,
}: {
  route: ViewRoute;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  language: Language;
  onLanguageChange: (language: Language) => void;
  t: Translator;
  onBack: () => void;
  onSeller: (sellerId: string) => void;
  onListing: (listingId: string) => void;
  adminMode?: boolean;
  onListingRemoved?: () => void;
}) {
  return route.kind === "listing" ? (
    <ListingDetailsView
      listingId={route.listingId}
      theme={theme}
      onThemeChange={onThemeChange}
      language={language}
      onLanguageChange={onLanguageChange}
      t={t}
      onBack={onBack}
      onSeller={onSeller}
      adminMode={adminMode}
      onListingRemoved={onListingRemoved}
    />
  ) : (
    <SellerProfileView
      sellerId={route.sellerId}
      theme={theme}
      onThemeChange={onThemeChange}
      language={language}
      onLanguageChange={onLanguageChange}
      t={t}
      onBack={onBack}
      onListing={onListing}
    />
  );
}

function ListingDetailsView({
  listingId,
  theme,
  onThemeChange,
  language,
  onLanguageChange,
  t,
  onBack,
  onSeller,
  adminMode,
  onListingRemoved,
}: {
  listingId: string;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  language: Language;
  onLanguageChange: (language: Language) => void;
  t: Translator;
  onBack: () => void;
  onSeller: (sellerId: string) => void;
  adminMode: boolean;
  onListingRemoved?: () => void;
}) {
  const [listing, setListing] = useState<ListingDetails | null>(null);
  const [error, setError] = useState<"unavailable" | "notFound" | "failed" | null>(null);
  const [loading, setLoading] = useState(true);
  const [retryKey, setRetryKey] = useState(0);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState(false);
  const backRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void (adminMode ? fetchAdminListingDetails(listingId, controller.signal) : fetchListingDetails(listingId, controller.signal)).then(setListing).catch((cause: unknown) => {
      if (controller.signal.aborted) return;
      if (cause instanceof ApiError && cause.code === "LISTING_UNAVAILABLE") setError("unavailable");
      else if (cause instanceof ApiError && cause.status === 404) setError("notFound");
      else setError("failed");
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [adminMode, listingId, retryKey]);

  async function removeListing() {
    if (!window.confirm(t("confirmAdminListingRemoval"))) return;
    setRemoving(true);
    setRemoveError(false);
    try {
      await removeAdminListing(listingId);
      if (listing) {
        invalidateImages(listing.images.map((img) => img.url.replace(/^\/api\/v1/, "")));
      }
      onListingRemoved?.();
    } catch {
      setRemoveError(true);
      setRemoving(false);
    }
  }

  useEffect(() => {
    backRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onBack();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onBack]);

  return (
    <section className="fixed inset-0 z-40 mx-auto min-h-dvh w-full max-w-[390px] overflow-y-auto bg-[var(--nm-page)] text-[var(--nm-text)]" role="dialog" aria-modal="true" aria-label={t("listingDetails")}>
      <PageHeader title={t("listingDetails")} theme={theme} onThemeChange={onThemeChange} language={language} onLanguageChange={onLanguageChange} t={t} onBack={onBack} backRef={backRef} />
      {loading ? (
        <>
          <p role="status" className="sr-only">{t("loadingDetails")}</p>
          <ListingDetailSkeleton />
        </>
      ) : error ? (
        <div className="flex min-h-[45vh] flex-col items-center justify-center gap-3 px-6 text-center">
          <h2 id="listing-detail-heading" className="text-base font-bold">{t(error === "unavailable" ? "listingUnavailable" : error === "notFound" ? "listingNotFound" : "detailsLoadFailed")}</h2>
          {error === "failed" && <button type="button" onClick={() => setRetryKey((key) => key + 1)} className="rounded-lg bg-[var(--nm-action)] px-4 py-2 text-xs font-bold text-white">{t("retry")}</button>}
          <button type="button" onClick={onBack} className="rounded-lg px-4 py-2 text-xs font-semibold text-brand-500">{t("back")}</button>
        </div>
      ) : listing ? (
        <article className="pb-10">
          <PhotoGallery images={listing.images} title={listing.type === "ITEM" ? listing.title : listing.rentalAddress ?? t("houseRental")} t={t} />
          <div className="space-y-4 px-4 pb-[calc(24px+env(safe-area-inset-bottom))] pt-4">
            <div>
              <p className="text-xs font-semibold text-brand-500">{listing.type === "ITEM" ? (listing.condition === "NEW" ? t("new") : t("used")) : t("houseRental")}</p>
              <h2 id="listing-detail-heading" className="mt-1 text-base font-bold leading-5">{listing.type === "ITEM" ? listing.title : t("houseRental")}</h2>
              <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <p className="text-lg font-extrabold">{listing.priceAmount === null ? t("contactForPrice") : `ETB ${Number(listing.priceAmount).toLocaleString("en-ET")}`}</p>
                {listing.type === "HOUSE_RENTAL" && <span className="text-xs text-[var(--nm-muted)]">{t("month")}</span>}
              </div>
              {listing.type === "ITEM" && listing.category && <p className="mt-2 text-xs text-[var(--nm-muted)]">{t("category")}: {t(listing.category === "ELECTRONICS" ? "electronics" : listing.category === "CLOTHING" ? "clothing" : "other")}</p>}
              {listing.status !== "AVAILABLE" && <p className="mt-2 text-xs font-semibold text-[var(--nm-muted)]">{t(listing.status === "SOLD" ? "sold" : "unavailable")}</p>}
            </div>

            {listing.type === "HOUSE_RENTAL" && listing.rentalAddress && <section>
              <h2 className="text-xs font-bold text-[var(--nm-secondary)]">{t("address")}</h2>
              <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--nm-secondary)]">{listing.rentalAddress}</p>
            </section>}
            <section>
              <h2 className="text-xs font-bold text-[var(--nm-secondary)]">{t("description")}</h2>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-[var(--nm-secondary)]">{listing.description}</p>
            </section>

            <SurfaceCard className="p-3">
              <h2 className="mb-2 text-xs font-bold text-[var(--nm-secondary)]">{t("seller")}</h2>
              <button type="button" onClick={() => onSeller(listing.seller.id)} className="flex w-full items-center justify-between gap-3 rounded-lg py-1 text-left focus-visible:outline-2 focus-visible:outline-brand-500">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold">{listing.seller.displayName}</span>
                  {listing.seller.telegramUsername && <span className="mt-0.5 block truncate text-xs text-[var(--nm-muted)]">@{listing.seller.telegramUsername}</span>}
                </span>
                <Icon name="chevron" className="h-4 w-4 shrink-0 text-[var(--nm-muted)]" />
              </button>
              {listing.seller.telegramUsername && <a href={telegramUrl(listing.seller.telegramUsername)} target="_blank" rel="noopener noreferrer" className="mt-3 flex h-10 items-center justify-center gap-2 rounded-xl bg-[var(--nm-action)] text-xs font-bold text-white hover:bg-[var(--nm-action-hover)]"><Icon name="send" className="h-4 w-4" />{t("contactSeller")}</a>}
              {listing.seller.phoneNumber && <a href={`tel:${listing.seller.phoneNumber.replace(/[^\d+*#,;]/g, "")}`} className="mt-2 flex h-10 items-center justify-center rounded-xl border border-[var(--nm-border)] text-xs font-semibold">{t("phoneNumber")}: {listing.seller.phoneNumber}</a>}
            </SurfaceCard>
            {adminMode && <section className="space-y-2">
              {removeError && <p role="alert" className="text-sm text-red-500">{t("adminListingRemovalFailed")}</p>}
              <button type="button" onClick={() => void removeListing()} disabled={removing} className="flex h-11 w-full items-center justify-center rounded-xl border border-red-500/50 text-sm font-semibold text-red-500 disabled:opacity-60">{removing ? t("removingAdminListing") : t("removeAdminListing")}</button>
            </section>}
          </div>
        </article>
      ) : null}
    </section>
  );
}

function SellerProfileView({
  sellerId,
  theme,
  onThemeChange,
  language,
  onLanguageChange,
  t,
  onBack,
  onListing,
}: {
  sellerId: string;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  language: Language;
  onLanguageChange: (language: Language) => void;
  t: Translator;
  onBack: () => void;
  onListing: (listingId: string) => void;
}) {
  const [seller, setSeller] = useState<SellerProfile | null>(null);
  const [listings, setListings] = useState<ListingSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const backRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    void Promise.all([
      fetchSellerProfile(sellerId, controller.signal),
      fetchSellerListings(sellerId, controller.signal),
    ]).then(([profile, response]) => {
      setSeller(profile);
      setListings(response.items);
      setNextCursor(response.nextCursor);
    }).catch(() => {
      if (!controller.signal.aborted) setError(true);
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [sellerId, retryKey]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setLoadMoreError(false);
    try {
      const response = await fetchSellerListings(sellerId, undefined, nextCursor);
      setListings((current) => [...current, ...response.items]);
      setNextCursor(response.nextCursor);
    } catch {
      setLoadMoreError(true);
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    backRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onBack();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onBack]);

  return (
    <section className="fixed inset-0 z-40 mx-auto min-h-dvh w-full max-w-[390px] overflow-y-auto bg-[var(--nm-page)] text-[var(--nm-text)]" role="dialog" aria-modal="true" aria-label={t("sellerProfile")}>
      <PageHeader title={t("sellerProfile")} theme={theme} onThemeChange={onThemeChange} language={language} onLanguageChange={onLanguageChange} t={t} onBack={onBack} backRef={backRef} />
      {loading ? (
        <>
          <p role="status" className="sr-only">{t("loadingSeller")}</p>
          <SellerProfileSkeleton />
        </>
      ) : error ? (
        <div className="flex min-h-[45vh] flex-col items-center justify-center gap-3 px-6 text-center">
          <p role="alert" className="text-sm text-[var(--nm-muted)]">{t("sellerLoadFailed")}</p>
          <button type="button" onClick={() => setRetryKey((key) => key + 1)} className="rounded-lg bg-[var(--nm-action)] px-4 py-2 text-xs font-bold text-white">{t("retry")}</button>
        </div>
      ) : seller ? (
        <main className="px-4 pb-10 pt-4">
          <SurfaceCard className="p-4">
            <h2 id="seller-profile-heading" className="text-base font-bold">{seller.displayName}</h2>
            {seller.telegramUsername && <a className="mt-1 inline-block text-sm text-brand-500" href={telegramUrl(seller.telegramUsername)} target="_blank" rel="noopener noreferrer">@{seller.telegramUsername}</a>}
          </SurfaceCard>
          <h2 className="mb-3 mt-5 text-sm font-bold">{t("availableListings")}</h2>
          {listings.length ? <div className="grid gap-2">{listings.map((listing) => <ListingCard key={listing.id} listing={toCardListing(listing)} onDetails={(selected) => onListing(selected.id)} t={t} />)}
            {nextCursor && <div className="flex flex-col items-center gap-2 pt-2">
              {loadMoreError && <p role="alert" className="text-xs text-[var(--nm-muted)]">{t("sellerLoadFailed")}</p>}
              <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className="rounded-lg px-4 py-2 text-xs font-bold text-brand-500 disabled:opacity-60">{loadingMore ? t("loadingListings") : loadMoreError ? t("retry") : t("loadMore")}</button>
            </div>}
          </div> : <p className="py-8 text-center text-sm text-[var(--nm-muted)]">{t("noSellerListings")}</p>}
        </main>
      ) : null}
    </section>
  );
}

function ListingDetailSkeleton() {
  return (
    <article aria-hidden="true">
      {/* Photo area — matches aspect-[4/3] */}
      <div className="animate-shimmer aspect-[4/3] w-full bg-[var(--nm-hover)]" />
      <div className="space-y-4 px-4 pt-4">
        {/* Badge + title + price */}
        <div className="space-y-2">
          <div className="animate-shimmer h-3 w-16 rounded-md bg-[var(--nm-hover)]" />
          <div className="animate-shimmer h-5 w-3/4 rounded-md bg-[var(--nm-hover)]" />
          <div className="animate-shimmer h-6 w-1/3 rounded-md bg-[var(--nm-hover)]" />
        </div>
        {/* Description block */}
        <div className="space-y-2">
          <div className="animate-shimmer h-3 w-20 rounded-md bg-[var(--nm-hover)]" />
          <div className="animate-shimmer h-3 w-full rounded-md bg-[var(--nm-hover)]" />
          <div className="animate-shimmer h-3 w-5/6 rounded-md bg-[var(--nm-hover)]" />
          <div className="animate-shimmer h-3 w-4/6 rounded-md bg-[var(--nm-hover)]" />
        </div>
        {/* Seller card */}
        <SurfaceCard className="p-3">
          <div className="animate-shimmer mb-3 h-3 w-10 rounded-md bg-[var(--nm-hover)]" />
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-1.5">
              <div className="animate-shimmer h-3.5 w-28 rounded-md bg-[var(--nm-hover)]" />
              <div className="animate-shimmer h-3 w-20 rounded-md bg-[var(--nm-hover)]" />
            </div>
            <div className="animate-shimmer h-4 w-4 rounded bg-[var(--nm-hover)]" />
          </div>
          <div className="animate-shimmer mt-3 h-10 w-full rounded-xl bg-[var(--nm-hover)]" />
        </SurfaceCard>
      </div>
    </article>
  );
}

function SellerProfileSkeleton() {
  return (
    <main aria-hidden="true" className="px-4 pb-10 pt-4">
      {/* Name card */}
      <SurfaceCard className="p-4">
        <div className="animate-shimmer h-4 w-32 rounded-md bg-[var(--nm-hover)]" />
        <div className="animate-shimmer mt-2 h-3 w-20 rounded-md bg-[var(--nm-hover)]" />
      </SurfaceCard>
      {/* Listings heading */}
      <div className="animate-shimmer mb-3 mt-5 h-3.5 w-28 rounded-md bg-[var(--nm-hover)]" />
      {/* Two listing card skeletons */}
      <div className="grid gap-2">
        <ListingCardSkeleton />
        <ListingCardSkeleton />
      </div>
    </main>
  );
}

function PhotoGallery({ images, title, t }: { images: ApiListingImage[]; title: string; t: Translator }) {
  const photos = images.slice(0, 3);
  const [activeIndex, setActiveIndex] = useState(0);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => setActiveIndex(0), [images]);
  const change = (delta: number) => setActiveIndex((index) => (index + delta + photos.length) % photos.length);
  const activePhoto = photos[activeIndex];

  return (
    <section aria-label={t("listingPhotos")} className="relative aspect-[4/3] w-full overflow-hidden bg-[var(--nm-surface)]" onTouchStart={(event) => {
      const touch = event.touches[0];
      if (touch) touchStart.current = { x: touch.clientX, y: touch.clientY };
    }} onTouchEnd={(event) => {
      const start = touchStart.current;
      touchStart.current = null;
      const touch = event.changedTouches[0];
      if (!start || !touch) return;
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.2) change(dx < 0 ? 1 : -1);
    }}>
      {activePhoto ? <ListingImage url={imageRequestPath(activePhoto.url)} alt={title} className="h-full w-full object-cover" t={t} /> : <div role="img" aria-label={t("imageUnavailable")} className="h-full w-full bg-[var(--nm-hover)]" />}
      {photos.length > 1 && <>
        <button type="button" aria-label={t("previousPhoto")} onClick={() => change(-1)} className="absolute left-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white"><Icon name="chevron" className="h-5 w-5 rotate-180" /></button>
        <button type="button" aria-label={t("nextPhoto")} onClick={() => change(1)} className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white"><Icon name="chevron" className="h-5 w-5" /></button>
        <div className="absolute bottom-3 inset-x-0 flex justify-center gap-1.5" aria-label={t("photoPosition", String(activeIndex + 1), String(photos.length))}>
          {photos.map((photo, index) => <button key={photo.id} type="button" onClick={() => setActiveIndex(index)} aria-label={t("photoNumber", String(index + 1))} aria-current={index === activeIndex ? "true" : undefined} className={`h-2 w-2 rounded-full ${index === activeIndex ? "bg-white" : "bg-white/55"}`} />)}
        </div>
      </>}
    </section>
  );
}

function PageHeader({ title, theme, onThemeChange, language, onLanguageChange, t, onBack, backRef }: {
  title: string;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  language: Language;
  onLanguageChange: (language: Language) => void;
  t: Translator;
  onBack: () => void;
  backRef: React.RefObject<HTMLButtonElement | null>;
}) {
  return <header className="flex min-h-[64px] items-center justify-between gap-3 bg-[var(--nm-header)] px-5 pb-1 pt-[max(6px,env(safe-area-inset-top))]">
    <div className="flex min-w-0 items-center gap-1">
      <BackButton ref={backRef} label={t("back")} onClick={onBack} className="-ml-2 h-9 w-9 justify-center p-0" />
      <h1 className="truncate text-xl font-bold leading-6">{title}</h1>
    </div>
    <AppearanceControls theme={theme} onThemeChange={onThemeChange} language={language} onLanguageChange={onLanguageChange} t={t} />
  </header>;
}

function telegramUrl(username: string): string {
  return `https://t.me/${encodeURIComponent(username.replace(/^@/, ""))}`;
}

function imageRequestPath(url: string): string {
  return url.startsWith("/api/v1") ? url.slice("/api/v1".length) : url;
}
