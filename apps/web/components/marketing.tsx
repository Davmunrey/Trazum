'use client';

import { useEffect, useState } from 'react';

/**
 * Shared plumbing for the marketing surface — the landing.
 *
 * The Persuade surface sells, the tool operates, and they part ways on
 * language on purpose. **The tool speaks the two languages this project has
 * reviewed** (en, es) — its numbers make precise claims, and a claim is only
 * as trustworthy as the language it is checked in, the same principle the
 * trimming dictionaries hold themselves to. **The marketing speaks the
 * world's**: reach is not a precise claim, so a machine-drafted French,
 * German or Portuguese landing serves a reader better than forcing them into
 * English — exactly the reasoning `maintainers.ts` uses for the unreviewed
 * dictionaries, applied to copy that sells rather than measures.
 *
 * So the landing carries its own locale, under its own storage key, and
 * never pushes an unreviewed language into the tool: a French visitor reads
 * a French landing and lands in the English tool, which is the honest split.
 * The visual system is the app's own — Fraunces, terracotta, the wash tokens
 * — not a second brand. Like the Bill tab, there is no fetch here.
 */

export const MARKETING_LOCALES = ['en', 'es', 'fr', 'de', 'pt'] as const;
export type MarketingLocale = (typeof MARKETING_LOCALES)[number];

/** Native name for the switcher, and whether a human has reviewed the copy. */
export const MARKETING_LOCALE_META: Record<
  MarketingLocale,
  { name: string; reviewed: boolean }
> = {
  en: { name: 'English', reviewed: true },
  es: { name: 'Español', reviewed: true },
  fr: { name: 'Français', reviewed: false },
  de: { name: 'Deutsch', reviewed: false },
  pt: { name: 'Português', reviewed: false },
};

const MARKETING_LOCALE_KEY = 'trazum:marketing-locale';

const isMarketingLocale = (value: unknown): value is MarketingLocale =>
  typeof value === 'string' && (MARKETING_LOCALES as readonly string[]).includes(value);

export function useMarketingLocale(): [MarketingLocale, (next: MarketingLocale) => void] {
  const [locale, setLocale] = useState<MarketingLocale>('en');
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(MARKETING_LOCALE_KEY);
      if (isMarketingLocale(stored)) {
        setLocale(stored);
        return;
      }
      const base = navigator.language?.toLowerCase().slice(0, 2);
      if (isMarketingLocale(base)) setLocale(base);
    } catch {
      // Storage can throw (private mode); the default locale is a full page.
    }
  }, []);
  const set = (next: MarketingLocale) => {
    setLocale(next);
    try {
      window.localStorage.setItem(MARKETING_LOCALE_KEY, next);
    } catch {
      // Not persisting is fine; the choice still applies to this visit.
    }
  };
  return [locale, set];
}

export function LocaleToggle({
  locale,
  onChange,
}: {
  locale: MarketingLocale;
  onChange: (next: MarketingLocale) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-0.5 rounded-lg border p-0.5 text-[13px]">
      {MARKETING_LOCALES.map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => onChange(code)}
          aria-pressed={locale === code}
          className={`rounded-md px-2 py-1 transition-colors ${
            locale === code
              ? 'bg-layer-active font-semibold'
              : 'text-muted-foreground hover:bg-layer-hover'
          }`}
        >
          {MARKETING_LOCALE_META[code].name}
        </button>
      ))}
    </div>
  );
}

/*
 * `Reveal` used to live here, and deleting it is the fix rather than a
 * retreat from one.
 *
 * ## Two attempts, one failure mode
 *
 * The first rendered its children at `opacity-0` and waited for an
 * IntersectionObserver. A full-page capture of the built landing showed the
 * hero and two paragraphs on seven thousand pixels of blank paper: nothing had
 * scrolled, so nothing had intersected, and every section below the fold was
 * in the DOM, laid out, and invisible.
 *
 * The second replaced the observer with `animation-timeline: view()`, which
 * removed the script and kept the fault: a scroll timeline has no progress
 * when there is nothing to scroll, so on a document shorter than the viewport
 * — a large display, a short locale, a print, a capture — `fill-mode: both`
 * pins the element at the `from` keyframe, which is opacity zero. Tightening
 * the range moved the boundary without removing it.
 *
 * ## Why nothing replaced it
 *
 * Both attempts were paying a real risk of invisible copy for fourteen
 * identical fade-ups, which the craft floor names directly: *one authored
 * moment, not scattered effects and not one identical entrance on every
 * section*. The page's motion is now the hero ledger filling once on load —
 * time-based, so it cannot depend on a scroll position that may not exist, and
 * written so the finished state is the default and the animation is subtracted
 * from it. Text is text, and it is on the page from the first paint.
 */

/** Thin scroll-progress line under the marketing header. */
export function ScrollProgress() {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(max > 0 ? Math.min(1, window.scrollY / max) : 0);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <div aria-hidden className="fixed inset-x-0 top-0 z-50 h-[2px] bg-transparent">
      <div
        className="h-full origin-left bg-terracotta transition-transform duration-150"
        style={{ transform: `scaleX(${progress})` }}
      />
    </div>
  );
}
