import { headers } from 'next/headers';
import type { Metadata } from 'next';

import { DocBody } from '../../components/docs/DocBody';
import { ChangelogIndexPage } from '../../components/history/ChangelogPages';
import anchors from '../../lib/history/generated/anchors';
import changelog from '../../lib/history/generated/changelog';
import { marketingLocaleFromHeader } from '../../lib/marketing-locales';
import { changelogMetadata } from '../../lib/site-metadata';

/**
 * `/changelog`: every release, newest first, and the newest few in full.
 *
 * What is on the page is what `scripts/build-site-pages.mjs` wrote from
 * `CHANGELOG.md` when the site was built. Nothing is read at request time.
 * The rest of the releases are one click away, each on its own page.
 */
export async function generateMetadata(): Promise<Metadata> {
  return changelogMetadata(marketingLocaleFromHeader((await headers()).get('accept-language')));
}

export default async function Changelog() {
  const locale = marketingLocaleFromHeader((await headers()).get('accept-language'));
  return (
    <ChangelogIndexPage
      initialLocale={locale}
      intro={<DocBody blocks={changelog.intro} />}
      releases={changelog.releases}
      anchors={anchors}
      featured={changelog.featured.map(({ headings, blocks, ...release }) => ({
        release,
        headings,
        body: <DocBody blocks={blocks} />,
      }))}
    />
  );
}
