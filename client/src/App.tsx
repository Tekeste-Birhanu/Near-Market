import { useCallback, useEffect, useState } from "react";
import { ApiError } from "./api/client";
import { clearImageCache } from "./api/image-cache";
import { BottomNavigation, type MainPage, type Theme } from "./components/SharedUI";
import { usePreferences } from "./hooks/usePreferences";
import { ListingsPage } from "./pages/ListingsPage";
import { PostPage } from "./pages/PostPage";
import { ProfilePage } from "./pages/ProfilePage";
import { AdminDashboardPage } from "./pages/AdminDashboardPage";
import { AdminUsersPage } from "./pages/AdminUsersPage";
import {
  createSession,
  getTelegramInitData,
  readStoredSession,
  type Session,
  type SessionUser,
} from "./auth/session";

type AuthState =
  | { status: "loading" }
  | { status: "outside-telegram" }
  | { status: "error"; message: string }
  | { status: "authenticated"; session: Session };

export function DesignPreview({
  activePage,
  onPageChange,
  theme,
  onThemeChange,
  language,
  onLanguageChange,
  user,
  onUserChange,
  onListingPublished,
  newListingId,
  onNewListingOpened,
  postSuccessNotice,
  t,
  previewMode,
  adminMode,
}: {
  activePage: MainPage;
  onPageChange: (page: MainPage) => void;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  language: "en" | "am";
  onLanguageChange: (language: "en" | "am") => void;
  user: SessionUser | null;
  onUserChange: (user: SessionUser) => void;
  onListingPublished: (listingId: string) => void;
  newListingId: string | null;
  onNewListingOpened: () => void;
  postSuccessNotice: string;
  t: ReturnType<typeof usePreferences>["t"];
  previewMode: boolean;
  adminMode: boolean;
}) {
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [visitedPages, setVisitedPages] = useState<Set<MainPage>>(() => new Set([activePage]));

  const reportPageDirty = useCallback((dirty: boolean) => setHasUnsavedChanges(dirty), []);
  const handlePageChange = useCallback((page: MainPage) => {
    if ((activePage === "post" || activePage === "profile") && page !== activePage && hasUnsavedChanges && !window.confirm(t("discardListingChangesConfirm"))) return;
    if (activePage !== page) setHasUnsavedChanges(false);
    setVisitedPages((prev) => new Set(prev).add(page));
    onPageChange(page);
  }, [activePage, hasUnsavedChanges, onPageChange, t]);

  const handleListingPublished = useCallback((listingId: string) => {
    setVisitedPages((prev) => new Set(prev).add("listings"));
    onListingPublished(listingId);
  }, [onListingPublished]);

  return (
    <div className="mx-auto min-h-dvh w-full max-w-[390px] bg-[var(--nm-bg)] text-[var(--nm-text)]">
      {visitedPages.has("listings") && (
        <div hidden={activePage !== "listings"}>
          <ListingsPage theme={theme} onThemeChange={onThemeChange} language={language} onLanguageChange={onLanguageChange} t={t} previewMode={previewMode} onPost={() => handlePageChange("post")} newListingId={newListingId} onNewListingOpened={onNewListingOpened} adminMode={adminMode} />
        </div>
      )}
      {adminMode && visitedPages.has("dashboard") && (
        <div hidden={activePage !== "dashboard"}>
          <AdminDashboardPage theme={theme} onThemeChange={onThemeChange} language={language} onLanguageChange={onLanguageChange} t={t} isActive={activePage === "dashboard"} />
        </div>
      )}
      {adminMode && visitedPages.has("users") && (
        <div hidden={activePage !== "users"}>
          <AdminUsersPage theme={theme} onThemeChange={onThemeChange} language={language} onLanguageChange={onLanguageChange} t={t} isActive={activePage === "users"} currentUserId={user?.id} />
        </div>
      )}
      {visitedPages.has("post") && (
        <div hidden={activePage !== "post"}>
          <PostPage theme={theme} onThemeChange={onThemeChange} language={language} onLanguageChange={onLanguageChange} user={user} onDirtyChange={reportPageDirty} onPublished={handleListingPublished} t={t} />
        </div>
      )}
      {visitedPages.has("profile") && (
        <div hidden={activePage !== "profile"}>
          <ProfilePage theme={theme} onThemeChange={onThemeChange} language={language} onLanguageChange={onLanguageChange} user={user} onUserChange={onUserChange} onDirtyChange={reportPageDirty} t={t} />
        </div>
      )}
      {postSuccessNotice && <p role="status" className="fixed left-4 right-4 top-[max(12px,env(safe-area-inset-top))] z-[60] mx-auto max-w-[358px] rounded-xl bg-green-600 px-4 py-3 text-sm font-semibold text-white shadow-lg">{postSuccessNotice}</p>}
      <BottomNavigation activePage={activePage} onPageChange={handlePageChange} t={t} adminMode={adminMode} />
    </div>
  );
}

export function App() {
  const adminMode = new URLSearchParams(window.location.search).get("app") === "admin";
  const [auth, setAuth] = useState<AuthState>({ status: "loading" });
  const [activePage, setActivePage] = useState<MainPage>(adminMode ? "dashboard" : "listings");
  const [newListingId, setNewListingId] = useState<string | null>(null);
  const [postSuccessNotice, setPostSuccessNotice] = useState("");
  const { theme, setTheme, language, setLanguage, t } = usePreferences();
  const updateSessionUser = useCallback((user: SessionUser) => {
    setAuth((current) => current.status === "authenticated"
      ? { ...current, session: { ...current.session, user } }
      : current);
  }, []);
  const handleListingPublished = useCallback((listingId: string) => {
    setNewListingId(listingId);
    setActivePage("listings");
    setPostSuccessNotice(t("listingPublished"));
    window.setTimeout(() => setPostSuccessNotice(""), 3500);
  }, [t]);

  useEffect(() => {
    let active = true;

    async function authenticate() {
      const initData = getTelegramInitData();
      if (!initData) {
        if (active) setAuth({ status: "outside-telegram" });
        return;
      }

      const existingSession = readStoredSession();
      try {
        const session = await createSession(initData);
        if (active) {
          clearImageCache();
          setAuth({ status: "authenticated", session });
        }
      } catch (error) {
        if (!active) return;
        if (existingSession) {
          setAuth({ status: "authenticated", session: existingSession });
          return;
        }
        const message = error instanceof ApiError
          ? error.message
          : "Could not sign in. Reopen the Mini App in Telegram and try again.";
        setAuth({ status: "error", message });
      }
    }

    void authenticate();
    return () => { active = false; };
  }, []);

  if (import.meta.env.DEV && auth.status === "outside-telegram") {
    return (
      <DesignPreview
        activePage={activePage}
        onPageChange={setActivePage}
        theme={theme}
        onThemeChange={setTheme}
        language={language}
        onLanguageChange={setLanguage}
        user={null}
        onUserChange={updateSessionUser}
        onListingPublished={handleListingPublished}
        newListingId={newListingId}
        onNewListingOpened={() => setNewListingId(null)}
        postSuccessNotice={postSuccessNotice}
        t={t}
        previewMode
        adminMode={adminMode}
      />
    );
  }
  if (auth.status === "loading") {
    return <main className="p-6 text-center text-sm text-[var(--nm-muted)]" role="status">{t("signingIn")}</main>;
  }
  if (auth.status === "outside-telegram") {
    return <main className="p-6 text-center text-sm text-[var(--nm-muted)]">{t("openInTelegram")}</main>;
  }
  if (auth.status === "error") {
    return (
      <main className="space-y-2 p-6 text-center text-sm text-[var(--nm-muted)]" role="alert">
        <p className="font-semibold text-[var(--nm-text)]">{t("couldNotSignIn")}</p>
        <p>{auth.message}</p>
      </main>
    );
  }
  if (adminMode && !auth.session.user.isAdmin) {
    return <main className="p-6 text-center text-sm text-[var(--nm-muted)]" role="alert">{t("adminAccessRequired")}</main>;
  }
  return (
    <DesignPreview
      activePage={activePage}
      onPageChange={setActivePage}
      theme={theme}
      onThemeChange={setTheme}
      language={language}
      onLanguageChange={setLanguage}
      user={auth.status === "authenticated" ? auth.session.user : null}
      onUserChange={updateSessionUser}
      onListingPublished={handleListingPublished}
      newListingId={newListingId}
      onNewListingOpened={() => setNewListingId(null)}
      postSuccessNotice={postSuccessNotice}
      t={t}
      previewMode={false}
      adminMode={adminMode}
    />
  );
}

export default App;
