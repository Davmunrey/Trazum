import { headers } from 'next/headers';

import { PRICING_LAST_REVIEWED } from '@trazum/core';

import { App } from '../components/App';
import { localeFromHeaders } from '../lib/i18n';

export default async function Page() {
  // First paint follows the browser's Accept-Language; once the client
  // hydrates, a locale the reader picked previously takes over.
  const locale = localeFromHeaders((await headers()).get('accept-language'));

  return <App initialLocale={locale} pricingReviewed={PRICING_LAST_REVIEWED} />;
}
