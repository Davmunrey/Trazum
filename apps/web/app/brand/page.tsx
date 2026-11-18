import { headers } from 'next/headers';
import type { Metadata } from 'next';

import { BrandPage } from '../../components/brand/BrandPage';
import brand from '../../lib/history/generated/brand';
import { marketingLocaleFromHeader } from '../../lib/marketing-locales';
import { brandMetadata } from '../../lib/site-metadata';

/**
 * `/brand`: the wordmark and the plain T to download, the colours, the
 * typeface, the voice and what not to do.
 *
 * What the page says is read when the site is built, from the files that hold
 * it (`scripts/build-site-pages.mjs`): the colours from `globals.css`, the
 * voice and the rules from `DESIGN.md`, the downloads from the list the icon
 * script writes them by. Nothing is fetched or read in a request. The language
 * comes from `Accept-Language`, as on the landing.
 */
export async function generateMetadata(): Promise<Metadata> {
  return brandMetadata(marketingLocaleFromHeader((await headers()).get('accept-language')));
}

export default async function Brand() {
  const locale = marketingLocaleFromHeader((await headers()).get('accept-language'));
  return <BrandPage initialLocale={locale} brand={brand} />;
}
