import { headers } from 'next/headers';

import { DOCS_COPY } from '../../lib/docs/copy';
import { COPY, ILLUSTRATIVE_BILL } from '../../lib/landing-copy';
import { marketingLocaleFromHeader } from '../../lib/marketing-locales';
import { SOCIAL_CARD_SIZE, socialCard } from '../../lib/social-card';

/** The documentation index's card: its title and line, beside the README's illustrative bill. */
export const alt = 'Trazum documentation';
export const size = SOCIAL_CARD_SIZE;
export const contentType = 'image/png';

export default async function OpengraphImage() {
  const locale = marketingLocaleFromHeader((await headers()).get('accept-language'));
  const t = COPY[locale];
  const docs = DOCS_COPY[locale];
  return socialCard({ title: docs.indexTitle, line: docs.indexLede, calls: t.billTotal(ILLUSTRATIVE_BILL.calls), note: t.billNote });
}
