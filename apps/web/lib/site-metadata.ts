import type { Metadata } from 'next';

import type { WebMessages } from './i18n/types';
import { COPY } from './landing-copy';
import type { MarketingLocale } from './marketing-locales';
import { CANONICAL } from './site';
import { SITE_COPY } from './site-copy';

/**
 * Each public page's own title, description, canonical address and card.
 *
 * Functions of the language and nothing else, so the pages call them with
 * the language `Accept-Language` asked for and `site.test.mjs` calls them
 * with each language directly. The social image is not here: each page
 * draws its own from `opengraph-image.tsx` beside it, and Next adds it.
 */

const OG_LOCALE: Record<MarketingLocale, string> = {
  en: 'en_US',
  es: 'es_ES',
  fr: 'fr_FR',
  de: 'de_DE',
  pt: 'pt_PT',
};

function card(title: string, description: string, url: string, locale: string): Metadata {
  return {
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: 'website', siteName: 'Trazum', locale },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export function landingMetadata(locale: MarketingLocale): Metadata {
  const t = COPY[locale];
  return {
    // Absolute: the landing's title names the product first already.
    title: { absolute: t.metaTitle },
    ...card(t.metaTitle, t.metaDescription, CANONICAL.landing, OG_LOCALE[locale]),
  };
}

export function dashboardMetadata(messages: WebMessages): Metadata {
  const title = `${messages.meta.dashboardTitle} · Trazum`;
  return {
    title: { absolute: title },
    ...card(title, messages.meta.description, CANONICAL.dashboard, messages.meta.ogLocale),
  };
}

export function notFoundMetadata(locale: MarketingLocale): Metadata {
  return {
    title: { absolute: `${SITE_COPY[locale].notFoundMetaTitle} · Trazum` },
    description: SITE_COPY[locale].notFoundBody,
    robots: { index: false, follow: true },
  };
}
