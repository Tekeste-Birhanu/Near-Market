import { useEffect, useId, useRef, useState } from "react";
import type { PreviewListing } from "../data/listings";
import type { TranslationKey } from "../i18n/translations";
import { apiImageRequest } from "../api/client";
import { Icon, SurfaceCard } from "./SharedUI";

export type FilterOption = { value: string; label: string };

export function ListingImage({ url, alt, className, t }: {
  url: string;
  alt: string;
  className: string;
  t: (key: TranslationKey) => string;
}) {
  const isProtectedListingImage = url.startsWith("/listings/") || url.startsWith("/admin/listings/");
  const [source, setSource] = useState(isProtectedListingImage ? "" : url);
  useEffect(() => {
    let active = true;
    let objectUrl: string | undefined;
    if (!isProtectedListingImage) {
      setSource(url);
      return;
    }
    setSource("");
    void apiImageRequest(url).then((blob) => {
      if (!active) return;
      objectUrl = URL.createObjectURL(blob);
      setSource(objectUrl);
    }).catch(() => {
      if (active) setSource("");
    });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url, isProtectedListingImage]);

  return source
    ? <img src={source} alt={alt} className={className} loading="lazy" />
    : <div role="img" aria-label={t("imageUnavailable")} className={`${className} bg-[var(--nm-hover)]`} />;
}

export function FilterDropdown({
  label,
  value,
  options,
  onChange,
  variant = "filter",
  invalid = false,
  describedBy,
}: {
  label: string;
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
  variant?: "filter" | "form" | "sort";
  invalid?: boolean;
  describedBy?: string;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() => Math.max(0, options.findIndex((option) => option.value === value)));
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const selectedOption = options[selectedIndex];

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    optionRefs.current[activeIndex]?.focus();
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [activeIndex, open]);

  const openAt = (index: number) => {
    setActiveIndex(index);
    setOpen(true);
  };
  const moveActive = (index: number) => {
    const nextIndex = (index + options.length) % options.length;
    setActiveIndex(nextIndex);
    optionRefs.current[nextIndex]?.focus();
  };
  const closeAndFocusTrigger = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <div ref={rootRef} className="relative min-w-0">
      <span id={`${id}-label`} className={`${variant === "sort" ? "sr-only" : `block font-semibold ${variant === "form" ? "text-xs text-[var(--nm-secondary)]" : "mb-1 text-[10px] font-medium text-[var(--nm-muted)]"}`}`}>{label}</span>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-options`}
        aria-labelledby={`${id}-label ${id}-value`}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        aria-required={variant === "form" || undefined}
        onClick={() => (open ? setOpen(false) : openAt(selectedIndex))}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            openAt(selectedIndex);
          }
        }}
        className={`flex min-w-0 items-center justify-between gap-1.5 text-left text-[var(--nm-text)] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-500/30 ${variant === "form" ? "mt-2 h-10 w-full rounded-xl border border-[var(--nm-border)] bg-[var(--nm-surface)] px-3 text-sm font-normal hover:bg-[var(--nm-hover)] focus-visible:border-brand-500" : variant === "sort" ? "h-8 w-auto rounded-md border border-transparent bg-transparent pl-2 text-[12.5px] font-semibold text-[var(--nm-secondary)] hover:bg-[var(--nm-hover)] focus-visible:border-brand-500" : "h-9 w-full rounded-lg border border-[var(--nm-border)] bg-[var(--nm-surface-subtle)] px-2 text-[11px] font-medium hover:bg-[var(--nm-hover)] focus-visible:border-brand-500"} ${invalid ? "border-red-500" : ""}`}
      >
        <span id={`${id}-value`} className="truncate">{selectedOption.label}</span>
        <Icon name="chevron" className={`h-4 w-4 shrink-0 transition-transform ${open ? "-rotate-90" : "rotate-90"}`} />
      </button>
      {open && (
        <div
          id={`${id}-options`}
          role="listbox"
          aria-labelledby={`${id}-label`}
          className={`absolute ${variant === "sort" ? "right-0" : "left-0"} top-full z-30 mt-1 max-h-52 w-max min-w-full max-w-[calc(100vw-48px)] overflow-y-auto rounded-lg border border-[var(--nm-border)] bg-[var(--nm-surface-raised)] p-1 shadow-lg`}
        >
          {options.map((option, index) => (
            <button
              key={option.value}
              ref={(element) => { optionRefs.current[index] = element; }}
              type="button"
              role="option"
              aria-selected={option.value === value}
              tabIndex={index === activeIndex ? 0 : -1}
              onClick={() => {
                onChange(option.value);
                closeAndFocusTrigger();
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  moveActive(index + 1);
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  moveActive(index - 1);
                } else if (event.key === "Home") {
                  event.preventDefault();
                  moveActive(0);
                } else if (event.key === "End") {
                  event.preventDefault();
                  moveActive(options.length - 1);
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  closeAndFocusTrigger();
                }
              }}
              className={`block w-full truncate rounded-md px-2.5 py-2 text-left ${variant === "form" ? "text-sm" : "text-[11px]"} font-medium text-[var(--nm-text)] outline-none hover:bg-[var(--nm-hover)] focus-visible:bg-[var(--nm-hover)] ${option.value === value ? "bg-[var(--nm-accent-soft)] text-[var(--nm-accent-text)]" : ""}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ListingCard({
  listing,
  onDetails,
  t,
  adminMode = false,
}: {
  listing: PreviewListing;
  onDetails: (listing: PreviewListing) => void;
  t: (key: TranslationKey) => string;
  adminMode?: boolean;
}) {
  const badge = listing.type === "ITEM"
    ? t(listing.condition === "New" ? "new" : "used")
    : t("houseRental");
  const title = listing.type === "ITEM" ? listing.title : t("houseRental");

  return (
    <SurfaceCard as="article" className="flex h-[124px] min-w-0 gap-2.5 overflow-hidden p-2 transition-colors hover:border-[color-mix(in_srgb,var(--nm-text)_24%,transparent)]">
      <ListingImage url={listing.image} alt={listing.title} className="aspect-square w-[31%] shrink-0 self-center rounded-[10px] object-cover" t={t} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col py-0.5 pr-0.5">
        <div className="min-h-0 min-w-0">
          <div className="flex min-w-0 items-start gap-1.5">
            <h3 className="line-clamp-2 min-w-0 flex-1 text-[13px] font-bold leading-[17px] tracking-tight text-[var(--nm-text)]">{title}</h3>
            {listing.type === "ITEM" && <span className="mt-px shrink-0 rounded-full bg-[var(--nm-accent-soft)] px-2 py-1 text-[9.5px] font-bold leading-3 text-[var(--nm-accent-text)]">{badge}</span>}
          </div>
          <div className="mt-1 flex min-w-0 items-baseline justify-between gap-1">
            <p className="flex min-w-0 items-baseline gap-1 whitespace-nowrap text-[15px] font-extrabold leading-[19px] tracking-tight text-[var(--nm-text)]">
              {listing.price === null ? t("contactForPrice") : `ETB ${listing.price.toLocaleString("en-ET")}`}
              {listing.type === "HOUSE_RENTAL" && <span className="text-[10px] font-medium text-[var(--nm-muted)]">{t("month")}</span>}
            </p>
            {adminMode && listing.status && <span className="shrink-0 text-[9px] font-semibold text-[var(--nm-muted)]">{t(listing.status === "SOLD" ? "sold" : listing.status === "UNAVAILABLE" ? "unavailable" : "available")}</span>}
          </div>
          {listing.type === "HOUSE_RENTAL" && <p className="mt-0.5 truncate text-[11px] leading-3.5 text-[var(--nm-secondary)]">{listing.address}</p>}
        </div>
        <div className="mt-auto flex shrink-0 gap-[7px] pt-1">
          {listing.sellerUsername ? (
            <a href={`https://t.me/${encodeURIComponent(listing.sellerUsername.replace(/^@/, ""))}`} target="_blank" rel="noopener noreferrer" className="flex h-[34px] w-fit max-w-full min-w-0 flex-none items-center justify-center gap-1 whitespace-nowrap rounded-[10px] bg-[var(--nm-action)] px-2 text-[11px] font-bold text-white transition-colors hover:bg-[var(--nm-action-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 active:scale-[0.98] active:bg-[var(--nm-action-hover)]">
              <Icon name="send" className="h-3.5 w-3.5" />{t("contact")}
            </a>
          ) : (
            <button type="button" disabled className="flex h-[34px] w-fit max-w-full min-w-0 flex-none items-center justify-center gap-1 whitespace-nowrap rounded-[10px] bg-[var(--nm-action)] px-2 text-[11px] font-bold text-white opacity-50" aria-label={t("sellerContactUnavailable")}>
              <Icon name="send" className="h-3.5 w-3.5" />{t("contact")}
            </button>
          )}
          <button type="button" onClick={() => onDetails(listing)} className="flex h-[34px] w-fit max-w-full min-w-0 flex-none items-center justify-center gap-0.5 rounded-[10px] border border-[var(--nm-border)] bg-transparent px-2 text-[11px] font-bold text-[var(--nm-text)] transition-colors hover:bg-[var(--nm-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 active:scale-[0.98] active:bg-[var(--nm-hover)]">
            <span className="truncate">{t("viewDetails")}</span><Icon name="chevron" className="h-3.5 w-3.5 shrink-0 max-[350px]:hidden" />
          </button>
        </div>
      </div>
    </SurfaceCard>
  );
}

export function ListingDetailsDialog({
  listing,
  onClose,
  t,
}: {
  listing: PreviewListing;
  onClose: () => void;
  t: (key: TranslationKey) => string;
}) {
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 px-3" role="presentation" onClick={onClose}>
      <section role="dialog" aria-modal="true" aria-labelledby="details-title" onClick={(event) => event.stopPropagation()} className="mb-[max(10px,env(safe-area-inset-bottom))] w-full max-w-[366px] rounded-3xl border border-[var(--nm-border)] bg-[var(--nm-surface)] p-4 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-brand-500">{listing.type === "ITEM" ? t(listing.condition === "New" ? "new" : "used") : t("houseRental")}</p>
            <h2 id="details-title" className="mt-1 text-lg font-bold text-[var(--nm-text)]">{listing.title}</h2>
            <p className="mt-1 text-xl font-extrabold text-[var(--nm-text)]">{listing.price === null ? t("contactForPrice") : `ETB ${listing.price.toLocaleString("en-ET")}`}{listing.type === "HOUSE_RENTAL" && ` ${t("month")}`}</p>
          </div>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--nm-hover)] text-[var(--nm-muted)]" aria-label={t("closeDetails")}>
            <Icon name="close" className="h-4 w-4" />
          </button>
        </div>
        {listing.address && <p className="mt-3 text-sm text-[var(--nm-muted)]">{listing.address}</p>}
        <p className="mt-3 whitespace-pre-wrap text-sm leading-5 text-[var(--nm-muted)]">{listing.description || t("descriptionUnavailable")}</p>
        {listing.sellerUsername && <a href={`https://t.me/${encodeURIComponent(listing.sellerUsername.replace(/^@/, ""))}`} target="_blank" rel="noopener noreferrer" className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--nm-action)] text-sm font-bold text-white hover:bg-[var(--nm-action-hover)]">
          <Icon name="send" className="h-4 w-4" />{t("contactSeller")}
        </a>}
      </section>
    </div>
  );
}
