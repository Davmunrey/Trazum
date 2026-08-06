'use client';

import { useEffect, useState } from 'react';

import type { Locale } from '@trazum/core';

import { Optimizer } from './Optimizer';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { LOCALES, LOCALE_STORAGE_KEY, getWebMessages } from '../lib/i18n';

function storedLocale(): Locale | null {
  try {
    const raw = localStorage.getItem(LOCALE_STORAGE_KEY);
    return LOCALES.includes(raw as Locale) ? (raw as Locale) : null;
  } catch {
    // Storage blocked: the header-derived locale is a fine answer.
    return null;
  }
}

/**
 * Owns the locale for the whole page.
 *
 * The server renders with the locale from `Accept-Language`; this component
 * upgrades to the reader's stored choice on hydration. Deliberately applied in
 * an effect rather than during render: reading `localStorage` while rendering
 * would make the client's first pass disagree with the server's HTML.
 */
export function App({
  initialLocale,
  pricingReviewed,
}: {
  initialLocale: Locale;
  pricingReviewed: string;
}) {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const t = getWebMessages(locale);

  useEffect(() => {
    const stored = storedLocale();
    if (stored) setLocale(stored);
  }, []);

  // Keep the document language in step with the switcher, so screen readers
  // and browser translation follow what is actually on screen.
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  function chooseLocale(next: Locale) {
    setLocale(next);
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      // Not persisting a preference is survivable; failing to switch is not.
    }
  }

  return (
    <main className="mx-auto max-w-[1180px] px-5 pt-7 pb-16">
      <header className="mb-1.5 flex flex-wrap items-baseline gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Trazum</h1>
        <span className="text-sm text-muted-foreground">{t.meta.tagline}</span>

        {/* Pushed to the far end so it reads as a page-level control rather
            than part of the title. */}
        <div
          className="ml-auto flex gap-0.5 rounded-lg border p-0.5"
          role="group"
          aria-label={t.page.localeSwitchLabel}
        >
          {LOCALES.map((option) => (
            <Button
              key={option}
              type="button"
              variant="ghost"
              size="sm"
              aria-pressed={option === locale}
              onClick={() => chooseLocale(option)}
              className={cn(
                'h-7 px-2.5 text-[13px] font-normal text-muted-foreground',
                option === locale && 'bg-muted text-foreground',
              )}
            >
              {getWebMessages(option).endonym}
            </Button>
          ))}
        </div>
      </header>

      <p className="mt-0 mb-7 max-w-[62ch] text-muted-foreground">{t.page.lede}</p>

      <Optimizer locale={locale} t={t} />

      <footer className="mt-8 border-t pt-3.5 text-xs text-muted-foreground">
        {t.page.footerLead(pricingReviewed)}
        <code className="font-mono">--exact-tokens</code>
        {t.page.footerTail}
      </footer>
    </main>
  );
}
