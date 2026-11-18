import { headers } from 'next/headers';
import type { Metadata } from 'next';

import { NotFoundView } from '../components/site/NotFound';
import { marketingLocaleFromHeader } from '../lib/marketing-locales';
import { notFoundMetadata } from '../lib/site-metadata';

/**
 * Every address nothing answers, and every page that calls `notFound()`: the
 * site's header and footer around one sentence and the way home, rather than
 * the framework's bare default.
 */
export async function generateMetadata(): Promise<Metadata> {
  return notFoundMetadata(marketingLocaleFromHeader((await headers()).get('accept-language')));
}

export default async function NotFound() {
  const locale = marketingLocaleFromHeader((await headers()).get('accept-language'));
  return <NotFoundView initialLocale={locale} />;
}
