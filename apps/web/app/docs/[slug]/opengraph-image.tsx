import { headers } from 'next/headers';

import { DOCS_COPY } from '../../../lib/docs/copy';
import { docBySlug } from '../../../lib/docs/manifest';
import { COPY, ILLUSTRATIVE_BILL } from '../../../lib/landing-copy';
import { marketingLocaleFromHeader } from '../../../lib/marketing-locales';
import { SOCIAL_CARD_SIZE, socialCard } from '../../../lib/social-card';

/**
 * One document's card: its title, and the group it is in, beside the
 * README's illustrative bill. The title is the document's, which is English
 * in every language; the line is the site's own, in the reader's.
 */
export const alt = 'Trazum documentation';
export const size = SOCIAL_CARD_SIZE;
export const contentType = 'image/png';

export default async function OpengraphImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const locale = marketingLocaleFromHeader((await headers()).get('accept-language'));
  const t = COPY[locale];
  const docs = DOCS_COPY[locale];
  const doc = docBySlug(slug);
  return socialCard({
    title: doc?.title ?? docs.indexTitle,
    line: doc ? `${docs.indexTitle} · ${docs.groups[doc.group].title}` : docs.indexLede,
    calls: t.billTotal(ILLUSTRATIVE_BILL.calls),
    note: t.billNote,
  });
}
