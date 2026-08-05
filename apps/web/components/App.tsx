'use client';

import { useEffect, useState } from 'react';

import type { Locale } from '@trazum/core';

import { Optimizer } from './Optimizer';
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
    <main className="shell">
      <header className="masthead">
        <h1>Trazum</h1>
        <span className="tag">{t.meta.tagline}</span>
        <div className="locale-switch" role="group" aria-label={t.page.localeSwitchLabel}>
          {LOCALES.map((option) => (
            <button
              key={option}
              type="button"
              className={option === locale ? 'active' : ''}
              aria-pressed={option === locale}
              onClick={() => chooseLocale(option)}
            >
              {getWebMessages(option).endonym}
            </button>
          ))}
        </div>
      </header>

      <p className="lede">{t.page.lede}</p>

      <Optimizer locale={locale} t={t} />

      <footer className="foot">
        {t.page.footerLead(pricingReviewed)}
        <code>--exact-tokens</code>
        {t.page.footerTail}
      </footer>
    </main>
  );
}
