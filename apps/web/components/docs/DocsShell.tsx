'use client';

import { ArrowLeft, ArrowRight, ChevronDown } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';

import { DOCS_COPY, type DocsCopy } from '../../lib/docs/copy';
import { DOC_GROUPS, docHref, docsOf, githubUrl } from '../../lib/docs/manifest';
import type { DocGroup } from '../../lib/docs/manifest';
import type { DocHeading } from '../../lib/docs/types';
import type { MarketingLocale } from '../../lib/marketing-locales';
import { cn } from '../../lib/utils';
import { GitHubMark } from '../site/GitHub';
import { SiteFrame } from '../site/SiteFrame';
import { DocsSearch } from './DocsSearch';

/**
 * A documentation page: the site's header and footer around three things.
 *
 * On the left the documents, grouped by what the reader is trying to do,
 * with the search field above them. In the middle the document, which the
 * server drew and passes in as `body`, so it is HTML and ships no script of
 * its own. On the right its contents, built from the document's headings and
 * sticky while it is read.
 *
 * Narrower than 1280px the contents list is a disclosure above the document,
 * and narrower than 1024px so is the list of documents: both collapsed, both
 * ordinary `<details>`, so they need no script to open and no focus trap to
 * leave. The document is English in every language of the site and the page
 * says so beside it (`lang="en"` marks it for a screen reader).
 */

const WRAP = 'mx-auto w-full max-w-[1440px] px-4 sm:px-8 lg:px-12';
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground';

/** What a page tells the shell about its document: small, and enough to draw everything around it. */
export interface DocPageMeta {
  slug: string;
  title: string;
  path: string;
  group: DocGroup;
  headings: DocHeading[];
  previous: { slug: string; title: string } | null;
  next: { slug: string; title: string } | null;
}

export function DocsNav({ copy, currentSlug }: { copy: DocsCopy; currentSlug?: string }) {
  return (
    <nav aria-label={copy.allDocuments} className="flex flex-col gap-6">
      {DOC_GROUPS.map((group) => (
        <div key={group}>
          <h2 className="border-b-2 border-foreground pb-1.5 font-mono text-[12px] font-semibold tracking-[0.08em] uppercase">
            {copy.groups[group].title}
          </h2>
          <ul className="mt-1.5 flex flex-col">
            {docsOf(group).map((doc) => {
              const current = doc.slug === currentSlug;
              return (
                <li key={doc.slug}>
                  <a
                    href={docHref(doc.slug)}
                    {...(current ? { 'aria-current': 'page' as const } : {})}
                    className={cn(
                      'block border-2 px-2.5 py-1.5 text-[14.5px] leading-snug',
                      current
                        ? 'border-foreground bg-primary font-semibold text-primary-foreground'
                        : 'border-transparent hover:bg-layer-hover',
                      FOCUS,
                    )}
                  >
                    {doc.title}
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Toc({ headings, active, copy }: { headings: readonly DocHeading[]; active: string | null; copy: DocsCopy }) {
  const shown = headings.filter((heading) => heading.depth <= 3);
  if (shown.length === 0) return null;
  return (
    <nav aria-label={copy.onThisPage}>
      <ol className="flex flex-col">
        {shown.map((heading) => {
          const current = heading.id === active;
          return (
            <li key={heading.id}>
              <a
                href={`#${heading.id}`}
                {...(current ? { 'aria-current': 'location' as const } : {})}
                className={cn(
                  'block border-l-2 py-1 leading-snug [overflow-wrap:anywhere]',
                  heading.depth === 2 ? 'pl-3 text-[13.5px] font-medium' : 'pl-6 text-[13px] text-muted-foreground',
                  current ? 'border-foreground bg-primary text-primary-foreground' : 'border-rule hover:border-foreground hover:bg-layer-hover',
                  FOCUS,
                )}
              >
                {heading.text}
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * Two things a long document needs from the page it is in.
 *
 * The heading the reader has scrolled to is the one the contents list marks.
 * And a link to a heading inside a closed disclosure opens the disclosure:
 * the browser cannot scroll to a box that has no layout, so the page opens
 * each `<details>` around the target and scrolls again.
 */
function useDocEffects(ids: readonly string[]): string | null {
  const [active, setActive] = useState<string | null>(null);
  const key = ids.join('\n');
  useEffect(() => {
    const reveal = (arrived = false) => {
      const raw = window.location.hash.slice(1);
      if (raw === '') return;
      let id = raw;
      try {
        id = decodeURIComponent(raw);
      } catch {
        // An address that is not valid text names no heading.
      }
      const target = document.getElementById(id);
      if (target === null) return;
      let opened = false;
      for (let node = target.parentElement; node !== null; node = node.parentElement) {
        if (node instanceof HTMLDetailsElement && !node.open) {
          node.open = true;
          opened = true;
        }
      }
      // On arrival the browser's own scroll to the address may have run before
      // the streamed page had the heading, so the page does it once more.
      if (opened || arrived) target.scrollIntoView();
    };
    const onHash = () => reveal();
    reveal(true);
    window.addEventListener('hashchange', onHash);

    let frame = 0;
    const update = () => {
      frame = 0;
      let current: string | null = null;
      for (const id of key === '' ? [] : key.split('\n')) {
        const element = document.getElementById(id);
        if (element === null) continue;
        if (element.getBoundingClientRect().top <= 140) current = id;
        else break;
      }
      setActive(current);
    };
    const onScroll = () => {
      if (frame === 0) frame = window.requestAnimationFrame(update);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    update();
    return () => {
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('scroll', onScroll);
      if (frame !== 0) window.cancelAnimationFrame(frame);
    };
  }, [key]);
  return active;
}

function Disclosure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className="group border-2 border-foreground">
      <summary
        className={cn(
          'flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2 text-[15px] font-semibold marker:hidden [&::-webkit-details-marker]:hidden',
          FOCUS,
          'focus-visible:-outline-offset-4',
        )}
      >
        {label}
        <ChevronDown className="size-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="max-h-[70dvh] overflow-y-auto border-t-2 border-foreground px-4 py-4">{children}</div>
    </details>
  );
}

function GitHubLink({ copy, siteOpens, path }: { copy: DocsCopy; siteOpens: string; path: string }) {
  return (
    <a
      href={githubUrl(path)}
      target="_blank"
      rel="noreferrer noopener"
      aria-label={`${copy.viewOnGitHub}, ${siteOpens}`}
      data-view-on-github=""
      className={cn(
        'inline-flex min-h-10 shrink-0 items-center gap-2 border-2 border-foreground bg-background px-4 text-[14px] font-semibold transition-colors hover:bg-layer-hover',
        FOCUS,
      )}
    >
      <GitHubMark className="size-4" />
      {copy.viewOnGitHub}
    </a>
  );
}

function Neighbour({
  doc,
  label,
  direction,
}: {
  doc: { slug: string; title: string };
  label: string;
  direction: 'previous' | 'next';
}) {
  const Icon = direction === 'previous' ? ArrowLeft : ArrowRight;
  return (
    <a
      href={docHref(doc.slug)}
      rel={direction === 'previous' ? 'prev' : 'next'}
      className={cn(
        'group flex flex-col gap-1.5 border-2 border-foreground p-4 transition-colors hover:bg-layer-hover',
        direction === 'next' && 'sm:col-start-2 sm:text-right',
        FOCUS,
      )}
    >
      <span
        className={cn(
          'flex items-center gap-2 font-mono text-[12px] font-semibold tracking-[0.08em] text-muted-foreground uppercase',
          direction === 'next' && 'sm:justify-end',
        )}
      >
        {direction === 'previous' && <Icon className="size-4" aria-hidden="true" />}
        {label}
        {direction === 'next' && <Icon className="size-4" aria-hidden="true" />}
      </span>
      <span className="font-display text-[22px] leading-tight font-bold tracking-[-0.02em]">{doc.title}</span>
    </a>
  );
}

export function DocsShell({
  initialLocale,
  meta,
  body,
}: {
  initialLocale: MarketingLocale;
  meta: DocPageMeta;
  /** The document, drawn on the server. */
  body: ReactNode;
}) {
  const ids = useMemo(() => meta.headings.filter((heading) => heading.depth <= 3).map((heading) => heading.id), [meta.headings]);
  const active = useDocEffects(ids);

  return (
    <SiteFrame initialLocale={initialLocale} current="docs">
      {(locale, site) => {
        const t = DOCS_COPY[locale];
        return (
          <div className={`${WRAP} lg:grid lg:grid-cols-[256px_minmax(0,1fr)] lg:gap-x-10 xl:grid-cols-[256px_minmax(0,1fr)_240px] xl:gap-x-12`}>
            <aside className="hidden pt-10 lg:block" aria-label={t.allDocuments}>
              <div className="sticky top-6 flex max-h-[calc(100dvh-3rem)] flex-col gap-6 overflow-y-auto pr-1 pb-6">
                <DocsSearch copy={t}>
                  <DocsNav copy={t} currentSlug={meta.slug} />
                </DocsSearch>
              </div>
            </aside>

            <div className="min-w-0 pt-8 pb-20 lg:pt-10">
              <div className="mb-4 flex flex-col gap-3 lg:hidden">
                <Disclosure label={t.allDocuments}>
                  <DocsSearch copy={t}>
                    <DocsNav copy={t} currentSlug={meta.slug} />
                  </DocsSearch>
                </Disclosure>
              </div>
              {meta.headings.some((heading) => heading.depth <= 3) && (
                <div className="mb-6 xl:hidden">
                  <Disclosure label={t.onThisPage}>
                    <Toc headings={meta.headings} active={active} copy={t} />
                  </Disclosure>
                </div>
              )}

              <div className="mb-8 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b-2 border-foreground pb-4">
                <nav aria-label={t.breadcrumb} className="font-mono text-[12px] font-semibold tracking-[0.08em] uppercase">
                  <a href="/docs" className={cn('underline-offset-4 hover:underline', FOCUS)}>
                    {t.breadcrumb}
                  </a>
                  <span aria-hidden="true" className="px-2 text-muted-foreground">
                    /
                  </span>
                  <span className="text-muted-foreground">{t.groups[meta.group].title}</span>
                </nav>
                <GitHubLink copy={t} siteOpens={site.opensExternal} path={meta.path} />
              </div>

              {locale !== 'en' && (
                <p className="mb-8 border-2 border-foreground bg-layer px-4 py-3 text-[14px] leading-relaxed">{t.englishNote}</p>
              )}

              <article lang="en" className="doc-body" data-doc={meta.slug}>
                {body}
              </article>

              <footer className="mt-16 border-t-2 border-foreground pt-6">
                {(meta.previous !== null || meta.next !== null) && (
                  <nav aria-label={t.groups[meta.group].title} className="mb-6 grid gap-4 sm:grid-cols-2">
                    {meta.previous !== null && <Neighbour doc={meta.previous} label={t.previous} direction="previous" />}
                    {meta.next !== null && <Neighbour doc={meta.next} label={t.next} direction="next" />}
                  </nav>
                )}
                <GitHubLink copy={t} siteOpens={site.opensExternal} path={meta.path} />
              </footer>
            </div>

            <aside className="hidden pt-10 xl:block" aria-label={t.onThisPage}>
              <div className="sticky top-6 max-h-[calc(100dvh-3rem)] overflow-y-auto pb-6">
                <h2 className="border-b-2 border-foreground pb-1.5 font-mono text-[12px] font-semibold tracking-[0.08em] uppercase">
                  {t.onThisPage}
                </h2>
                <div className="mt-2">
                  <Toc headings={meta.headings} active={active} copy={t} />
                </div>
              </div>
            </aside>
          </div>
        );
      }}
    </SiteFrame>
  );
}
