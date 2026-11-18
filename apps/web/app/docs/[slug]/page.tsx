import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { DocBody } from '../../../components/docs/DocBody';
import { DocsShell } from '../../../components/docs/DocsShell';
import { DOCS, neighbours } from '../../../lib/docs/manifest';
import { loadDoc } from '../../../lib/docs/load';
import { marketingLocaleFromHeader } from '../../../lib/marketing-locales';
import { docMetadata } from '../../../lib/site-metadata';

/**
 * `/docs/<slug>`: one document of the repository, drawn by the site.
 *
 * What is on the page is what `scripts/build-docs-site.mjs` wrote from the
 * file when the site was built. Nothing is read at request time, and nothing
 * the visitor sends reaches the renderer: the slug picks one of the pages the
 * build made, and an address that is none of them is the site's not-found page.
 */
export function generateStaticParams() {
  return DOCS.map((doc) => ({ slug: doc.slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const doc = await loadDoc((await params).slug);
  return doc === null ? {} : docMetadata(doc);
}

export default async function DocPage({ params }: Props) {
  const { slug } = await params;
  const doc = await loadDoc(slug);
  if (doc === null) notFound();
  const locale = marketingLocaleFromHeader((await headers()).get('accept-language'));
  const { previous, next } = neighbours(slug);
  return (
    <DocsShell
      initialLocale={locale}
      meta={{
        slug: doc.slug,
        title: doc.title,
        path: doc.path,
        group: doc.group,
        headings: doc.headings,
        previous: previous && { slug: previous.slug, title: previous.title },
        next: next && { slug: next.slug, title: next.title },
      }}
      body={<DocBody blocks={doc.blocks} />}
    />
  );
}
