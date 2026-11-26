import { useEffect, useRef, useState } from "react";
import { apiRequest } from "../api/client";
import { AppearanceControls, BrandMark, Icon, SurfaceCard, type Theme } from "../components/SharedUI";
import type { Language, Translator } from "../i18n/translations";

type Metrics = {
  totalUsers: number;
  totalListings: number;
  totalItemListings: number;
  totalHouseRentalListings: number;
  itemListingsByCategory: Array<{ category: "ELECTRONICS" | "CLOTHING" | "FURNITURE" | "OTHER"; count: number }>;
};

export function AdminDashboardPage({
  theme, onThemeChange, language, onLanguageChange, t, isActive,
}: {
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  language: Language;
  onLanguageChange: (language: Language) => void;
  t: Translator;
  isActive?: boolean;
}) {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [retry, setRetry] = useState(0);
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const hasMounted = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    setStatus("loading");
    void apiRequest<Metrics>("/admin/dashboard", { signal: controller.signal })
      .then((result) => {
        setMetrics(result);
        setLastUpdated(new Date());
        setStatus("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus("error");
      });
    return () => controller.abort();
  }, [retry]);

  // Re-fetch when the dashboard tab becomes active after navigating away.
  useEffect(() => {
    if (!hasMounted.current) { hasMounted.current = true; return; }
    if (isActive) setRetry((n) => n + 1);
  }, [isActive]);

  const itemListingsByCategory = metrics?.itemListingsByCategory ?? [];
  const categoryTotal = itemListingsByCategory.reduce((total, item) => total + item.count, 0);
  const canExpandCategories = itemListingsByCategory.length > 3;
  const visibleCategories = showAllCategories ? itemListingsByCategory : itemListingsByCategory.slice(0, 3);

  const timeLabel = lastUpdated
    ? lastUpdated.toLocaleTimeString(language === "am" ? "am-ET" : "en-US", { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[390px] flex-col bg-[var(--nm-page)] px-4 pb-28">
      <header className="-mx-4 flex min-h-[64px] items-center justify-between gap-3 bg-[var(--nm-header)] px-5 pb-1 pt-[max(6px,env(safe-area-inset-top))]">
        <div className="flex min-w-0 items-center gap-2.5">
          <BrandMark size="sm" />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-[var(--nm-text)]">Near Market</p>
            <h1 className="text-xs text-[var(--nm-secondary)]">{t("dashboard")}</h1>
          </div>
        </div>
        <AppearanceControls theme={theme} onThemeChange={onThemeChange} language={language} onLanguageChange={onLanguageChange} t={t} />
      </header>

      <section aria-label={t("dashboard")} aria-busy={status === "loading"}>
        {status === "error" ? (
          <div className="mt-5 rounded-2xl border border-red-500/30 bg-red-500/5 p-4" role="alert">
            <p className="text-sm text-[var(--nm-text)]">{t("dashboardLoadFailed")}</p>
            <button type="button" onClick={() => setRetry((value) => value + 1)} className="mt-3 min-h-10 rounded-xl bg-brand-500 px-4 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500">{t("retry")}</button>
          </div>
        ) : (
          <>
            {/* Last-updated timestamp + manual refresh */}
            <div className="mb-1 mt-4 flex items-center justify-between gap-2">
              <p className="text-xs text-[var(--nm-muted)]">
                {status === "ready" && timeLabel ? `${t("asOf")} ${timeLabel}` : "\u00a0"}
              </p>
              <button
                type="button"
                onClick={() => setRetry((n) => n + 1)}
                disabled={status === "loading"}
                aria-label={t("refreshDashboard")}
                className="flex h-7 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-brand-500 hover:bg-[var(--nm-hover)] disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
              >
                <Icon name="refresh" className="h-3.5 w-3.5" />
                {t("refresh")}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2" aria-live="polite">
              <MetricCard icon="users" label={t("totalUsers")} value={status === "loading" ? null : metrics?.totalUsers ?? 0} />
              <MetricCard icon="list" label={t("totalListings")} value={status === "loading" ? null : metrics?.totalListings ?? 0} />
              <MetricCard icon="cube" label={t("itemListingsCount")} value={status === "loading" ? null : metrics?.totalItemListings ?? 0} />
              <MetricCard icon="home" label={t("houseRentalListingsCount")} value={status === "loading" ? null : metrics?.totalHouseRentalListings ?? 0} />
              <SurfaceCard className="col-span-2 p-3.5">
                {status === "loading" ? (
                  <div className="animate-shimmer" role="status" aria-label={t("loadingListings")}>
                    <div className="h-4 w-2/3 rounded bg-[var(--nm-hover)]" />
                    <div className="mt-4 space-y-3">
                      <div className="h-4 rounded bg-[var(--nm-hover)]" />
                      <div className="h-4 rounded bg-[var(--nm-hover)]" />
                      <div className="h-4 rounded bg-[var(--nm-hover)]" />
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-500/15 text-brand-500"><Icon name="cube" className="h-5 w-5" /></span>
                      <h3 className="text-xs font-bold text-[var(--nm-text)]">{t("itemListingsByCategory")}</h3>
                    </div>
                    {categoryTotal === 0 ? <p className="mt-4 text-sm text-[var(--nm-secondary)]">{t("noItemListings")}</p> : (
                      <ol id="dashboard-category-list" className="mt-3 divide-y divide-[var(--nm-divider)]" aria-label={t("itemListingsByCategory")}>
                        {visibleCategories.map((item) => {
                          const pct = categoryTotal > 0 ? Math.round((item.count / categoryTotal) * 100) : 0;
                          return (
                            <li key={item.category} className="space-y-1.5 py-2 first:pt-0 last:pb-0">
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-sm text-[var(--nm-text)]">{t(item.category === "ELECTRONICS" ? "electronics" : item.category === "CLOTHING" ? "clothing" : item.category === "FURNITURE" ? "furniture" : "other")}</span>
                                <span className="shrink-0 text-sm font-semibold tabular-nums text-[var(--nm-text)]">
                                  {item.count.toLocaleString(language === "am" ? "am-ET" : "en-US")}
                                  <span className="ml-1.5 text-xs font-normal text-[var(--nm-muted)]">{pct}%</span>
                                </span>
                              </div>
                              {/* Percentage bar */}
                              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--nm-hover)]" aria-hidden="true">
                                <div className="h-full rounded-full bg-brand-500 transition-[width] duration-500" style={{ width: `${pct}%` }} />
                              </div>
                            </li>
                          );
                        })}
                      </ol>
                    )}
                    {canExpandCategories && categoryTotal > 0 && (
                      <button type="button" aria-expanded={showAllCategories} aria-controls="dashboard-category-list" onClick={() => setShowAllCategories((expanded) => !expanded)} className="mt-3 min-h-9 rounded-lg px-2 text-xs font-semibold text-brand-500 hover:bg-[var(--nm-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500">
                        {t(showAllCategories ? "showFewerCategories" : "showAllCategories")}
                      </button>
                    )}
                  </>
                )}
              </SurfaceCard>
            </div>
          </>
        )}
      </section>
    </main>
  );
}

function MetricCard({ icon, label, value }: { icon: "users" | "list" | "cube" | "home"; label: string; value: number | null }) {
  return (
    <SurfaceCard className="min-h-[92px] p-3.5">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-500/15 text-brand-500"><Icon name={icon} className="h-[18px] w-[18px]" /></span>
        {value === null
          ? <span aria-hidden="true" className="h-6 w-20 animate-shimmer rounded bg-[var(--nm-hover)]" />
          : <p className="min-w-0 truncate text-xl font-bold leading-none text-[var(--nm-text)]">{value.toLocaleString()}</p>}
      </div>
      <h3 className="mt-3 text-xs font-medium text-[var(--nm-secondary)]">{label}</h3>
    </SurfaceCard>
  );
}
