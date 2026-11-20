import { useEffect, useMemo, useRef, useState } from "react";
import { AppearanceControls, Icon, SurfaceCard, type Theme } from "../components/SharedUI";
import { FilterDropdown, ListingCard, ListingDetailsDialog } from "../components/ListingComponents";
import { previewListings, type ListingType, type PreviewListing } from "../data/listings";
import type { Language, Translator } from "../i18n/translations";
import { apiRequest } from "../api/client";
import { toCardListing, type ListingFeedResponse } from "../api/listings";
import { ListingViews } from "./ListingViews";

type ViewRoute = { kind: "listing"; listingId: string } | { kind: "seller"; sellerId: string };

function buildFeedParams(type: ListingType, query: string, category: string, condition: string, price: string, sort: "NEWEST" | "OLDEST", cursor?: string): URLSearchParams {
  const params = new URLSearchParams({ type, limit: "20" });
  if (sort === "OLDEST") params.set("sort", sort);
  if (query.trim()) params.set("q", query.trim());
  if (type === "ITEM" && category !== "All categories") params.set("category", category === "Electronics" ? "ELECTRONICS" : category.toUpperCase());
  if (type === "ITEM" && condition !== "Any condition") params.set("condition", condition.toUpperCase());
  if (price === "Under 5,000") params.set("maxPrice", "4999.99");
  if (price === "5,000+") params.set("minPrice", "5000");
  if (cursor) params.set("cursor", cursor);
  return params;
}

export function ListingsPage({
  theme,
  onThemeChange,
  language,
  onLanguageChange,
  t,
  previewMode = false,
  onPost,
  newListingId,
  onNewListingOpened,
}: {
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  language: Language;
  onLanguageChange: (language: Language) => void;
  t: Translator;
  previewMode?: boolean;
  onPost: () => void;
  newListingId?: string | null;
  onNewListingOpened?: () => void;
}) {
  const [activeTab, setActiveTab] = useState<ListingType>("ITEM");
  const [showFilters, setShowFilters] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All categories");
  const [condition, setCondition] = useState("Any condition");
  const [price, setPrice] = useState("Any price");
  const [sort, setSort] = useState<"NEWEST" | "OLDEST">("NEWEST");
  const [selectedListing, setSelectedListing] = useState<PreviewListing | null>(null);
  const [viewStack, setViewStack] = useState<ViewRoute[]>([]);
  const [feedListings, setFeedListings] = useState<PreviewListing[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [feedStatus, setFeedStatus] = useState<"loading" | "ready" | "error">(previewMode ? "ready" : "loading");
  const [feedError, setFeedError] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const swipeStart = useRef<{ x: number; y: number; blocked: boolean } | null>(null);

  useEffect(() => {
    if (!newListingId) return;
    setActiveTab("ITEM");
    setViewStack([{ kind: "listing", listingId: newListingId }]);
    onNewListingOpened?.();
  }, [newListingId, onNewListingOpened]);

  const switchTab = (tab: ListingType) => {
    setActiveTab(tab);
    setQuery("");
    setShowFilters(false);
    setCategory("All categories");
    setCondition("Any condition");
    setPrice("Any price");
  };

  const previewFeed = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const sourceListings = previewMode ? previewListings : [];
    const filtered = sourceListings.filter((listing) => {
      if (listing.type !== activeTab) return false;
      const matchesQuery = `${listing.title} ${listing.address ?? ""}`
        .toLocaleLowerCase()
        .includes(normalizedQuery);
      const matchesCategory = activeTab !== "ITEM" || category === "All categories" || listing.category === category;
      const matchesCondition = activeTab !== "ITEM" || condition === "Any condition" || listing.condition === condition;
      const matchesPrice = price === "Any price" || (price === "Under 5,000" ? listing.price !== null && listing.price < 5_000 : listing.price !== null && listing.price >= 5_000);
      return matchesQuery && matchesCategory && matchesCondition && matchesPrice;
    });
    return sort === "OLDEST" ? filtered.slice().reverse() : filtered;
  }, [activeTab, category, condition, price, previewMode, query, sort]);

  useEffect(() => {
    if (previewMode) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const params = buildFeedParams(activeTab, query, category, condition, price, sort);
      setFeedStatus("loading");
      setFeedError("");
      setNextCursor(null);
      void apiRequest<ListingFeedResponse>(`/listings?${params.toString()}`, { signal: controller.signal })
        .then((response) => {
          setFeedListings(response.items.map(toCardListing));
          setNextCursor(response.nextCursor);
          setFeedStatus("ready");
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setFeedError(error instanceof Error ? error.message : t("feedLoadFailed"));
          setFeedStatus("error");
        });
    }, query ? 250 : 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [activeTab, category, condition, price, previewMode, query, retryKey, sort, t]);

  const listings = previewMode ? previewFeed : feedListings;

  const hasActiveFilters = category !== "All categories" || condition !== "Any condition" || price !== "Any price";

  const clearFilters = () => {
    setCategory("All categories");
    setCondition("Any condition");
    setPrice("Any price");
  };

  const openListing = (listing: PreviewListing) => {
    if (previewMode) setSelectedListing(listing);
    else setViewStack([{ kind: "listing", listingId: listing.id }]);
  };

  const popView = () => setViewStack((stack) => stack.slice(0, -1));
  const activeView = viewStack[viewStack.length - 1];

  const loadMore = async () => {
    if (!nextCursor || feedStatus === "loading") return;
    setFeedStatus("loading");
    setFeedError("");
    const params = buildFeedParams(activeTab, query, category, condition, price, sort, nextCursor);
    try {
      const response = await apiRequest<ListingFeedResponse>(`/listings?${params.toString()}`);
      setFeedListings((current) => [...current, ...response.items.map(toCardListing)]);
      setNextCursor(response.nextCursor);
      setFeedStatus("ready");
    } catch (error) {
      setFeedError(error instanceof Error ? error.message : t("feedLoadFailed"));
      setFeedStatus("error");
    }
  };

  return (
    <>
    <div aria-hidden={activeView ? true : undefined} className="flex min-h-dvh flex-col bg-[var(--nm-page)] text-[var(--nm-text)]">
      <header className="flex min-h-[64px] w-full items-center justify-between gap-3 bg-[var(--nm-header)] px-5 pb-1 pt-[max(6px,env(safe-area-inset-top))]">
        <div className="flex w-full items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl bg-brand-500 text-lg font-extrabold tracking-tight text-white shadow-[0_8px_24px_rgba(22,134,200,0.18)]">N</div>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold leading-6 tracking-tight">Near Market</h1>
            </div>
          </div>
          <AppearanceControls theme={theme} onThemeChange={onThemeChange} language={language} onLanguageChange={onLanguageChange} t={t} />
        </div>
      </header>

      <section aria-label={t("listingType")} className="w-full px-4 pb-0 pt-4">
        <div className="mx-auto w-full max-w-[390px]">
          <div className="flex gap-2">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">{t("searchListings")}</span>
              <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--nm-muted)]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={activeTab === "ITEM" ? t("searchItems") : t("searchRentals")}
                type="search"
                className="h-11 w-full rounded-[14px] border border-[var(--nm-border)] bg-[var(--nm-surface)] pl-11 pr-3 text-sm text-[var(--nm-text)] outline-none placeholder:text-[var(--nm-muted)] focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              />
            </label>
            <button
              type="button"
              onClick={() => setShowFilters((visible) => !visible)}
              aria-expanded={showFilters}
              aria-controls="listing-filters"
              className={`relative flex h-11 items-center justify-center gap-2 rounded-[14px] border px-2.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 max-[360px]:w-11 max-[360px]:px-0 ${showFilters ? "border-brand-200 bg-[var(--nm-accent-soft)] text-brand-700" : "border-[var(--nm-border)] bg-[var(--nm-surface)] text-[var(--nm-text)]"}`}
            >
              <Icon name="filter" className="h-[19px] w-[19px] shrink-0" />
              <span className="max-[360px]:hidden">{t("filter")}</span>
              {hasActiveFilters && <span aria-hidden="true" className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-brand-500 ring-2 ring-[var(--nm-surface)]" />}
            </button>
          </div>

          <nav role="tablist" aria-label={t("listingType")} className="mx-auto mt-1.5 flex w-full max-w-[390px] border-b border-[var(--nm-divider)]">
            {(["ITEM", "HOUSE_RENTAL"] as const).map((tab) => (
              <button
                type="button"
                key={tab}
                role="tab"
                onClick={() => switchTab(tab)}
                aria-selected={activeTab === tab}
                className={`relative flex h-10 flex-1 items-center justify-center text-[13.5px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-500 ${activeTab === tab ? "text-brand-500" : "text-[var(--nm-muted)]"}`}
              >
                {tab === "ITEM" ? t("items") : t("houseRentals")}
                {activeTab === tab && <span aria-hidden="true" className="absolute inset-x-0 bottom-[-1px] h-0.5 bg-brand-500" />}
              </button>
            ))}
          </nav>
        </div>
      </section>

      <main
        className="mx-auto w-full max-w-[390px] flex-1 touch-pan-y px-4 pb-28 pt-3"
        onTouchStart={(event) => {
          const touch = event.touches[0];
          if (!touch) return;
          const target = event.target instanceof Element ? event.target : null;
          swipeStart.current = {
            x: touch.clientX,
            y: touch.clientY,
            blocked: Boolean(target?.closest("button, input, select, textarea, a, [role='listbox'], [role='option']")),
          };
        }}
        onTouchEnd={(event) => {
          const start = swipeStart.current;
          swipeStart.current = null;
          const touch = event.changedTouches[0];
          if (!start || start.blocked || !touch) return;
          const deltaX = touch.clientX - start.x;
          const deltaY = touch.clientY - start.y;
          if (Math.abs(deltaX) < 60 || Math.abs(deltaX) < Math.abs(deltaY) * 1.25) return;
          switchTab(deltaX < 0 ? "HOUSE_RENTAL" : "ITEM");
        }}
        onTouchCancel={() => { swipeStart.current = null; }}
      >
        {showFilters && (
          <SurfaceCard id="listing-filters" aria-label={t("filters")} className="mb-4 p-3">
            <div className="mb-2.5 flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--nm-muted)]">{t("filters")}</h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={clearFilters}
                  disabled={!hasActiveFilters}
                  className="rounded px-1 py-1 text-xs font-semibold text-brand-500 hover:bg-[var(--nm-hover)] disabled:cursor-default disabled:text-[var(--nm-muted)] disabled:opacity-60"
                >
                  {t("clearFilters")}
                </button>
                <button type="button" onClick={() => setShowFilters(false)} className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--nm-muted)] hover:bg-[var(--nm-hover)]" aria-label={t("closeFilters")}><Icon name="close" className="h-4 w-4" /></button>
              </div>
            </div>
            <div className={`grid gap-2 ${activeTab === "ITEM" ? "grid-cols-3" : "grid-cols-1"}`}>
              {activeTab === "ITEM" && (
                <>
                  <FilterDropdown
                    label={t("category")}
                    value={category}
                    onChange={setCategory}
                    options={[
                      { value: "All categories", label: t("allCategories") },
                      { value: "Electronics", label: t("electronics") },
                      { value: "Clothing", label: t("clothing") },
                      { value: "Other", label: t("other") },
                    ]}
                  />
                  <FilterDropdown
                    label={t("condition")}
                    value={condition}
                    onChange={setCondition}
                    options={[
                      { value: "Any condition", label: t("anyCondition") },
                      { value: "New", label: t("new") },
                      { value: "Used", label: t("used") },
                    ]}
                  />
                </>
              )}
              <FilterDropdown
                label={t("price")}
                value={price}
                onChange={setPrice}
                options={[
                  { value: "Any price", label: t("anyPrice") },
                  { value: "Under 5,000", label: t("under5000") },
                  { value: "5,000+", label: t("over5000") },
                ]}
              />
            </div>
          </SurfaceCard>
        )}
        <div className="mb-[10px] flex items-center justify-between">
          <p className="text-[12.5px] text-[var(--nm-secondary)]">{listings.length} {t(listings.length === 1 ? "listing" : "listingCountPlural")}</p>
          <FilterDropdown
            label={t("sortBy")}
            value={sort}
            onChange={(value) => setSort(value as "NEWEST" | "OLDEST")}
            variant="sort"
            options={[
              { value: "NEWEST", label: t("newestFirst") },
              { value: "OLDEST", label: t("oldestFirst") },
            ]}
          />
        </div>
        {feedStatus === "loading" && !previewMode ? (
          <div role="status" className="py-8 text-center text-sm text-[var(--nm-muted)]">{t("loadingListings")}</div>
        ) : feedStatus === "error" && !previewMode ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <p role="alert" className="text-sm text-[var(--nm-muted)]">{feedError || t("feedLoadFailed")}</p>
            <button type="button" onClick={() => setRetryKey((key) => key + 1)} className="rounded-lg bg-[var(--nm-action)] px-3 py-2 text-xs font-bold text-white">{t("retry")}</button>
          </div>
        ) : listings.length ? (
          <div className="grid gap-2">
            {listings.map((listing) => <ListingCard key={listing.id} listing={listing} onDetails={openListing} t={t} />)}
            {!previewMode && nextCursor && <button type="button" onClick={() => void loadMore()} className="mx-auto rounded-lg px-4 py-2 text-xs font-bold text-brand-500 disabled:opacity-60" disabled={feedStatus === "loading"}>{t("loadMore")}</button>}
          </div>
        ) : (
          <div className="flex min-h-[170px] flex-col items-center justify-center px-6 py-7 text-center">
            <Icon name={activeTab === "ITEM" ? "search" : "home"} className="mb-3 h-[30px] w-[30px] text-[var(--nm-muted)]" />
            <p className="text-sm font-bold text-[var(--nm-text)]">{t("noListingsFound")}</p>
            <p className="mt-1 text-xs text-[var(--nm-muted)]">{t("changeSearchOrFilters")}</p>
            <button type="button" onClick={onPost} className="mt-4 rounded-lg bg-[var(--nm-action)] px-4 py-2 text-xs font-bold text-white">{t("post")}</button>
          </div>
        )}
      </main>

      {selectedListing && <ListingDetailsDialog listing={selectedListing} onClose={() => setSelectedListing(null)} t={t} />}
      </div>
      {!previewMode && activeView && <ListingViews
        route={activeView}
        theme={theme}
        onThemeChange={onThemeChange}
        language={language}
        onLanguageChange={onLanguageChange}
        t={t}
        onBack={popView}
        onSeller={(sellerId) => setViewStack((stack) => [...stack, { kind: "seller", sellerId }])}
        onListing={(listingId) => setViewStack((stack) => [...stack, { kind: "listing", listingId }])}
      />}
    </>
  );
}
