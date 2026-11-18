import { headers } from 'next/headers';

import { getWebMessages, localeFromHeaders } from '../../lib/i18n';
import { COPY, ILLUSTRATIVE_BILL } from '../../lib/landing-copy';
import { SOCIAL_CARD_SIZE, socialCard } from '../../lib/social-card';

/** The dashboard's card: the application's own name and line, beside the same bill. */
export const alt = 'Trazum';
export const size = SOCIAL_CARD_SIZE;
export const contentType = 'image/png';

export default async function OpengraphImage() {
  const locale = localeFromHeaders((await headers()).get('accept-language'));
  const { meta } = getWebMessages(locale);
  const t = COPY[locale];
  return socialCard({
    title: `${meta.dashboardTitle}: ${meta.tagline}`,
    line: t.eyebrow,
    calls: t.billTotal(ILLUSTRATIVE_BILL.calls),
    note: t.billNote,
  });
}
