import { headers } from 'next/headers';

import { COPY, ILLUSTRATIVE_BILL } from '../lib/landing-copy';
import { marketingLocaleFromHeader } from '../lib/marketing-locales';
import { SOCIAL_CARD_SIZE, socialCard } from '../lib/social-card';

/** The landing's card: its headline, beside the README's illustrative bill. */
export const alt = 'Trazum';
export const size = SOCIAL_CARD_SIZE;
export const contentType = 'image/png';

export default async function OpengraphImage() {
  const t = COPY[marketingLocaleFromHeader((await headers()).get('accept-language'))];
  return socialCard({ title: t.heroTitle, line: t.eyebrow, calls: t.billTotal(ILLUSTRATIVE_BILL.calls), note: t.billNote });
}
