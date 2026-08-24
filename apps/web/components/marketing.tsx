'use client';

import { useEffect, useRef, useState } from 'react';

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

/**
 * Scroll-linked reveal. One IntersectionObserver per element, unobserved on
 * first reveal; under `prefers-reduced-motion` everything renders visible
 * from the start — the observer is never attached, rather than attached and
 * softened.
 */
export function Reveal({
  children,
  delay = 0,
  className = '',
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShown(true);
            observer.disconnect();
          }
        }
      },
      { threshold: 0.18 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-all duration-700 ease-out ${
        shown ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'
      } ${className}`}
    >
      {children}
    </div>
  );
}

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
