import { headers } from 'next/headers';

import { COPY, ILLUSTRATIVE_BILL } from '../../lib/landing-copy';
import { marketingLocaleFromHeader } from '../../lib/marketing-locales';
import { PRO_COPY } from '../../lib/pro-copy';
import { SOCIAL_CARD_SIZE, socialCard } from '../../lib/social-card';

/** The card for this page: its title and its status, beside the README's illustrative bill. */
export const alt = 'Trazum Pro, in development and not open yet';
export const size = SOCIAL_CARD_SIZE;
export const contentType = 'image/png';

export default async function OpengraphImage() {
  const locale = marketingLocaleFromHeader((await headers()).get('accept-language'));
  const t = COPY[locale];
  const page = PRO_COPY[locale];
  return socialCard({ title: page.title, line: `${page.status} ${page.lede}`, calls: t.billTotal(ILLUSTRATIVE_BILL.calls), note: t.billNote });
}
