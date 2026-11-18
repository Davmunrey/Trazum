import { headers } from 'next/headers';

import { loadRelease } from '../../../lib/history/load';
import { COPY, ILLUSTRATIVE_BILL } from '../../../lib/landing-copy';
import { marketingLocaleFromHeader } from '../../../lib/marketing-locales';
import { CHANGELOG_COPY } from '../../../lib/pages-copy';
import { SOCIAL_CARD_SIZE, socialCard } from '../../../lib/social-card';

/**
 * One release's card: its version, and its date or title, beside the
 * README's illustrative bill. The title is the changelog's, which is English
 * in every language.
 */
export const alt = 'Trazum changelog';
export const size = SOCIAL_CARD_SIZE;
export const contentType = 'image/png';

export default async function OpengraphImage({ params }: { params: Promise<{ version: string }> }) {
  const locale = marketingLocaleFromHeader((await headers()).get('accept-language'));
  const t = COPY[locale];
  const copy = CHANGELOG_COPY[locale];
  const release = await loadRelease((await params).version);
  return socialCard({
    title: release?.version === null || release === null ? copy.title : copy.releasePageTitle(release.version),
    line: release === null ? copy.lede : release.labelKind === 'date' ? copy.dateOf(release.label ?? '') : (release.label ?? copy.title),
    calls: t.billTotal(ILLUSTRATIVE_BILL.calls),
    note: t.billNote,
  });
}
