import { forwardRef, type ComponentPropsWithoutRef, type ElementType, type ReactNode } from "react";
import type { Language, TranslationKey, Translator } from "../i18n/translations";

export type Theme = "light" | "dark";
export type MainPage = "dashboard" | "listings" | "post" | "profile";
export type IconName =
  | "search" | "filter" | "list" | "plus" | "profile" | "send"
  | "chevron" | "home" | "cube" | "image" | "trash" | "close" | "sun" | "moon" | "settings" | "users" | "dashboard" | "refresh";

type SurfaceCardProps<T extends ElementType> = {
  as?: T;
  className?: string;
} & Omit<ComponentPropsWithoutRef<T>, "as" | "className">;

export function SurfaceCard<T extends ElementType = "section">({
  as,
  className = "",
  ...props
}: SurfaceCardProps<T>) {
  const Component = as ?? "section";
  return <Component className={`rounded-2xl border border-[var(--nm-card-border)] bg-[var(--nm-surface)] ${className}`} {...props} />;
}

/**
 * Brand mark placeholder — renders the "N" letterform at two sizes.
 * Replace the inner content with an <img> when the final logo is ready;
 * the outer container dimensions and className stay the same.
 *
 * size="lg"  — 42×42px, used in the marketplace Listings header
 * size="sm"  — 36×36px, used in the Admin Dashboard header
 */
export function BrandMark({ size = "lg" }: { size?: "lg" | "sm" }) {
  const dim = size === "lg" ? "h-[42px] w-[42px]" : "h-9 w-9";
  const text = size === "lg" ? "text-lg font-extrabold tracking-tight" : "text-base font-bold";
  const shadow = size === "lg" ? " shadow-[0_8px_24px_rgba(22,134,200,0.18)]" : "";
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-xl bg-brand-500 text-white${shadow} ${dim} ${text}`}
    >
      N
    </span>
  );
}

type BackButtonProps = {
  label: string;
  onClick: () => void;
  children?: ReactNode;
  className?: string;
};

export const BackButton = forwardRef<HTMLButtonElement, BackButtonProps>(function BackButton({
  label,
  onClick,
  children,
  className = "",
}, ref) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-lg text-sm font-semibold text-[var(--nm-secondary)] hover:bg-[var(--nm-hover)] hover:text-brand-500 focus-visible:text-brand-500 focus-visible:outline-2 focus-visible:outline-brand-500 ${className}`}
    >
      <Icon name="chevron" className="h-5 w-5 rotate-180" />
      {children}
    </button>
  );
});

const iconPaths: Record<IconName, ReactNode> = {
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></>,
  filter: <path d="M4 7h16M7 12h10M10 17h4" />,
  list: <><rect x="4" y="5" width="16" height="14" rx="2" /><path d="M8 9h8M8 13h8M8 17h5" /></>,
  plus: <><circle cx="12" cy="12" r="8.5" /><path d="M12 8v8M8 12h8" /></>,
  profile: <><circle cx="12" cy="8" r="3.5" /><path d="M5.5 20c.7-3.6 3-5.5 6.5-5.5s5.8 1.9 6.5 5.5" /></>,
  send: <path d="m4 12 16-7-5.8 14-2.8-5.8L4 12Zm7.4 1.2L20 5" />,
  chevron: <path d="m9 6 6 6-6 6" />,
  home: <><path d="m3 10 9-7 9 7v10H3V10Z" /><path d="M9 20v-6h6v6" /></>,
  cube: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" /><path d="m12 12 8-4.5M12 12 4 7.5M12 12v9" /></>,
  image: <><rect x="3" y="4" width="18" height="16" rx="3" /><circle cx="8.5" cy="9" r="1.5" /><path d="m4 17 4.5-4.5 3.3 3.1 2.2-2.2 6 5" /></>,
  trash: <><path d="M4 7h16M9 3h6l1 4H8l1-4ZM7 7l1 14h8l1-14" /></>,
  close: <path d="m7 7 10 10M17 7 7 17" />,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" /></>,
  moon: <path d="M20.8 13A8.5 8.5 0 0 1 11 3.2 8.5 8.5 0 1 0 20.8 13Z" />,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
  dashboard: <><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="5" rx="1.5" /><rect x="13" y="10" width="8" height="11" rx="1.5" /><rect x="3" y="13" width="8" height="8" rx="1.5" /></>,
  refresh: <><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></>,
};

export function Icon({ name, className = "h-5 w-5" }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {iconPaths[name]}
    </svg>
  );
}

export function AppearanceControls({
  theme,
  onThemeChange,
  language,
  onLanguageChange,
  t,
}: {
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  language: Language;
  onLanguageChange: (language: Language) => void;
  t: Translator;
}) {
  const nextLanguage: Language = language === "en" ? "am" : "en";
  const isDark = theme === "dark";

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <button
        type="button"
        onClick={() => onLanguageChange(nextLanguage)}
        aria-label={t(language === "en" ? "switchToAmharic" : "switchToEnglish")}
        title={t(language === "en" ? "switchToAmharic" : "switchToEnglish")}
        className="flex h-9 min-w-9 items-center justify-center rounded-xl border border-[var(--nm-border)] bg-[var(--nm-surface)] px-1.5 text-[11px] font-bold text-[var(--nm-text)] transition-colors hover:bg-[var(--nm-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
      >
        {language === "en" ? "አማ" : "EN"}
      </button>
      <button
        type="button"
        role="switch"
        aria-label={t("darkMode")}
        aria-checked={isDark}
        onClick={() => onThemeChange(isDark ? "light" : "dark")}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--nm-border)] bg-[var(--nm-surface)] text-[var(--nm-text)] transition-colors hover:bg-[var(--nm-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
        title={isDark ? t("switchToLight") : t("switchToDark")}
      >
        <Icon name={isDark ? "sun" : "moon"} className="h-4 w-4" />
        <span className="sr-only">{isDark ? t("switchToLight") : t("switchToDark")}</span>
      </button>
    </div>
  );
}

export function BottomNavigation({
  activePage,
  onPageChange,
  t,
  adminMode = false,
}: {
  activePage: MainPage;
  onPageChange: (page: MainPage) => void;
  t: (key: TranslationKey) => string;
  adminMode?: boolean;
}) {
  const pages: { id: MainPage; label: TranslationKey; icon: IconName }[] = [
    ...(adminMode ? [{ id: "dashboard" as const, label: "dashboard" as const, icon: "dashboard" as const }] : []),
    { id: "listings", label: "listings", icon: "list" },
    { id: "post", label: "post", icon: "plus" },
    { id: "profile", label: "profile", icon: "profile" },
  ];

  return (
    <nav
      aria-label={t("mainNavigation")}
      className={`fixed inset-x-0 bottom-0 z-20 mx-auto grid h-[calc(72px+env(safe-area-inset-bottom))] w-full max-w-[390px] ${adminMode ? "grid-cols-4" : "grid-cols-3"} border-t border-[var(--nm-divider)] bg-[color-mix(in_srgb,var(--nm-surface)_94%,transparent)] px-[18px] pb-[env(safe-area-inset-bottom)] pt-[7px] backdrop-blur-lg`}
    >
      {pages.map(({ id, label, icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => onPageChange(id)}
          aria-current={activePage === id ? "page" : undefined}
          className={`relative flex flex-col items-center justify-center gap-[3px] rounded-[10px] text-[10.5px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-500 ${activePage === id ? "text-brand-500" : "text-[var(--nm-muted)]"}`}
        >
          {activePage === id && <span aria-hidden="true" className="absolute top-0 h-0.5 w-6 rounded-b-sm bg-brand-500" />}
          <Icon name={icon} className="h-[22px] w-[22px]" />
          <span>{t(label)}</span>
        </button>
      ))}
    </nav>
  );
}
