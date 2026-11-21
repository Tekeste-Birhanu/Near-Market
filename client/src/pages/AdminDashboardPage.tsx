import { useEffect, useState } from "react";
import { apiRequest } from "../api/client";
import { AppearanceControls, Icon, SurfaceCard, type Theme } from "../components/SharedUI";
import type { Language, Translator } from "../i18n/translations";

type Metrics = {
  totalUsers: number;
  totalListings: number;
  totalItemListings: number;
  totalHouseRentalListings: number;
  itemListingsByCategory: Array<{ category: "ELECTRONICS" | "CLOTHING" | "OTHER"; count: number }>;
};

export function AdminDashboardPage({
  theme, onThemeChange, language, onLanguageChange, t,
}: {
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  language: Language;
  onLanguageChange: (language: Language) => void;
  t: Translator;
}) {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [retry, setRetry] = useState(0);
  const [showAllCategories, setShowAllCategories] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setStatus("loading");
    void apiRequest<Metrics>("/admin/dashboard", { signal: controller.signal })
      .then((result) => {
        setMetrics(result);
        setStatus("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus("error");
      });
    return () => controller.abort();
  }, [retry]);

  const itemListingsByCategory = metrics?.itemListingsByCategory ?? [];
  const categoryTotal = itemListingsByCategory.reduce((total, item) => total + item.count, 0);
  const canExpandCategories = itemListingsByCategory.length > 3;
  const visibleCategories = showAllCategories ? itemListingsByCategory : itemListingsByCategory.slice(0, 3);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[390px] flex-col bg-[var(--nm-page)] px-4 pb-28">
      <header className="-mx-4 flex min-h-[64px] items-center justify-between gap-3 bg-[var(--nm-header)] px-5 pb-1 pt-[max(6px,env(safe-area-inset-top))]">
        <div className="flex min-w-0 items-center gap-2.5">
          <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-500 text-base font-bold text-white">N</span>
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
          <div className="mt-4 grid grid-cols-2 gap-2" aria-live="polite">
            <MetricCard icon="users" label={t("totalUsers")} value={status === "loading" ? null : metrics?.totalUsers ?? 0} />
            <MetricCard icon="list" label={t("totalListings")} value={status === "loading" ? null : metrics?.totalListings ?? 0} />
            <MetricCard icon="cube" label={t("itemListingsCount")} value={status === "loading" ? null : metrics?.totalItemListings ?? 0} />
            <MetricCard icon="home" label={t("houseRentalListingsCount")} value={status === "loading" ? null : metrics?.totalHouseRentalListings ?? 0} />
            <SurfaceCard className="col-span-2 p-3.5">
              {status === "loading" ? (
                <div className="animate-pulse" role="status" aria-label={t("loadingListings")}>
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
                      {visibleCategories.map((item) => (
                        <li key={item.category} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                          <span className="text-sm text-[var(--nm-text)]">{t(item.category === "ELECTRONICS" ? "electronics" : item.category === "CLOTHING" ? "clothing" : "other")}</span>
                          <span className="shrink-0 text-sm font-semibold tabular-nums text-[var(--nm-text)]">{item.count.toLocaleString(language === "am" ? "am-ET" : "en-US")} {t(item.count === 1 ? "listing" : "listingCountPlural")}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                  {canExpandCategories && categoryTotal > 0 && <button type="button" aria-expanded={showAllCategories} aria-controls="dashboard-category-list" onClick={() => setShowAllCategories((expanded) => !expanded)} className="mt-3 min-h-9 rounded-lg px-2 text-xs font-semibold text-brand-500 hover:bg-[var(--nm-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500">{t(showAllCategories ? "showFewerCategories" : "showAllCategories")}</button>}
                </>
              )}
            </SurfaceCard>
          </div>
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
        {value === null ? <span aria-hidden="true" className="h-6 w-20 animate-pulse rounded bg-[var(--nm-hover)]" /> : <p className="min-w-0 truncate text-xl font-bold leading-none text-[var(--nm-text)]">{value.toLocaleString()}</p>}
      </div>
      <h3 className="mt-3 text-xs font-medium text-[var(--nm-secondary)]">{label}</h3>
    </SurfaceCard>
  );
}
