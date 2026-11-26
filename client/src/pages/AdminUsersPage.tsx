import { useEffect, useState } from "react";
import { apiRequest } from "../api/client";
import { AppearanceControls, Icon, PageTitle, SurfaceCard, type Theme } from "../components/SharedUI";
import type { Language, Translator } from "../i18n/translations";

type AdminUser = {
  id: string;
  displayName: string;
  telegramUsername: string | null;
  isBlocked: boolean;
  createdAt: string;
};
type UserPage = { items: AdminUser[]; nextCursor: string | null };
type UserFilter = "all" | "active" | "blocked";

export function AdminUsersPage({
  theme, onThemeChange, language, onLanguageChange, t, isActive, currentUserId,
}: {
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  language: Language;
  onLanguageChange: (language: Language) => void;
  t: Translator;
  isActive?: boolean;
  currentUserId?: string;
}) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filter, setFilter] = useState<UserFilter>("all");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [busyUser, setBusyUser] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!isActive) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ filter, limit: "20" });
    if (debouncedSearch) params.set("search", debouncedSearch);
    setStatus("loading");
    setError("");
    setUsers([]);
    setNextCursor(null);
    void apiRequest<UserPage>(`/admin/users?${params}`, { signal: controller.signal })
      .then((result) => {
        setUsers(result.items);
        setNextCursor(result.nextCursor);
        setStatus("ready");
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : t("usersLoadFailed"));
        setStatus("error");
      });
    return () => controller.abort();
  }, [debouncedSearch, filter, isActive, retry, t]);

  const loadMore = async () => {
    if (!nextCursor || status === "loading") return;
    setStatus("loading");
    setError("");
    const params = new URLSearchParams({ filter, limit: "20", cursor: nextCursor });
    if (debouncedSearch) params.set("search", debouncedSearch);
    try {
      const result = await apiRequest<UserPage>(`/admin/users?${params}`);
      setUsers((current) => [...current, ...result.items]);
      setNextCursor(result.nextCursor);
      setStatus("ready");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("usersLoadFailed"));
      setStatus("error");
    }
  };

  const setUserBlocked = async (user: AdminUser, blocked: boolean) => {
    if (blocked && !window.confirm(t("confirmBlockUser", user.telegramUsername ? `@${user.telegramUsername}` : user.displayName))) return;
    setBusyUser(user.id);
    setError("");
    setNotice("");
    try {
      await apiRequest<void>(`/admin/users/${user.id}/${blocked ? "block" : "unblock"}`, { method: "POST" });
      setNotice(t(blocked ? "userBlocked" : "userUnblocked"));
      setRetry((value) => value + 1);
    } catch {
      setError(t("userActionFailed"));
    } finally {
      setBusyUser(null);
    }
  };

  const filters: Array<{ id: UserFilter; label: string }> = [
    { id: "all", label: t("allUsers") },
    { id: "active", label: t("activeUsers") },
    { id: "blocked", label: t("blockedUsers") },
  ];

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[390px] flex-col bg-[var(--nm-page)] px-4 pb-28 text-[var(--nm-text)]">
      <header className="-mx-4 flex min-h-[64px] items-center justify-between gap-3 bg-[var(--nm-header)] px-5 pb-1 pt-[max(6px,env(safe-area-inset-top))]">
        <PageTitle icon="users" title={t("usersTab")} />
        <AppearanceControls theme={theme} onThemeChange={onThemeChange} language={language} onLanguageChange={onLanguageChange} t={t} />
      </header>

      <section className="pt-4" aria-label={t("usersTab")} aria-busy={status === "loading"}>
        <label className="relative block">
          <span className="sr-only">{t("searchUsers")}</span>
          <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--nm-muted)]" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} maxLength={100} type="search" placeholder={t("searchUsers")} className="h-11 w-full rounded-[14px] border border-[var(--nm-border)] bg-[var(--nm-surface)] pl-11 pr-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20" />
        </label>
        <div className="mt-3 grid grid-cols-3 gap-1 rounded-xl bg-[var(--nm-hover)] p-1" role="group" aria-label={t("usersTab")}>
          {filters.map((item) => <button key={item.id} type="button" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)} className={`min-h-9 rounded-lg px-2 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-brand-500 ${filter === item.id ? "bg-[var(--nm-surface)] text-brand-500 shadow-sm" : "text-[var(--nm-secondary)]"}`}>{item.label}</button>)}
        </div>

        {notice && <p role="status" className="mt-3 rounded-xl bg-green-500/10 px-3 py-2 text-xs text-green-700 dark:text-green-300">{notice}</p>}
        {error && <div role="alert" className="mt-4 rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-sm"><p>{status === "error" ? t("usersLoadFailed") : error}</p>{status === "error" && <button type="button" onClick={() => setRetry((value) => value + 1)} className="mt-2 font-semibold text-brand-500">{t("retry")}</button>}</div>}
        {status === "loading" && users.length === 0 && <div role="status" aria-label={t("loadingUsers")} className="mt-3 space-y-2">
          {[0, 1, 2].map((key) => <SurfaceCard key={key} as="div" aria-hidden="true" className="flex h-[82px] items-center gap-3 p-3"><div className="animate-shimmer h-9 w-9 rounded-full bg-[var(--nm-hover)]" /><div className="flex-1 space-y-2"><div className="animate-shimmer h-3 w-2/3 rounded bg-[var(--nm-hover)]" /><div className="animate-shimmer h-3 w-1/2 rounded bg-[var(--nm-hover)]" /></div><div className="animate-shimmer h-7 w-7 rounded-lg bg-[var(--nm-hover)]" /></SurfaceCard>)}
        </div>}
        {status === "ready" && users.length === 0 && <p className="py-8 text-center text-sm text-[var(--nm-muted)]">{t("noUsersFound")}</p>}
        <ul className="mt-3 space-y-2">
          {users.map((user) => <li key={user.id}>
            <SurfaceCard as="article" className="flex items-center gap-2.5 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{user.displayName}</p>
                <p className="truncate text-xs text-[var(--nm-muted)]">{user.telegramUsername ? `@${user.telegramUsername}` : t("usernameUnavailable")} · {t("joined")} {new Date(user.createdAt).toLocaleDateString(language === "am" ? "am-ET" : "en-US")}</p>
                <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${user.isBlocked ? "bg-red-500/10 text-red-600 dark:text-red-300" : "bg-green-500/10 text-green-700 dark:text-green-300"}`}>{t(user.isBlocked ? "blockedUsers" : "activeUsers")}</span>
              </div>
              {user.id !== currentUserId && <details className="relative shrink-0">
                <summary role="button" aria-label={t("manageUserActions")} className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-lg text-[var(--nm-secondary)] hover:bg-[var(--nm-hover)] focus-visible:outline-2 focus-visible:outline-brand-500"><span aria-hidden="true">•••</span></summary>
                <div className="absolute right-0 top-10 z-10 min-w-32 rounded-xl border border-[var(--nm-border)] bg-[var(--nm-surface)] p-1 shadow-lg">
                  <button type="button" disabled={busyUser === user.id} onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); void setUserBlocked(user, !user.isBlocked); }} className="w-full rounded-lg px-3 py-2 text-left text-xs font-semibold hover:bg-[var(--nm-hover)] disabled:opacity-50">{t(user.isBlocked ? "unblockUser" : "blockUser")}</button>
                </div>
              </details>}
            </SurfaceCard>
          </li>)}
        </ul>
        {nextCursor && <button type="button" onClick={() => void loadMore()} disabled={status === "loading"} className="mt-3 min-h-10 w-full rounded-xl border border-[var(--nm-border)] bg-[var(--nm-surface)] text-sm font-semibold text-brand-500 disabled:opacity-50">{status === "loading" ? t("loadingUsers") : t("loadMore")}</button>}
      </section>
    </main>
  );
}
