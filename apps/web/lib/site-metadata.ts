import type { Metadata } from 'next';

import { DOCS_COPY } from './docs/copy';
import { docHref } from './docs/manifest';
import type { WebMessages } from './i18n/types';
import { COPY } from './landing-copy';
import type { MarketingLocale } from './marketing-locales';
import { BRAND_COPY, CHANGELOG_COPY, MODELS_COPY, ROADMAP_COPY } from './pages-copy';
import { DOWNLOAD_COPY } from './download-copy';
import { PRO_COPY } from './pro-copy';
import { BRAND_PATH, CANONICAL, CHANGELOG_PATH, DOCS_PATH, DOWNLOAD_PATH, MODELS_PATH, PRO_PATH, ROADMAP_PATH } from './site';
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

export function docsIndexMetadata(locale: MarketingLocale): Metadata {
  const t = DOCS_COPY[locale];
  const title = `${t.indexTitle} · Trazum`;
  return { title: { absolute: title }, ...card(title, t.indexLede, DOCS_PATH, OG_LOCALE[locale]) };
}

/**
 * One document's page. The description is the document's first paragraph as
 * the build trimmed it, in the document's language, which is English: a page
 * of English text that described itself in Spanish would be a different claim.
 */
export function docMetadata(doc: { slug: string; title: string; description: string }): Metadata {
  const title = `${doc.title} · Trazum docs`;
  return { title: { absolute: title }, ...card(title, doc.description, docHref(doc.slug), OG_LOCALE.en) };
}

export function modelsMetadata(locale: MarketingLocale): Metadata {
  const t = MODELS_COPY[locale];
  const title = `${t.metaTitle} · Trazum`;
  return { title: { absolute: title }, ...card(title, t.metaDescription, MODELS_PATH, OG_LOCALE[locale]) };
}

export function roadmapMetadata(locale: MarketingLocale): Metadata {
  const t = ROADMAP_COPY[locale];
  const title = `${t.metaTitle} · Trazum`;
  return { title: { absolute: title }, ...card(title, t.metaDescription, ROADMAP_PATH, OG_LOCALE[locale]) };
}

export function changelogMetadata(locale: MarketingLocale): Metadata {
  const t = CHANGELOG_COPY[locale];
  const title = `${t.metaTitle} · Trazum`;
  return { title: { absolute: title }, ...card(title, t.metaDescription, CHANGELOG_PATH, OG_LOCALE[locale]) };
}

export function brandMetadata(locale: MarketingLocale): Metadata {
  const t = BRAND_COPY[locale];
  const title = `${t.metaTitle} · Trazum`;
  return { title: { absolute: title }, ...card(title, t.metaDescription, BRAND_PATH, OG_LOCALE[locale]) };
}

export function downloadMetadata(locale: MarketingLocale): Metadata {
  const t = DOWNLOAD_COPY[locale];
  const title = `${t.metaTitle} · Trazum`;
  return { title: { absolute: title }, ...card(title, t.metaDescription, DOWNLOAD_PATH, OG_LOCALE[locale]) };
}

export function proMetadata(locale: MarketingLocale): Metadata {
  const t = PRO_COPY[locale];
  // Absolute, and not "Trazum Pro · Trazum": the page's title names the product already.
  const title = t.metaTitle;
  return { title: { absolute: title }, ...card(title, t.metaDescription, PRO_PATH, OG_LOCALE[locale]) };
}

/** One release's page. English, as the changelog is: its title and description say what it is. */
export function releaseMetadata(release: { version: string; label: string | null }): Metadata {
  const title = `Trazum ${release.version} · Changelog`;
  const description = release.label === null ? `What changed in Trazum ${release.version}.` : `What changed in Trazum ${release.version}: ${release.label}.`;
  return { title: { absolute: title }, ...card(title, description, `${CHANGELOG_PATH}/${release.version}`, OG_LOCALE.en) };
}

export function notFoundMetadata(locale: MarketingLocale): Metadata {
  return {
    title: { absolute: `${SITE_COPY[locale].notFoundMetaTitle} · Trazum` },
    description: SITE_COPY[locale].notFoundBody,
    robots: { index: false, follow: true },
  };
}
