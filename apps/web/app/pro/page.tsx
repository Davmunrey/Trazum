import { headers } from 'next/headers';
import type { Metadata } from 'next';

import { ProPage } from '../../components/pro/ProPage';
import { marketingLocaleFromHeader } from '../../lib/marketing-locales';
import { proMetadata } from '../../lib/site-metadata';

/**
 * `/pro`: Trazum Pro, which is in development and not open.
 *
 * Everything on it is in this repository: the tiers and the status in
 * `lib/pro.ts`, the words in `lib/pro-copy.ts`. Nothing is fetched in a
 * request and nothing the visitor sends reaches the renderer. The language
 * comes from `Accept-Language`, as on the landing.
 */
export async function generateMetadata(): Promise<Metadata> {
  return proMetadata(marketingLocaleFromHeader((await headers()).get('accept-language')));
}

export default async function Pro() {
  const locale = marketingLocaleFromHeader((await headers()).get('accept-language'));
  return <ProPage initialLocale={locale} />;
}
