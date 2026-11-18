import { headers } from 'next/headers';
import type { Metadata } from 'next';

import { PRICING_LAST_REVIEWED, listModels } from '@trazum/core';

import { App } from '../../components/App';
import { getWebMessages, localeFromHeaders } from '../../lib/i18n';
import { dashboardMetadata } from '../../lib/site-metadata';

/**
 * `/app`: the application, unchanged in what it does, at its own address.
 *
 * It was `/` until the landing took that address. Links written for the old
 * one (`/?tab=playground`) are redirected here by `middleware.ts`, with every
 * parameter they carried, so a panel named in an old link still opens.
 */
export async function generateMetadata(): Promise<Metadata> {
  const locale = localeFromHeaders((await headers()).get('accept-language'));
  return dashboardMetadata(getWebMessages(locale));
}

export default async function Page() {
  // First paint follows the browser's Accept-Language; once the client
  // hydrates, a locale the reader picked previously takes over.
  const locale = localeFromHeaders((await headers()).get('accept-language'));

  // Passed from the server so the Compare tab can name the model it priced with
  // on first paint, rather than showing a bare id until a fetch lands.
  const models = listModels().map((m) => ({ id: m.id, displayName: m.displayName }));

  return (
    <App initialLocale={locale} pricingReviewed={PRICING_LAST_REVIEWED} models={models} />
  );
}
