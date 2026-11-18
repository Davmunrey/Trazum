import { headers } from 'next/headers';
import type { Metadata } from 'next';

import { DocsIndex } from '../../components/docs/DocsIndex';
import index from '../../lib/docs/generated/index';
import { marketingLocaleFromHeader } from '../../lib/marketing-locales';
import { docsIndexMetadata } from '../../lib/site-metadata';

/**
 * `/docs`: the documentation index.
 *
 * The language comes from `Accept-Language` for the first paint and for the
 * title and description a crawler reads, as on the landing; the documents
 * themselves are English in every language.
 */
export async function generateMetadata(): Promise<Metadata> {
  return docsIndexMetadata(marketingLocaleFromHeader((await headers()).get('accept-language')));
}

export default async function DocsPage() {
  const locale = marketingLocaleFromHeader((await headers()).get('accept-language'));
  return (
    <DocsIndex
      initialLocale={locale}
      descriptions={index.descriptions}
      tasks={index.tasks}
      unpublished={index.unpublished}
    />
  );
}
