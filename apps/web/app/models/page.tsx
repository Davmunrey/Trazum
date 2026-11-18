import { headers } from 'next/headers';
import type { Metadata } from 'next';

import { ModelsPage } from '../../components/models/ModelsPage';
import extra from '../../lib/history/generated/models';
import { marketingLocaleFromHeader } from '../../lib/marketing-locales';
import { catalogueView } from '../../lib/models/view';
import { modelsMetadata } from '../../lib/site-metadata';

/**
 * `/models`: the catalogue the product prices with.
 *
 * The rows are the rows of `@trazum/core`'s catalogue, read when the site is
 * built, and where each provider's prices were read comes from the
 * catalogue's own source (`scripts/build-site-pages.mjs`). Nothing is
 * fetched in a request. The language comes from `Accept-Language`, as on the
 * landing, for the first paint and for the title a crawler reads.
 */
export async function generateMetadata(): Promise<Metadata> {
  return modelsMetadata(marketingLocaleFromHeader((await headers()).get('accept-language')));
}

export default async function Models() {
  const locale = marketingLocaleFromHeader((await headers()).get('accept-language'));
  return <ModelsPage initialLocale={locale} catalogue={catalogueView(extra)} />;
}
