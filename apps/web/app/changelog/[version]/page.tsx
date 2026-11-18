import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { DocBody } from '../../../components/docs/DocBody';
import { ReleasePage } from '../../../components/history/ChangelogPages';
import { loadRelease, releaseVersions } from '../../../lib/history/load';
import { marketingLocaleFromHeader } from '../../../lib/marketing-locales';
import { releaseMetadata } from '../../../lib/site-metadata';

/**
 * `/changelog/<version>`: one release of the changelog.
 *
 * The version picks one of the pages the build made. It is looked up as a
 * key and never as a path, so an address that is none of them is the site's
 * not-found page, and nothing is read from a file in a request.
 */
export function generateStaticParams() {
  return releaseVersions().map((version) => ({ version }));
}

type Props = { params: Promise<{ version: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const release = await loadRelease((await params).version);
  return release === null || release.version === null ? {} : releaseMetadata({ version: release.version, label: release.label });
}

export default async function ReleaseRoute({ params }: Props) {
  const release = await loadRelease((await params).version);
  if (release === null) notFound();
  const locale = marketingLocaleFromHeader((await headers()).get('accept-language'));
  const { blocks, headings, newer, older, ...summary } = release;
  return (
    <ReleasePage
      initialLocale={locale}
      release={summary}
      newer={newer}
      older={older}
      headings={headings}
      body={<DocBody blocks={blocks} />}
    />
  );
}
