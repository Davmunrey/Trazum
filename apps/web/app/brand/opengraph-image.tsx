import { headers } from 'next/headers';

import { COPY, ILLUSTRATIVE_BILL } from '../../lib/landing-copy';
import { marketingLocaleFromHeader } from '../../lib/marketing-locales';
import { BRAND_COPY } from '../../lib/pages-copy';
import { SOCIAL_CARD_SIZE, socialCard } from '../../lib/social-card';

/** The card for this page: its title and line, beside the README's illustrative bill. */
export const alt = 'Trazum brand';
export const size = SOCIAL_CARD_SIZE;
export const contentType = 'image/png';

export default async function OpengraphImage() {
  const locale = marketingLocaleFromHeader((await headers()).get('accept-language'));
  const t = COPY[locale];
  const page = BRAND_COPY[locale];
  return socialCard({ title: page.title, line: page.metaDescription, calls: t.billTotal(ILLUSTRATIVE_BILL.calls), note: t.billNote });
}
