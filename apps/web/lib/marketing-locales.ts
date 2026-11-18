/**
 * The languages the public site speaks, and which of them a person reviewed.
 *
 * Kept out of `components/marketing.tsx` because the server needs them too:
 * a page's metadata is chosen from `Accept-Language` before any script runs,
 * and a value exported from a `'use client'` module reaches the server as a
 * reference, not as the array. `marketing.tsx` re-exports all of it, so the
 * client side reads the same list.
 *
 * The tool speaks two reviewed languages (en, es); the site speaks five. The
 * reasoning is in `marketing.tsx`.
 */

export const MARKETING_LOCALES = ['en', 'es', 'fr', 'de', 'pt'] as const;
export type MarketingLocale = (typeof MARKETING_LOCALES)[number];

/** Native name for the switcher, and whether a human has reviewed the copy. */
export const MARKETING_LOCALE_META: Record<MarketingLocale, { name: string; reviewed: boolean }> = {
  en: { name: 'English', reviewed: true },
  es: { name: 'Español', reviewed: true },
  fr: { name: 'Français', reviewed: false },
  de: { name: 'Deutsch', reviewed: false },
  pt: { name: 'Português', reviewed: false },
};

export const MARKETING_LOCALE_KEY = 'trazum:marketing-locale';

export const isMarketingLocale = (value: unknown): value is MarketingLocale =>
  typeof value === 'string' && (MARKETING_LOCALES as readonly string[]).includes(value);

/**
 * The site's language for a request, from `Accept-Language`, for the server's
 * first paint and for metadata. The first listed language the site speaks
 * wins, quality values ignored the way browsers order the list already;
 * nothing listed falls back to English. Once the page loads, a stored choice
 * takes over.
 */
export function marketingLocaleFromHeader(header: string | null): MarketingLocale {
  for (const part of (header ?? '').split(',')) {
    const base = part.trim().slice(0, 2).toLowerCase();
    if (isMarketingLocale(base)) return base;
  }
  return 'en';
}
