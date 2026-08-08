import { headers } from 'next/headers';

import { PRICING_LAST_REVIEWED, listModels } from '@trazum/core';

import { App } from '../components/App';
import { localeFromHeaders } from '../lib/i18n';

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
