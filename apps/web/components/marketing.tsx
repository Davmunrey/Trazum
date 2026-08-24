'use client';

import { useEffect, useRef, useState } from 'react';

import { LOCALE_STORAGE_KEY } from '../lib/i18n';
import type { Locale } from '../lib/i18n';

/**
 * Shared plumbing for the marketing pages — the landing and the pricing
 * page. These are Persuade surfaces: they sell, the app operates. They
 * deliberately reuse the app's own visual system (Fraunces display, the
 * terracotta accent, the wash tokens) rather than inventing a second brand,
 * and they carry the same two locales the product carries, read from the
 * same storage key the app writes — switching language on the landing
 * switches it in the tool, because it is one product.
 *
 * Like the Bill tab, there is no fetch here: the pages are static, the
 * locale is local, and the scroll effects are IntersectionObserver over
 * elements already on the page.
 */

export function useStoredLocale(): [Locale, (next: Locale) => void] {
  const [locale, setLocale] = useState<Locale>('en');
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
      if (stored === 'en' || stored === 'es') setLocale(stored);
      else if (navigator.language?.toLowerCase().startsWith('es')) setLocale('es');
    } catch {
      // Storage can throw (private mode); the default locale is a full page.
    }
  }, []);
  const set = (next: Locale) => {
    setLocale(next);
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
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
  locale: Locale;
  onChange: (next: Locale) => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-lg border p-0.5 text-[13px]">
      {(['en', 'es'] as const).map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => onChange(code)}
          aria-pressed={locale === code}
          className={`rounded-md px-2.5 py-1 transition-colors ${
            locale === code
              ? 'bg-layer-active font-semibold'
              : 'text-muted-foreground hover:bg-layer-hover'
          }`}
        >
          {code === 'en' ? 'English' : 'Español'}
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
