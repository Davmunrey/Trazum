import { headers } from 'next/headers';
import type { Metadata } from 'next';

import { NotFoundView } from '../components/site/NotFound';
import { localeFromHeaders } from '../lib/i18n';
import { marketingLocaleFromHeader, type MarketingLocale } from '../lib/marketing-locales';
import { notFoundMetadata } from '../lib/site-metadata';

/**
 * The page's language, read from the same list the root layout reads `lang`
 * from. The site speaks five languages and the application two, and an
 * address under `/app` that nothing answers is still on the application's
 * surface: read with the site's list, a French reader got French words under
 * the layout's `lang="en"` (#868).
 */
async function pageLocale(): Promise<MarketingLocale> {
  const requestHeaders = await headers();
  const acceptLanguage = requestHeaders.get('accept-language');
  return requestHeaders.get('x-trazum-surface') === 'site' ? marketingLocaleFromHeader(acceptLanguage) : localeFromHeaders(acceptLanguage);
}

/**
 * Every address nothing answers, and every page that calls `notFound()`: the
 * site's header and footer around one sentence and the way home, rather than
 * the framework's bare default.
 */
export async function generateMetadata(): Promise<Metadata> {
  return notFoundMetadata(await pageLocale());
}

export default async function NotFound() {
  return <NotFoundView initialLocale={await pageLocale()} />;
}
