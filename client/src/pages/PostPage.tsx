import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { Language, Translator } from "../i18n/translations";
import { AppearanceControls, BackButton, Icon, SurfaceCard, type Theme } from "../components/SharedUI";
import { FilterDropdown } from "../components/ListingComponents";
import { apiImageRequest, apiRequest } from "../api/client";
import { createHouseRentalListing, createItemListing } from "../api/listings";
import type { SessionUser } from "../auth/session";

type PostPageProps = {
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  language: Language;
  onLanguageChange: (language: Language) => void;
  t: Translator;
};

const POST_RULES_SEEN_PREFIX = "near-market.post-rules-seen.";


type PostListingType = "item" | "house-rental";

type ItemDraft = {
  title: string;
  description: string;
  category: "" | "ELECTRONICS" | "CLOTHING" | "OTHER";
  condition: "" | "NEW" | "USED";
  priceAmount: string;
  contactForPrice: boolean;
};

const emptyItemDraft: ItemDraft = {
  title: "",
  description: "",
  category: "",
  condition: "",
  priceAmount: "",
  contactForPrice: false,
};

function readItemDraft(userId: string): ItemDraft {
  try {
    const stored = window.sessionStorage.getItem(`near-market.item-draft.${userId}`);
    if (!stored) return emptyItemDraft;
    const candidate: unknown = JSON.parse(stored);
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return emptyItemDraft;
    const record = candidate as Record<string, unknown>;
    return {
      title: typeof record.title === "string" ? record.title.slice(0, 120) : "",
      description: typeof record.description === "string" ? record.description.slice(0, 5000) : "",
      category: record.category === "ELECTRONICS" || record.category === "CLOTHING" || record.category === "OTHER" ? record.category : "",
      condition: record.condition === "NEW" || record.condition === "USED" ? record.condition : "",
      priceAmount: typeof record.priceAmount === "string" ? record.priceAmount.slice(0, 13) : "",
      contactForPrice: record.contactForPrice === true,
    };
  } catch {
    return emptyItemDraft;
  }
}

function ItemListingForm({ userId, t, onDirtyChange, onPublished, onBack }: {
  userId: string;
  t: Translator;
  onDirtyChange: (dirty: boolean) => void;
  onPublished: (listingId: string) => void;
  onBack: () => void;
}) {
  const [draft, setDraft] = useState<ItemDraft>(() => readItemDraft(userId));
  const [images, setImages] = useState<File[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [imageError, setImageError] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [success, setSuccess] = useState("");
  const [showDiscard, setShowDiscard] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const isDirty = Boolean(draft.title || draft.description || draft.category || draft.condition || draft.priceAmount || draft.contactForPrice || images.length);
  const imageUrls = useMemo(() => images.map((file) => URL.createObjectURL(file)), [images]);

  useEffect(() => {
    onDirtyChange(isDirty);
    try {
      window.sessionStorage.setItem(`near-market.item-draft.${userId}`, JSON.stringify(draft));
    } catch {
      // The current component state still preserves the draft for this visit.
    }
    return () => onDirtyChange(false);
  }, [draft, images, isDirty, onDirtyChange, userId]);

  useEffect(() => () => imageUrls.forEach((url) => URL.revokeObjectURL(url)), [imageUrls]);

  useEffect(() => {
    if (!isDirty) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [isDirty]);

  function updateDraft<K extends keyof ItemDraft>(key: K, value: ItemDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: "" }));
    setSubmitError("");
    setSuccess("");
  }

  function chooseImages(files: FileList | null) {
    if (!files) return;
    const selected = Array.from(files);
    if (images.length + selected.length > 3) {
      setImageError(t("tooManyPhotos"));
      return;
    }
    if (selected.some((file) => file.size > 5 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type))) {
      setImageError(t("invalidPhoto"));
      return;
    }
    setImages((current) => [...current, ...selected]);
    setImageError("");
    setSubmitError("");
  }

  function confirmDiscard() {
    setDraft(emptyItemDraft);
    setImages([]);
    setErrors({});
    setImageError("");
    setSubmitError("");
    try { window.sessionStorage.removeItem(`near-market.item-draft.${userId}`); } catch { /* ignore storage failure */ }
    onDirtyChange(false);
    onBack();
  }

  function requestBack() {
    if (isDirty) setShowDiscard(true);
    else onBack();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!draft.title.trim()) nextErrors.title = t("fieldRequired");
    if (!draft.description.trim()) nextErrors.description = t("fieldRequired");
    if (!draft.category) nextErrors.category = t("fieldRequired");
    if (!draft.condition) nextErrors.condition = t("fieldRequired");
    if (!draft.contactForPrice && (!draft.priceAmount.trim() || !/^\d{1,10}(?:\.\d{1,2})?$/.test(draft.priceAmount) || Number(draft.priceAmount) < 0)) nextErrors.priceAmount = t("fieldRequired");
    if (images.length < 1) setImageError(t("photoRequired"));
    setErrors(nextErrors);
    setSubmitError("");
    if (Object.keys(nextErrors).length || images.length < 1) return;

    setPublishing(true);
    try {
      const created = await createItemListing({
        title: draft.title.trim(),
        description: draft.description.trim(),
        category: draft.category as "ELECTRONICS" | "CLOTHING" | "OTHER",
        condition: draft.condition as "NEW" | "USED",
        priceAmount: draft.contactForPrice ? "" : draft.priceAmount.trim(),
        images,
      });
      try { window.sessionStorage.removeItem(`near-market.item-draft.${userId}`); } catch { /* ignore storage failure */ }
      setSuccess(t("itemCreated"));
      onDirtyChange(false);
      onPublished(created.id);
    } catch {
      setSubmitError(t("listingFormFailed"));
    } finally {
      setPublishing(false);
    }
  }

  const fieldClass = "h-10 w-full rounded-xl border border-[var(--nm-border)] bg-[var(--nm-surface)] px-3 text-sm text-[var(--nm-text)] outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";
  const labelClass = "block space-y-2 text-xs font-semibold text-[var(--nm-secondary)]";

  return (
    <>
      <div className="mb-3 flex min-w-0 items-center gap-1">
        <BackButton label={t("back")} onClick={requestBack} className="-ml-2 h-9 w-9 justify-center p-0" />
        <h2 className="min-w-0 text-base font-semibold text-[var(--nm-text)]">{t("postItem")}</h2>
      </div>
      <form ref={formRef} onSubmit={(event) => void submit(event)} noValidate aria-label={t("postItem")} className="space-y-3 pb-4">
        <SurfaceCard aria-labelledby="item-details-heading" className="space-y-3 p-4">
          <h2 id="item-details-heading" className="mb-1 text-sm font-bold text-[var(--nm-text)]">{t("itemDetails")}</h2>
        <label className={labelClass}>
          <span>{t("itemTitle")}</span>
          <input autoComplete="off" maxLength={120} value={draft.title} onChange={(event) => updateDraft("title", event.target.value)} aria-invalid={Boolean(errors.title)} aria-describedby={errors.title ? "item-title-error" : undefined} className={fieldClass} />
          {errors.title && <span id="item-title-error" className="block text-xs font-normal text-red-500">{errors.title}</span>}
        </label>

        <label className={labelClass}>
          <span>{t("itemDescription")}</span>
          <textarea maxLength={5000} rows={4} value={draft.description} onChange={(event) => updateDraft("description", event.target.value)} aria-invalid={Boolean(errors.description)} aria-describedby={errors.description ? "item-description-error" : undefined} className={`${fieldClass} h-auto min-h-24 resize-none py-2.5`} />
          {errors.description && <span id="item-description-error" className="block text-xs font-normal text-red-500">{errors.description}</span>}
        </label>

        <div>
          <FilterDropdown
            label={t("category")}
            value={draft.category}
            onChange={(value) => updateDraft("category", value as ItemDraft["category"])}
            variant="form"
            invalid={Boolean(errors.category)}
            describedBy={errors.category ? "item-category-error" : undefined}
            options={[
              { value: "", label: t("selectCategory") },
              { value: "ELECTRONICS", label: t("electronics") },
              { value: "CLOTHING", label: t("clothing") },
              { value: "OTHER", label: t("other") },
            ]}
          />
          {errors.category && <span id="item-category-error" className="mt-1 block text-xs font-normal text-red-500">{errors.category}</span>}
        </div>

        <fieldset aria-invalid={Boolean(errors.condition)} aria-describedby={errors.condition ? "item-condition-error" : undefined} className="space-y-2">
          <legend className="text-xs font-semibold text-[var(--nm-secondary)]">{t("condition")}</legend>
          <div className="flex gap-2">
            {(["NEW", "USED"] as const).map((condition) => (
              <label key={condition} className="flex min-h-10 flex-1 cursor-pointer items-center gap-2 rounded-xl border border-[var(--nm-border)] bg-[var(--nm-surface)] px-3 text-sm text-[var(--nm-text)] transition-colors hover:bg-[var(--nm-hover)] has-[:checked]:border-brand-500 has-[:checked]:bg-[var(--nm-accent-soft)] has-[:checked]:text-[var(--nm-accent-text)] focus-within:ring-2 focus-within:ring-brand-500/20">
                <input
                  type="radio"
                  name={`item-condition-${userId}`}
                  value={condition}
                  required
                  checked={draft.condition === condition}
                  onChange={() => updateDraft("condition", condition)}
                  aria-describedby={errors.condition ? "item-condition-error" : undefined}
                  className="h-4 w-4 shrink-0 accent-brand-500"
                />
                <span>{condition === "NEW" ? t("new") : t("used")}</span>
              </label>
            ))}
          </div>
          {errors.condition && <span id="item-condition-error" className="block text-xs font-normal text-red-500">{errors.condition}</span>}
        </fieldset>

        </SurfaceCard>

        <SurfaceCard aria-labelledby="item-price-heading" className="space-y-3 p-4">
          <h2 id="item-price-heading" className="text-sm font-bold text-[var(--nm-text)]">{t("price")}</h2>
          <fieldset className="space-y-2">
          <legend className="sr-only">{t("price")}</legend>
          <div className="grid grid-cols-2 gap-2">
            {([
              { contactForPrice: false, label: t("setPrice") },
              { contactForPrice: true, label: t("contactForPrice") },
            ] as const).map((option) => (
              <label key={option.label} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-[var(--nm-border)] bg-[var(--nm-surface)] px-3 text-sm text-[var(--nm-text)] transition-colors hover:bg-[var(--nm-hover)] has-[:checked]:border-brand-500 has-[:checked]:bg-[var(--nm-accent-soft)] has-[:checked]:text-[var(--nm-accent-text)] focus-within:ring-2 focus-within:ring-brand-500/20">
                <input type="radio" name={`item-pricing-mode-${userId}`} value={option.contactForPrice ? "contact" : "set-price"} checked={draft.contactForPrice === option.contactForPrice} onChange={() => { updateDraft("contactForPrice", option.contactForPrice); if (option.contactForPrice) setErrors((current) => ({ ...current, priceAmount: "" })); }} className="h-4 w-4 shrink-0 accent-brand-500" />
                <span className="leading-5">{option.label}</span>
              </label>
            ))}
          </div>
          {!draft.contactForPrice && <>
            <label className={labelClass}>
              <span>{t("priceAmountLabel")}</span>
              <input type="number" min="0" max="9999999999.99" step="0.01" inputMode="decimal" value={draft.priceAmount} onChange={(event) => updateDraft("priceAmount", event.target.value)} placeholder={t("enterPrice")} aria-invalid={Boolean(errors.priceAmount)} aria-describedby={errors.priceAmount ? "item-price-error" : undefined} className={fieldClass} />
              {errors.priceAmount && <span id="item-price-error" className="block text-xs font-normal text-red-500">{errors.priceAmount}</span>}
            </label>
          </>}
          </fieldset>
        </SurfaceCard>

        <SurfaceCard aria-labelledby="item-photos-heading" className="space-y-3 p-4">
          <div>
            <div className="flex items-center justify-between gap-3">
              <h2 id="item-photos-heading" className="text-sm font-bold text-[var(--nm-text)]">{t("itemPhotos")}</h2>
              <span className="rounded-full bg-[var(--nm-accent-soft)] px-2 py-1 text-[10px] font-bold text-[var(--nm-accent-text)]">{images.length}/3</span>
            </div>
            <p className="mt-1 text-xs text-[var(--nm-muted)]">{t("photosHint")}</p>
          </div>
          {images.length > 0 && <div className="grid grid-cols-3 gap-2">
            {images.map((image, index) => <div key={`${image.name}-${image.size}-${index}`} className="relative aspect-square overflow-hidden rounded-xl bg-[var(--nm-surface)]">
              <img src={imageUrls[index]} alt={image.name} className="h-full w-full object-cover" />
              <button type="button" onClick={() => { setImages((current) => current.filter((_, imageIndex) => imageIndex !== index)); setImageError(""); }} aria-label={t("removePhoto", String(index + 1))} className="absolute right-1 top-1 rounded-full bg-black/70 px-2 py-1 text-[10px] font-semibold text-white">×</button>
            </div>)}
          </div>}
          {images.length < 3 && <label className="flex min-h-16 cursor-pointer items-center gap-3 rounded-xl border border-dashed border-[var(--nm-border)] bg-[var(--nm-surface-subtle)] px-3 py-2 text-sm font-semibold text-[var(--nm-text)] focus-within:outline-2 focus-within:outline-brand-500">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--nm-accent-soft)] text-[var(--nm-accent-text)]"><Icon name="image" className="h-5 w-5" /></span>
            <span className="min-w-0 flex-1">{t("addPhotos")}</span>
            <span className="text-[10px] font-bold text-[var(--nm-accent-text)]">{t("choose")}</span>
            <input type="file" aria-label={t("addPhotos")} accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => { chooseImages(event.target.files); event.currentTarget.value = ""; }} className="sr-only" />
          </label>}
          {(imageError || errors.images) && <p role="alert" className="text-xs text-red-500">{imageError || errors.images}</p>}
        </SurfaceCard>

        {submitError && <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600">{submitError}</p>}
        {success && <p role="status" className="text-sm text-green-600">{success}</p>}
        <button type="button" onClick={() => setShowDiscard(true)} disabled={!isDirty || publishing} className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-transparent px-3 text-xs font-semibold text-[var(--nm-secondary)] transition-colors hover:bg-[var(--nm-hover)] focus-visible:outline-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-50">
          <Icon name="trash" className="h-4 w-4" />
          {t("discardDraft")}
        </button>
        <button type="submit" disabled={publishing} className="flex h-11 w-full items-center justify-center rounded-xl bg-[var(--nm-action)] px-4 text-sm font-semibold text-white hover:bg-[var(--nm-action-hover)] disabled:opacity-60">
          {publishing ? t("publishing") : t("publish")}
        </button>
      </form>
      {showDiscard && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-5" role="alertdialog" aria-modal="true" aria-labelledby="discard-item-title" aria-describedby="discard-item-message">
        <div className="w-full max-w-[340px] rounded-2xl bg-[var(--nm-surface-raised)] p-4 text-[var(--nm-text)]">
          <h2 id="discard-item-title" className="text-base font-bold">{t("discardDraft")}</h2>
          <p id="discard-item-message" className="mt-2 text-sm text-[var(--nm-muted)]">{t("discardChangesConfirm")}</p>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => setShowDiscard(false)} className="rounded-lg px-3 py-2 text-sm font-semibold">{t("back")}</button>
            <button type="button" onClick={confirmDiscard} className="rounded-lg bg-[var(--nm-action)] px-3 py-2 text-sm font-semibold text-white">{t("discardDraft")}</button>
          </div>
        </div>
      </div>}
    </>
  );
}

type HouseRentalDraft = {
  description: string;
  rentalAddress: string;
  priceAmount: string;
  contactForPrice: boolean;
};

const emptyHouseRentalDraft: HouseRentalDraft = {
  description: "",
  rentalAddress: "",
  priceAmount: "",
  contactForPrice: false,
};

function readHouseRentalDraft(userId: string): HouseRentalDraft {
  try {
    const stored = window.sessionStorage.getItem(`near-market.house-rental-draft.${userId}`);
    if (!stored) return emptyHouseRentalDraft;
    const candidate: unknown = JSON.parse(stored);
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return emptyHouseRentalDraft;
    const record = candidate as Record<string, unknown>;
    return {
      description: typeof record.description === "string" ? record.description.slice(0, 5000) : "",
      rentalAddress: typeof record.rentalAddress === "string" ? record.rentalAddress.slice(0, 300) : "",
      priceAmount: typeof record.priceAmount === "string" ? record.priceAmount.slice(0, 13) : "",
      contactForPrice: record.contactForPrice === true,
    };
  } catch {
    return emptyHouseRentalDraft;
  }
}

function HouseRentalForm({ userId, t, onDirtyChange, onPublished, onBack }: {
  userId: string;
  t: Translator;
  onDirtyChange: (dirty: boolean) => void;
  onPublished: (listingId: string) => void;
  onBack: () => void;
}) {
  const [draft, setDraft] = useState<HouseRentalDraft>(() => readHouseRentalDraft(userId));
  const [images, setImages] = useState<File[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [imageError, setImageError] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [showDiscard, setShowDiscard] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const isDirty = Boolean(draft.description || draft.rentalAddress || draft.priceAmount || draft.contactForPrice || images.length);
  const imageUrls = useMemo(() => images.map((file) => URL.createObjectURL(file)), [images]);

  useEffect(() => {
    onDirtyChange(isDirty);
    try { window.sessionStorage.setItem(`near-market.house-rental-draft.${userId}`, JSON.stringify(draft)); } catch { /* state still preserves the draft for this visit */ }
    return () => onDirtyChange(false);
  }, [draft, images, isDirty, onDirtyChange, userId]);
  useEffect(() => () => imageUrls.forEach((url) => URL.revokeObjectURL(url)), [imageUrls]);
  useEffect(() => {
    if (!isDirty) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [isDirty]);

  function updateDraft<K extends keyof HouseRentalDraft>(key: K, value: HouseRentalDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: "" }));
    setSubmitError("");
  }

  function chooseImages(files: FileList | null) {
    if (!files) return;
    const selected = Array.from(files);
    if (images.length + selected.length > 3) { setImageError(t("tooManyPhotos")); return; }
    if (selected.some((file) => file.size > 5 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type))) { setImageError(t("invalidPhoto")); return; }
    setImages((current) => [...current, ...selected]);
    setImageError("");
    setSubmitError("");
  }

  function confirmDiscard() {
    setDraft(emptyHouseRentalDraft);
    setImages([]);
    setErrors({});
    setImageError("");
    setSubmitError("");
    try { window.sessionStorage.removeItem(`near-market.house-rental-draft.${userId}`); } catch { /* ignore storage failure */ }
    onDirtyChange(false);
    onBack();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!draft.description.trim()) nextErrors.description = t("fieldRequired");
    if (!draft.rentalAddress.trim()) nextErrors.rentalAddress = t("fieldRequired");
    if (!draft.contactForPrice && (!draft.priceAmount.trim() || !/^\d{1,10}(?:\.\d{1,2})?$/.test(draft.priceAmount) || Number(draft.priceAmount) < 0)) nextErrors.priceAmount = t("fieldRequired");
    if (images.length < 1) setImageError(t("photoRequired"));
    setErrors(nextErrors);
    setSubmitError("");
    if (Object.keys(nextErrors).length || images.length < 1) return;

    setPublishing(true);
    try {
      const created = await createHouseRentalListing({
        description: draft.description.trim(),
        rentalAddress: draft.rentalAddress.trim(),
        priceAmount: draft.contactForPrice ? "" : draft.priceAmount.trim(),
        images,
      });
      try { window.sessionStorage.removeItem(`near-market.house-rental-draft.${userId}`); } catch { /* ignore storage failure */ }
      onDirtyChange(false);
      onPublished(created.id);
    } catch {
      setSubmitError(t("rentalFormFailed"));
    } finally {
      setPublishing(false);
    }
  }

  const fieldClass = "h-10 w-full rounded-xl border border-[var(--nm-border)] bg-[var(--nm-surface)] px-3 text-sm text-[var(--nm-text)] outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";
  const labelClass = "block space-y-2 text-xs font-semibold text-[var(--nm-secondary)]";
  return (
    <>
      <div className="mb-3 flex min-w-0 items-center gap-1">
        <BackButton label={t("back")} onClick={() => isDirty ? setShowDiscard(true) : onBack()} className="-ml-2 h-9 w-9 justify-center p-0" />
        <h2 className="min-w-0 text-base font-semibold text-[var(--nm-text)]">{t("postHouseRental")}</h2>
      </div>
      <form ref={formRef} onSubmit={(event) => void submit(event)} noValidate aria-label={t("postHouseRental")} className="space-y-3 pb-4">
        <SurfaceCard aria-labelledby="rental-details-heading" className="space-y-3 p-4">
          <h2 id="rental-details-heading" className="mb-1 text-sm font-bold text-[var(--nm-text)]">{t("rentalDetails")}</h2>
          <label className={labelClass}><span>{t("itemDescription")}</span><textarea maxLength={5000} rows={4} value={draft.description} onChange={(event) => updateDraft("description", event.target.value)} aria-invalid={Boolean(errors.description)} aria-describedby={errors.description ? "rental-description-error" : undefined} className={`${fieldClass} h-auto min-h-24 resize-none py-2.5`} />{errors.description && <span id="rental-description-error" className="block text-xs font-normal text-red-500">{errors.description}</span>}</label>
          <label className={labelClass}><span>{t("rentalAddress")}</span><textarea maxLength={300} rows={2} value={draft.rentalAddress} onChange={(event) => updateDraft("rentalAddress", event.target.value)} aria-invalid={Boolean(errors.rentalAddress)} aria-describedby={errors.rentalAddress ? "rental-address-error" : undefined} className={`${fieldClass} h-auto min-h-16 resize-none py-2.5`} />{errors.rentalAddress && <span id="rental-address-error" className="block text-xs font-normal text-red-500">{errors.rentalAddress}</span>}</label>
        </SurfaceCard>
        <SurfaceCard aria-labelledby="rental-price-heading" className="space-y-3 p-4">
          <h2 id="rental-price-heading" className="text-sm font-bold text-[var(--nm-text)]">{t("price")}</h2>
          <fieldset className="space-y-2"><legend className="sr-only">{t("price")}</legend>
          <div className="grid grid-cols-2 gap-2">
            {([
              { contactForPrice: false, label: t("setPrice") },
              { contactForPrice: true, label: t("contactForPrice") },
            ] as const).map((option) => (
              <label key={option.label} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-[var(--nm-border)] bg-[var(--nm-surface)] px-3 text-sm text-[var(--nm-text)] transition-colors hover:bg-[var(--nm-hover)] has-[:checked]:border-brand-500 has-[:checked]:bg-[var(--nm-accent-soft)] has-[:checked]:text-[var(--nm-accent-text)] focus-within:ring-2 focus-within:ring-brand-500/20">
                <input type="radio" name={`rental-pricing-mode-${userId}`} value={option.contactForPrice ? "contact" : "set-price"} checked={draft.contactForPrice === option.contactForPrice} onChange={() => { updateDraft("contactForPrice", option.contactForPrice); if (option.contactForPrice) setErrors((current) => ({ ...current, priceAmount: "" })); }} className="h-4 w-4 shrink-0 accent-brand-500" />
                <span className="leading-5">{option.label}</span>
              </label>
            ))}
          </div>
          {!draft.contactForPrice && <>
            <label className={labelClass}><span>{t("monthlyPriceLabel")}</span><input type="number" min="0" max="9999999999.99" step="0.01" inputMode="decimal" value={draft.priceAmount} onChange={(event) => updateDraft("priceAmount", event.target.value)} placeholder={t("enterPrice")} aria-invalid={Boolean(errors.priceAmount)} aria-describedby={errors.priceAmount ? "rental-price-error" : undefined} className={fieldClass} />{errors.priceAmount && <span id="rental-price-error" className="block text-xs font-normal text-red-500">{errors.priceAmount}</span>}</label>
          </>}
          </fieldset>
        </SurfaceCard>
        <SurfaceCard aria-labelledby="rental-photos-heading" className="space-y-3 p-4"><div><div className="flex items-center justify-between gap-3"><h2 id="rental-photos-heading" className="text-sm font-bold text-[var(--nm-text)]">{t("itemPhotos")}</h2><span className="rounded-full bg-[var(--nm-accent-soft)] px-2 py-1 text-[10px] font-bold text-[var(--nm-accent-text)]">{images.length}/3</span></div><p className="mt-1 text-xs text-[var(--nm-muted)]">{t("photosHint")}</p></div>
          {images.length > 0 && <div className="grid grid-cols-3 gap-2">{images.map((image, index) => <div key={`${image.name}-${image.size}-${index}`} className="relative aspect-square overflow-hidden rounded-xl bg-[var(--nm-surface)]"><img src={imageUrls[index]} alt={image.name} className="h-full w-full object-cover" /><button type="button" onClick={() => { setImages((current) => current.filter((_, imageIndex) => imageIndex !== index)); setImageError(""); }} aria-label={t("removePhoto", String(index + 1))} className="absolute right-1 top-1 rounded-full bg-black/70 px-2 py-1 text-[10px] font-semibold text-white">×</button></div>)}</div>}
          {images.length < 3 && <label className="flex min-h-16 cursor-pointer items-center gap-3 rounded-xl border border-dashed border-[var(--nm-border)] bg-[var(--nm-surface-subtle)] px-3 py-2 text-sm font-semibold text-[var(--nm-text)] focus-within:outline-2 focus-within:outline-brand-500"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--nm-accent-soft)] text-[var(--nm-accent-text)]"><Icon name="image" className="h-5 w-5" /></span><span className="min-w-0 flex-1">{t("addPhotos")}</span><span className="text-[10px] font-bold text-[var(--nm-accent-text)]">{t("choose")}</span><input type="file" aria-label={t("addPhotos")} accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => { chooseImages(event.target.files); event.currentTarget.value = ""; }} className="sr-only" /></label>}
          {(imageError || errors.images) && <p role="alert" className="text-xs text-red-500">{imageError || errors.images}</p>}
        </SurfaceCard>
        {submitError && <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600">{submitError}</p>}
        <button type="button" onClick={() => setShowDiscard(true)} disabled={!isDirty || publishing} className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-transparent px-3 text-xs font-semibold text-[var(--nm-secondary)] transition-colors hover:bg-[var(--nm-hover)] focus-visible:outline-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-50">
          <Icon name="trash" className="h-4 w-4" />
          {t("discardDraft")}
        </button>
        <button type="submit" disabled={publishing} className="flex h-11 w-full items-center justify-center rounded-xl bg-[var(--nm-action)] px-4 text-sm font-semibold text-white hover:bg-[var(--nm-action-hover)] disabled:opacity-60">
          {publishing ? t("publishing") : t("publishRental")}
        </button>
      </form>
      {showDiscard && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-5" role="alertdialog" aria-modal="true" aria-labelledby="discard-rental-title" aria-describedby="discard-rental-message"><div className="w-full max-w-[340px] rounded-2xl bg-[var(--nm-surface-raised)] p-4 text-[var(--nm-text)]"><h2 id="discard-rental-title" className="text-base font-bold">{t("discardDraft")}</h2><p id="discard-rental-message" className="mt-2 text-sm text-[var(--nm-muted)]">{t("discardRentalConfirm")}</p><div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setShowDiscard(false)} className="rounded-lg px-3 py-2 text-sm font-semibold">{t("back")}</button><button type="button" onClick={confirmDiscard} className="rounded-lg bg-[var(--nm-action)] px-3 py-2 text-sm font-semibold text-white">{t("discardDraft")}</button></div></div></div>}
    </>
  );
}

function hasSeenPostingRules(userId: string): boolean {
  try {
    return window.localStorage.getItem(`${POST_RULES_SEEN_PREFIX}${userId}`) === "true";
  } catch {
    return false;
  }
}

export function PostPage({ theme, onThemeChange, language, onLanguageChange, t, user, onDirtyChange, onPublished }: PostPageProps & {
  user: SessionUser | null;
  onDirtyChange?: (dirty: boolean) => void;
  onPublished?: (listingId: string) => void;
}) {
  const canPost = Boolean(user?.telegramUsername?.trim());
  const [showRules, setShowRules] = useState(() => Boolean(user && canPost && !hasSeenPostingRules(user.id)));
  const [listingType, setListingType] = useState<PostListingType | null>(null);

  useEffect(() => {
    setListingType(null);
    setShowRules(Boolean(user && user.telegramUsername?.trim() && !hasSeenPostingRules(user.id)));
  }, [user?.id, user?.telegramUsername]);

  function continueFromRules() {
    if (user) {
      try {
        window.localStorage.setItem(`${POST_RULES_SEEN_PREFIX}${user.id}`, "true");
      } catch {
        // Keep the flow usable when browser storage is unavailable; the notice may show again.
      }
    }
    setShowRules(false);
  }

  return (
    <main className="mx-auto min-h-dvh w-full max-w-[390px] bg-[var(--nm-page)] px-4 pb-28 pt-0">
      <header className="-mx-4 flex min-h-[64px] items-center justify-between gap-3 bg-[var(--nm-header)] px-5 pb-1 pt-[max(6px,env(safe-area-inset-top))]">
        <h1 className="text-xl font-bold leading-6 text-[var(--nm-text)]">{t("post")}</h1>
        <AppearanceControls theme={theme} onThemeChange={onThemeChange} language={language} onLanguageChange={onLanguageChange} t={t} />
      </header>
      {!canPost ? (
        <SurfaceCard className="mt-4 p-4">
          <h2 className="text-base font-semibold text-[var(--nm-text)]">{t("usernameRequiredTitle")}</h2>
          <p className="mt-2 text-sm text-[var(--nm-secondary)]">{t(user ? "setUsernameInTelegram" : "openTelegramToPost")}</p>
        </SurfaceCard>
      ) : showRules ? (
        <SurfaceCard className="mt-4 p-4" aria-labelledby="posting-rules-title">
          <h2 id="posting-rules-title" className="text-base font-semibold text-[var(--nm-text)]">{t("postingRules")}</h2>
          <p className="mt-2 text-sm leading-5 text-[var(--nm-secondary)]">{t("illegalListingsProhibited")}</p>
          <button type="button" onClick={continueFromRules} className="mt-4 h-10 w-full rounded-xl bg-[var(--nm-action)] px-4 text-sm font-semibold text-white hover:bg-[var(--nm-action-hover)]">
            {t("continue")}
          </button>
        </SurfaceCard>
      ) : listingType === "item" && user ? (
        <section className="mt-4">
          <ItemListingForm
            userId={user.id}
            t={t}
            onDirtyChange={onDirtyChange ?? (() => {})}
            onPublished={(listingId) => onPublished?.(listingId)}
            onBack={() => setListingType(null)}
          />
        </section>
      ) : listingType === "house-rental" && user ? (
        <section className="mt-4">
          <HouseRentalForm
            userId={user.id}
            t={t}
            onDirtyChange={onDirtyChange ?? (() => {})}
            onPublished={(listingId) => onPublished?.(listingId)}
            onBack={() => setListingType(null)}
          />
        </section>
      ) : listingType ? (
        <SurfaceCard className="mt-4 p-4">
          <BackButton label={t("back")} onClick={() => setListingType(null)} className="-ml-2 h-9 w-9 justify-center p-0" />
          <h2 className="mt-3 text-base font-semibold text-[var(--nm-text)]">{t(listingType === "item" ? "postItem" : "postHouseRental")}</h2>
          <p className="mt-2 text-sm text-[var(--nm-muted)]" role="status">{t("listingFormComingNext")}</p>
        </SurfaceCard>
      ) : (
        <section className="mt-4 space-y-3" aria-label={t("listingType")}>
          <SurfaceCard
            as="button"
            type="button"
            aria-label={t("sellItem")}
            onClick={() => setListingType("item")}
            className="group flex min-h-16 w-full items-center gap-3 p-3 text-left transition-colors hover:border-[var(--nm-border-strong)] hover:bg-[var(--nm-hover)] active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--nm-accent-soft)] text-[var(--nm-accent-text)]">
              <Icon name="cube" className="h-6 w-6" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-[var(--nm-text)]">{t("sellItem")}</span>
            </span>
            <Icon name="chevron" className="h-5 w-5 shrink-0 text-[var(--nm-muted)] transition-transform group-hover:translate-x-0.5" />
          </SurfaceCard>
          <SurfaceCard
            as="button"
            type="button"
            aria-label={t("listHouseForRent")}
            onClick={() => setListingType("house-rental")}
            className="group flex min-h-16 w-full items-center gap-3 p-3 text-left transition-colors hover:border-[var(--nm-border-strong)] hover:bg-[var(--nm-hover)] active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-[var(--nm-success)]">
              <Icon name="home" className="h-6 w-6" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-[var(--nm-text)]">{t("listHouseForRent")}</span>
            </span>
            <Icon name="chevron" className="h-5 w-5 shrink-0 text-[var(--nm-muted)] transition-transform group-hover:translate-x-0.5" />
          </SurfaceCard>
        </section>
      )}
    </main>
  );
}
