import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { Language, Translator } from "../i18n/translations";
import { AppearanceControls, BackButton, Icon, PageTitle, SurfaceCard, type Theme } from "../components/SharedUI";
import { apiImageRequest, apiRequest } from "../api/client";
import { deleteListing,
  fetchListingDetails,
  fetchMyListings,
  toCardListing,
  updateListing,
  updateListingStatus,
  type ListingDetails,
  type ListingSummary,
} from "../api/listings";
import { invalidateImages } from "../api/image-cache";
import { ListingImage } from "../components/ListingComponents";
import type { SessionUser } from "../auth/session";

type ProfilePageProps = {
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  language: Language;
  onLanguageChange: (language: Language) => void;
  t: Translator;
};


type ManagedListingType = "ITEM" | "HOUSE_RENTAL";
type EditorPhoto = { url: string; file?: File };

function ListingEditor({ listingId, t, onBack, onSaved, onDirtyChange }: {
  listingId: string;
  t: Translator;
  onBack: () => void;
  onSaved: (listing: ListingDetails) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [listing, setListing] = useState<ListingDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<NonNullable<ListingSummary["category"]>>("OTHER");
  const [condition, setCondition] = useState<NonNullable<ListingSummary["condition"]>>("USED");
  const [rentalAddress, setRentalAddress] = useState("");
  const [priceAmount, setPriceAmount] = useState("");
  const [contactForPrice, setContactForPrice] = useState(false);
  const [photos, setPhotos] = useState<EditorPhoto[]>([]);
  const [photosChanged, setPhotosChanged] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [photoError, setPhotoError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const objectUrls = useRef<string[]>([]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void fetchListingDetails(listingId).then((data) => {
      if (!active) return;
      setListing(data);
      setTitle(data.title);
      setDescription(data.description);
      if (data.category) setCategory(data.category);
      if (data.condition) setCondition(data.condition);
      setRentalAddress(data.rentalAddress ?? "");
      setPriceAmount(data.priceAmount ?? "");
      setContactForPrice(data.priceAmount === null);
      setPhotos(data.images.map((image) => ({ url: image.url.startsWith("/api/v1") ? image.url.slice("/api/v1".length) : image.url })));
    }).catch(() => { if (active) setLoadError(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [listingId]);

  useEffect(() => () => objectUrls.current.forEach((url) => URL.revokeObjectURL(url)), []);
  useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (!dirty) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [dirty]);

  function markDirty() {
    setDirty(true);
    setSaveError("");
  }

  function requestBack() {
    if (dirty && !window.confirm(t("discardListingChangesConfirm"))) return;
    onDirtyChange(false);
    onBack();
  }

  function choosePhotos(files: FileList | null) {
    if (!files) return;
    const selected = Array.from(files);
    if (photos.length + selected.length > 3) { setPhotoError(t("tooManyPhotos")); return; }
    if (selected.some((file) => file.size > 5 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type))) { setPhotoError(t("invalidPhoto")); return; }
    const additions = selected.map((file) => {
      const url = URL.createObjectURL(file);
      objectUrls.current.push(url);
      return { file, url };
    });
    setPhotos((current) => [...current, ...additions]);
    setPhotosChanged(true);
    setPhotoError("");
    markDirty();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!listing) return;
    const nextErrors: Record<string, string> = {};
    if (listing.type === "ITEM" && !title.trim()) nextErrors.title = t("fieldRequired");
    if (!description.trim()) nextErrors.description = t("fieldRequired");
    if (listing.type === "HOUSE_RENTAL" && !rentalAddress.trim()) nextErrors.rentalAddress = t("fieldRequired");
    if (!contactForPrice && (!priceAmount.trim() || !/^\d{1,10}(?:\.\d{1,2})?$/.test(priceAmount) || Number(priceAmount) < 0)) nextErrors.priceAmount = t("fieldRequired");
    if (photosChanged && photos.length === 0) setPhotoError(t("keepAtLeastOnePhoto"));
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length || photosChanged && photos.length === 0) return;

    setSaving(true);
    setSaveError("");
    try {
      const images = photosChanged ? await Promise.all(photos.map(async (photo, index) => {
        if (photo.file) return photo.file;
        const imagePath = photo.url;
        const blob = await apiImageRequest(imagePath);
        return new File([blob], `photo-${index + 1}.webp`, { type: blob.type || "image/webp" });
      })) : [];
      const listingFields = listing.type === "ITEM"
        ? { type: listing.type, title: title.trim(), description: description.trim(), category, condition }
        : { type: listing.type, description: description.trim(), rentalAddress: rentalAddress.trim() };
      const updated = await updateListing(listing.id, {
        ...listingFields,
        priceAmount: contactForPrice ? "" : priceAmount.trim(),
        images,
      });
      setDirty(false);
      onDirtyChange(false);
      onSaved(updated);
    } catch {
      setSaveError(t("listingSaveFailed"));
    } finally {
      setSaving(false);
    }
  }

  const fieldClass = "h-10 w-full rounded-xl border border-[var(--nm-border)] bg-[var(--nm-surface)] px-3 text-sm text-[var(--nm-text)] outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";
  const labelClass = "block space-y-2 text-xs font-semibold text-[var(--nm-secondary)]";
  return (
    <section aria-labelledby="edit-listing-heading">
      <div className="mb-3 flex items-center gap-1">
        <BackButton label={t("back")} onClick={requestBack} className="-ml-2 h-9 w-9 justify-center p-0" />
        <h2 id="edit-listing-heading" className="text-base font-semibold">{t("editListing")}</h2>
      </div>
      {loading ? <p role="status" className="py-5 text-sm text-[var(--nm-muted)]">{t("loadingDetails")}</p> : loadError || !listing ? <p role="alert" className="py-5 text-sm text-red-600">{t("detailsLoadFailed")}</p> : <>
        <form ref={formRef} onSubmit={(event) => void submit(event)} noValidate className="space-y-3 pb-[calc(160px+env(safe-area-inset-bottom))]">
          {listing.type === "ITEM" && <label className={labelClass}><span>{t("itemTitle")}</span><input value={title} maxLength={120} onChange={(event) => { setTitle(event.target.value); markDirty(); }} aria-invalid={Boolean(errors.title)} className={fieldClass} />{errors.title && <span className="text-xs font-normal text-red-500">{errors.title}</span>}</label>}
          <label className={labelClass}><span>{t("itemDescription")}</span><textarea value={description} maxLength={5000} rows={4} onChange={(event) => { setDescription(event.target.value); markDirty(); }} aria-invalid={Boolean(errors.description)} className={`${fieldClass} h-auto min-h-24 resize-none py-2.5`} />{errors.description && <span className="text-xs font-normal text-red-500">{errors.description}</span>}</label>
          {listing.type === "ITEM" ? <>
            <label className={labelClass}><span>{t("category")}</span><select value={category} onChange={(event) => { setCategory(event.target.value as typeof category); markDirty(); }} className={fieldClass}><option value="ELECTRONICS">{t("electronics")}</option><option value="CLOTHING">{t("clothing")}</option><option value="OTHER">{t("other")}</option></select></label>
            <label className={labelClass}><span>{t("condition")}</span><select value={condition} onChange={(event) => { setCondition(event.target.value as typeof condition); markDirty(); }} className={fieldClass}><option value="NEW">{t("new")}</option><option value="USED">{t("used")}</option></select></label>
          </> : <label className={labelClass}><span>{t("rentalAddress")}</span><textarea value={rentalAddress} maxLength={300} rows={2} onChange={(event) => { setRentalAddress(event.target.value); markDirty(); }} aria-invalid={Boolean(errors.rentalAddress)} className={`${fieldClass} h-auto min-h-16 resize-none py-2.5`} />{errors.rentalAddress && <span className="text-xs font-normal text-red-500">{errors.rentalAddress}</span>}</label>}
          <fieldset className="space-y-2"><legend className="text-xs font-semibold text-[var(--nm-secondary)]">{t("price")}</legend>
            <div className="grid grid-cols-2 gap-2">{[
              { contact: false, label: t("setPrice") },
              { contact: true, label: t("contactForPrice") },
            ].map((option) => <label key={option.contact ? "contact" : "set-price"} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-[var(--nm-border)] bg-[var(--nm-surface)] px-3 text-sm text-[var(--nm-text)] transition-colors hover:bg-[var(--nm-hover)] has-[:checked]:border-brand-500 has-[:checked]:bg-[var(--nm-accent-soft)] has-[:checked]:text-[var(--nm-accent-text)] focus-within:ring-2 focus-within:ring-brand-500/20"><input type="radio" name={`edit-pricing-mode-${listing.id}`} value={option.contact ? "contact" : "set-price"} checked={contactForPrice === option.contact} onChange={() => { setContactForPrice(option.contact); if (option.contact) setErrors((current) => ({ ...current, priceAmount: "" })); markDirty(); }} className="h-4 w-4 shrink-0 accent-brand-500" /><span className="leading-5">{option.label}</span></label>)}</div>
            {!contactForPrice && <label className={labelClass}><span>{t(listing.type === "ITEM" ? "priceAmountLabel" : "monthlyPriceLabel")}</span><input type="number" min="0" max="9999999999.99" step="0.01" inputMode="decimal" value={priceAmount} onChange={(event) => { setPriceAmount(event.target.value); markDirty(); }} placeholder={t("enterPrice")} aria-invalid={Boolean(errors.priceAmount)} className={fieldClass} />{errors.priceAmount && <span className="text-xs font-normal text-red-500">{errors.priceAmount}</span>}</label>}
          </fieldset>
          <section aria-labelledby="edit-photos-heading" className="space-y-2"><h3 id="edit-photos-heading" className="text-xs font-semibold text-[var(--nm-secondary)]">{t("itemPhotos")}</h3><p className="text-xs text-[var(--nm-muted)]">{t("editPhotosHint")}</p>
            {photos.length > 0 && <div className="grid grid-cols-3 gap-2">{photos.map((photo, index) => <div key={`${photo.url}-${index}`} className="relative aspect-square overflow-hidden rounded-xl bg-[var(--nm-surface-subtle)]"><ListingImage url={photo.url} alt={t("photoNumber", String(index + 1))} className="h-full w-full object-cover" t={t} /><button type="button" onClick={() => { setPhotos((current) => current.filter((_, photoIndex) => photoIndex !== index)); setPhotosChanged(true); setPhotoError(""); markDirty(); }} aria-label={t("removePhoto", String(index + 1))} className="absolute right-1 top-1 rounded-full bg-black/70 px-2 py-1 text-[10px] font-semibold text-white">×</button></div>)}</div>}
            {photos.length < 3 && <label className="flex h-10 cursor-pointer items-center justify-center rounded-xl border border-dashed border-[var(--nm-border)] px-3 text-sm font-semibold text-brand-500"><span>{t("addPhotos")}</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => { choosePhotos(event.target.files); event.currentTarget.value = ""; }} className="sr-only" /></label>}
            {photoError && <p role="alert" className="text-xs text-red-500">{photoError}</p>}
          </section>
          {saveError && <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600">{saveError}</p>}
        </form>
        <button type="button" onClick={() => formRef.current?.requestSubmit()} disabled={saving} className="fixed bottom-[calc(72px+env(safe-area-inset-bottom))] left-4 right-4 z-10 mx-auto flex h-11 max-w-[358px] items-center justify-center rounded-xl bg-[var(--nm-action)] px-4 text-sm font-semibold text-white disabled:opacity-60">{saving ? t("savingListing") : t("saveListing")}</button>
      </>}
    </section>
  );
}

function MyListingsPanel({ userId, t, onDirtyChange }: { userId: string; t: Translator; onDirtyChange: (dirty: boolean) => void }) {
  const [type, setType] = useState<ManagedListingType>("ITEM");
  const [listings, setListings] = useState<ListingSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [retry, setRetry] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const swipeStart = useRef<{ x: number; y: number; blocked: boolean } | null>(null);

  useEffect(() => {
    if (!notice) return;
    const timeoutId = window.setTimeout(() => setNotice(""), 3500);
    return () => window.clearTimeout(timeoutId);
  }, [notice]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void fetchMyListings({ type }, controller.signal).then((response) => {
      setListings(response.items);
      setCursor(response.nextCursor);
    }).catch(() => { if (!controller.signal.aborted) setError(t("myListingsLoadFailed")); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [type, retry, t]);

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const response = await fetchMyListings({ type, cursor });
      setListings((current) => [...current, ...response.items]);
      setCursor(response.nextCursor);
    } catch {
      setError(t("myListingsLoadFailed"));
    } finally { setLoadingMore(false); }
  }

  async function changeStatus(listing: ListingSummary) {
    const nextStatus = listing.status === "AVAILABLE" ? listing.type === "ITEM" ? "SOLD" : "UNAVAILABLE" : "AVAILABLE";
    setWorkingId(listing.id);
    setError("");
    setNotice("");
    try {
      const updated = await updateListingStatus(listing.id, nextStatus);
      setListings((current) => current.map((entry) => entry.id === listing.id ? { ...entry, status: updated.status } : entry));
      setNotice(t("statusUpdated"));
    } catch { setError(t("statusUpdateFailed")); }
    finally { setWorkingId(null); }
  }

  async function removeListing(listing: ListingSummary) {
    if (!window.confirm(t("confirmDeleteListing"))) return;
    setWorkingId(listing.id);
    setError("");
    setNotice("");
    try {
      await deleteListing(listing.id);
      invalidateImages(listing.images.map((img) => img.url.replace(/^\/api\/v1/, "")));
      setListings((current) => current.filter((entry) => entry.id !== listing.id));
      setNotice(t("listingDeleted"));
    } catch { setError(t("listingDeleteFailed")); }
    finally { setWorkingId(null); }
  }

  if (editingId) return <ListingEditor
    key={editingId}
    listingId={editingId}
    t={t}
    onDirtyChange={onDirtyChange}
    onBack={() => { setEditingId(null); onDirtyChange(false); }}
    onSaved={(updated) => {
      setListings((current) => current.map((entry) => entry.id === updated.id ? updated : entry));
      setEditingId(null);
      setNotice(t("listingSaved"));
      onDirtyChange(false);
    }}
  />;

  return <section
    className="-mx-4 mt-4 flex-1 touch-pan-y px-4"
    aria-labelledby="my-listings-heading"
    onTouchStart={(event) => {
      const touch = event.touches[0];
      if (!touch) return;
      const target = event.target instanceof Element ? event.target : null;
      swipeStart.current = {
        x: touch.clientX,
        y: touch.clientY,
        blocked: Boolean(target?.closest("button:not([role='tab']), input, select, textarea, a, [role='listbox'], [role='option']")),
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
      setType(deltaX < 0 ? "HOUSE_RENTAL" : "ITEM");
    }}
    onTouchCancel={() => { swipeStart.current = null; }}
  >
    <h2 id="my-listings-heading" className="mb-3 text-base font-semibold">{t("myListings")}</h2>
    <nav role="tablist" aria-label={t("myListings")} className="mb-4 flex border-b border-[var(--nm-divider)]">
      {(["ITEM", "HOUSE_RENTAL"] as const).map((listingType) => <button key={listingType} type="button" role="tab" aria-selected={type === listingType} onClick={() => setType(listingType)} className={`relative h-10 flex-1 text-sm font-semibold ${type === listingType ? "text-brand-500" : "text-[var(--nm-muted)]"}`}>
        {t(listingType === "ITEM" ? "itemsTab" : "rentalsTab")}{type === listingType && <span aria-hidden="true" className="absolute inset-x-5 bottom-0 h-0.5 bg-brand-500" />}
      </button>)}
    </nav>
    {notice && <p role="status" className="mb-3 text-sm text-green-700">{notice}</p>}
    {error && <div className="mb-3 flex items-center justify-between gap-3"><p role="alert" className="text-sm text-red-600">{error}</p><button type="button" onClick={() => setRetry((value) => value + 1)} className="text-xs font-semibold text-brand-500">{t("retry")}</button></div>}
    {loading ? <p role="status" className="py-8 text-center text-sm text-[var(--nm-muted)]">{t("loadingListings")}</p> : listings.length === 0 ? <p className="rounded-xl bg-[var(--nm-surface)] px-4 py-6 text-center text-sm text-[var(--nm-secondary)]">{t("noMyListings")}</p> : <div className="space-y-3">
      {listings.map((listing) => {
        const card = toCardListing(listing);
        const statusLabel = listing.status === "AVAILABLE" ? t("available") : t(listing.status === "SOLD" ? "sold" : "unavailable");
        const imagePath = listing.images[0]?.url.replace(/^\/api\/v1/, "") ?? "";
        return <SurfaceCard as="article" key={listing.id} className="p-3">
          <div className="flex gap-3">
            <ListingImage url={imagePath} alt={listing.title} className="h-24 w-24 shrink-0 rounded-xl object-cover" t={t} />
            <div className="min-w-0 flex-1">
              <h3 className="line-clamp-2 text-sm font-bold text-[var(--nm-text)]">{listing.type === "ITEM" ? listing.title : t("houseRental")}</h3>
              <p className="mt-1 text-sm font-bold">{card.price === null ? t("contactForPrice") : `ETB ${card.price.toLocaleString("en-ET")}`}{listing.type === "HOUSE_RENTAL" && <span className="ml-1 text-xs font-medium text-[var(--nm-muted)]">{t("month")}</span>}</p>
              <p className="mt-1 text-xs text-[var(--nm-secondary)]">{t("listingStatus")}: {statusLabel}</p>
            </div>
          </div>
          {listing.type === "HOUSE_RENTAL" && listing.rentalAddress && <p className="mt-2 line-clamp-2 text-xs text-[var(--nm-secondary)]">{listing.rentalAddress}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => setEditingId(listing.id)} disabled={workingId === listing.id} className="h-9 rounded-lg border border-[var(--nm-border)] px-3 text-xs font-semibold text-[var(--nm-text)]">{t("editListing")}</button>
            <button type="button" onClick={() => void changeStatus(listing)} disabled={workingId === listing.id} className="h-9 rounded-lg bg-[var(--nm-accent-soft)] px-3 text-xs font-semibold text-[var(--nm-accent-text)]">{listing.status === "AVAILABLE" ? t(listing.type === "ITEM" ? "markSold" : "markUnavailable") : t("markAvailable")}</button>
            <button type="button" onClick={() => void removeListing(listing)} disabled={workingId === listing.id} className="h-9 rounded-lg border border-[var(--nm-border)] px-3 text-xs font-semibold text-red-600">{t("deleteListing")}</button>
          </div>
        </SurfaceCard>;
      })}
      {cursor && <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className="h-10 w-full rounded-xl border border-[var(--nm-border)] text-sm font-semibold text-brand-500 disabled:opacity-60">{loadingMore ? t("loadingListings") : t("loadMoreMyListings")}</button>}
    </div>}
  </section>;
}

export function ProfilePage({ theme, onThemeChange, language, onLanguageChange, t, user, onUserChange, onDirtyChange }: ProfilePageProps & {
  user: SessionUser | null;
  onUserChange: (user: SessionUser) => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [profile, setProfile] = useState<SessionUser | null>(user);
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [phoneNumber, setPhoneNumber] = useState(user?.phoneNumber ?? "");
  const [loading, setLoading] = useState(Boolean(user));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [managedListingsDirty, setManagedListingsDirty] = useState(false);
  const reportDirty = useCallback((dirty: boolean) => onDirtyChange?.(dirty), [onDirtyChange]);
  const reportManagedDirty = useCallback((dirty: boolean) => {
    setManagedListingsDirty(dirty);
    reportDirty(dirty);
  }, [reportDirty]);
  const settingsDirty = Boolean(profile && (displayName !== profile.displayName || phoneNumber !== (profile.phoneNumber ?? "")));

  useEffect(() => {
    if (!notice) return;
    const timeoutId = window.setTimeout(() => setNotice(""), 3500);
    return () => window.clearTimeout(timeoutId);
  }, [notice]);

  useEffect(() => {
    if (showSettings) reportDirty(settingsDirty);
  }, [showSettings, reportDirty, settingsDirty]);

  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!settingsDirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [settingsDirty]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    setLoading(true);
    apiRequest<SessionUser>("/me")
      .then((current) => {
        if (!active) return;
        setProfile(current);
        setDisplayName(current.displayName);
        setPhoneNumber(current.phoneNumber ?? "");
        onUserChange(current);
        setError("");
      })
      .catch(() => { if (active) setError(t("profileLoadFailed")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user?.id]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const updated = await apiRequest<SessionUser>("/me", {
        method: "PATCH",
        body: JSON.stringify({ displayName, phoneNumber: phoneNumber.trim() || null }),
      });
      setProfile(updated);
      setDisplayName(updated.displayName);
      setPhoneNumber(updated.phoneNumber ?? "");
      onUserChange(updated);
      reportDirty(false);
      setNotice(t("profileSaved"));
    } catch {
      setError(t("profileSaveFailed"));
    } finally {
      setSaving(false);
    }
  }

  function toggleSettings() {
    if (showSettings) {
      if (settingsDirty && !window.confirm(t("discardListingChangesConfirm"))) return;
      if (settingsDirty && profile) {
        setDisplayName(profile.displayName);
        setPhoneNumber(profile.phoneNumber ?? "");
      }
      reportDirty(false);
      setShowSettings(false);
      return;
    }

    if (managedListingsDirty && !window.confirm(t("discardListingChangesConfirm"))) return;
    reportDirty(false);
    setManagedListingsDirty(false);
    setShowSettings(true);
  }

  const profileInitials = (profile?.displayName ?? user?.displayName ?? "Near Market")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase())
    .join("") || "NM";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[390px] flex-col bg-[var(--nm-page)] px-4 pb-28 pt-0">
      <header className="-mx-4 flex min-h-[64px] items-center justify-between gap-3 bg-[var(--nm-header)] px-5 pb-1 pt-[max(6px,env(safe-area-inset-top))]">
        <PageTitle icon="profile" title={t("profile")} />
        <AppearanceControls theme={theme} onThemeChange={onThemeChange} language={language} onLanguageChange={onLanguageChange} t={t} />
      </header>
      <SurfaceCard className="mt-4 flex items-center gap-3 p-3" aria-label={t("profile")}>
        <div aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-500 text-xs font-bold text-white">{profileInitials}</div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-[var(--nm-text)]">{profile?.displayName ?? user?.displayName ?? t("profile")}</h2>
          <p className="mt-1 text-xs leading-4 text-[var(--nm-secondary)]">{profile?.telegramUsername ? `@${profile.telegramUsername}` : t("myListings")}</p>
        </div>
        <button type="button" onClick={toggleSettings} aria-label={t(showSettings ? "profile" : "settings")} aria-pressed={showSettings} className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--nm-border)] text-[var(--nm-muted)] transition-colors hover:bg-[var(--nm-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${showSettings ? "bg-[var(--nm-accent-soft)] text-[var(--nm-accent-text)]" : "bg-[var(--nm-hover)]"}`}>
          <Icon name="settings" className="h-5 w-5" />
        </button>
      </SurfaceCard>
      {showSettings ? <section className="mt-4" aria-labelledby="profile-settings-heading">
        <div className="mb-3 flex items-center justify-between gap-3">
          <BackButton label={t("myListings")} onClick={toggleSettings} className="h-9 pr-2">{t("myListings")}</BackButton>
          <h2 id="profile-settings-heading" className="text-base font-semibold">{t("settings")}</h2>
        </div>
        {!user ? (
          <p className="mt-3 text-sm text-[var(--nm-secondary)]">{t("openTelegramToEdit")}</p>
        ) : loading ? (
          <p className="mt-3 text-sm text-[var(--nm-muted)]" role="status">{t("loadingProfile")}</p>
        ) : (
        <form className="mt-4 space-y-3" onSubmit={saveProfile}>
          <label className="block space-y-2 text-xs font-semibold text-[var(--nm-secondary)]">
            <span>{t("displayName")}</span>
            <input required maxLength={80} value={displayName} onChange={(event) => setDisplayName(event.target.value)} className="h-10 w-full rounded-xl border border-[var(--nm-border)] bg-[var(--nm-surface)] px-3 text-sm font-normal text-[var(--nm-text)] outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20" />
          </label>
          <label className="block space-y-2 text-xs font-semibold text-[var(--nm-secondary)]">
            <span>{t("telegramUsername")}</span>
            <input value={profile?.telegramUsername ? `@${profile.telegramUsername}` : "—"} readOnly className="h-10 w-full rounded-xl border border-[var(--nm-border)] bg-[var(--nm-hover)] px-3 text-sm font-normal text-[var(--nm-muted)]" />
          </label>
          <label className="block space-y-2 text-xs font-semibold text-[var(--nm-secondary)]">
            <span>{t("phoneNumber")}</span>
            <input type="tel" maxLength={32} value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} aria-describedby="profile-phone-hint" className="h-10 w-full rounded-xl border border-[var(--nm-border)] bg-[var(--nm-surface)] px-3 text-sm font-normal text-[var(--nm-text)] outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20" />
            <span id="profile-phone-hint" className="block font-normal">{t("phoneOptional")}</span>
          </label>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          {notice && <p role="status" className="text-sm text-green-600">{notice}</p>}
          <button type="submit" disabled={saving || !displayName.trim()} className="flex h-10 w-full items-center justify-center rounded-xl bg-[var(--nm-action)] px-4 text-sm font-semibold text-white hover:bg-[var(--nm-action-hover)] disabled:opacity-60">
            {saving ? t("saving") : t("saveChanges")}
          </button>
        </form>
        )}
      </section> : !user ? (
        <section className="mt-4" aria-labelledby="my-listings-heading">
          <h2 id="my-listings-heading" className="mb-3 text-base font-semibold">{t("myListings")}</h2>
          <p className="text-sm text-[var(--nm-secondary)]">{t("openTelegramToEdit")}</p>
        </section>
      ) : (
        <MyListingsPanel userId={user.id} t={t} onDirtyChange={reportManagedDirty} />
      )}
    </main>
  );
}
