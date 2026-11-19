import { headers } from 'next/headers';
import type { Metadata } from 'next';

import { DownloadPage } from '../../components/download/DownloadPage';
import { marketingLocaleFromHeader } from '../../lib/marketing-locales';
import { downloadMetadata } from '../../lib/site-metadata';

/**
 * `/download`: what to run or fetch to have Trazum, and how to check it.
 *
 * Everything on it is in this repository: the commands, the files and the
 * version in `lib/download.ts` (written at build from the repository's own
 * sources), the words in `lib/download-copy.ts`. Nothing is fetched in a
 * request and nothing the visitor sends reaches the renderer. The language
 * comes from `Accept-Language`, as on the landing.
 */
export async function generateMetadata(): Promise<Metadata> {
  return downloadMetadata(marketingLocaleFromHeader((await headers()).get('accept-language')));
}

export default async function Download() {
  const locale = marketingLocaleFromHeader((await headers()).get('accept-language'));
  return <DownloadPage initialLocale={locale} />;
}
