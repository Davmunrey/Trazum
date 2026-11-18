import { headers } from 'next/headers';
import type { Metadata } from 'next';

import { Landing } from '../components/Landing';
import { marketingLocaleFromHeader } from '../lib/marketing-locales';
import { landingMetadata } from '../lib/site-metadata';

/**
 * `/`: the landing, the site's front door. The application is at `/app`.
 *
 * The language comes from `Accept-Language` for the first paint and for the
 * title and description a crawler or a link preview reads; once the page
 * loads, a language the reader chose before takes over.
 */
export async function generateMetadata(): Promise<Metadata> {
  return landingMetadata(marketingLocaleFromHeader((await headers()).get('accept-language')));
}

export default async function Home() {
  const locale = marketingLocaleFromHeader((await headers()).get('accept-language'));
  return <Landing initialLocale={locale} />;
}
