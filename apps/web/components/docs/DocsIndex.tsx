'use client';

import { ArrowUpRight } from 'lucide-react';

import { DOCS_COPY } from '../../lib/docs/copy';
import { DOC_GROUPS, KEPT, docHref, docsOf, githubUrl } from '../../lib/docs/manifest';
import type { Block } from '../../lib/docs/types';
import type { MarketingLocale } from '../../lib/marketing-locales';
import { DOCS_ON_GITHUB } from '../../lib/site';
import { SiteFrame } from '../site/SiteFrame';
import { DocBody } from './DocBody';
import { DocsSearch } from './DocsSearch';

/**
 * `/docs`: every published document, grouped by what the reader is trying to
 * do, as `docs/README.md` groups them.
 *
 * In the order a reader needs it: a search field over the titles and
 * headings of all of them; the repository's own table of tasks, each row
 * naming the first page of one way in (drawn from `docs/README.md`, so it
 * is not written twice); the five groups; and a short statement of what the
 * site does not publish, with where each of those lives on GitHub.
 */

const WRAP = 'mx-auto w-full max-w-[1440px] px-4 sm:px-8 lg:px-12';
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground';

export function DocsIndex({
  initialLocale,
  descriptions,
  tasks,
  unpublished,
}: {
  initialLocale: MarketingLocale;
  descriptions: Readonly<Record<string, string>>;
  tasks: Block | null;
  unpublished: Readonly<Record<string, number>>;
}) {
  return (
    <SiteFrame initialLocale={initialLocale} current="docs">
      {(locale, site) => {
        const t = DOCS_COPY[locale];
        return (
          <>
            <section aria-labelledby="docs-title" className={`${WRAP} py-12 lg:py-20`}>
              <p className="font-mono text-[12px] font-semibold tracking-[0.1em] text-terracotta uppercase">Trazum</p>
              <h1
                id="docs-title"
                className="mt-3 font-display text-[clamp(44px,8vw,104px)] leading-[0.98] font-bold tracking-[-0.045em]"
              >
                {t.indexTitle}
              </h1>
              <p className="mt-5 max-w-[56ch] text-[18px] leading-[1.6] text-muted-foreground">{t.indexLede}</p>
              {locale !== 'en' && <p className="mt-4 max-w-[56ch] text-[14px] leading-relaxed">{t.englishNote}</p>}
              <div className="mt-8 max-w-[760px]">
                <DocsSearch copy={t} large />
              </div>
            </section>

            {tasks !== null && (
              <section aria-labelledby="docs-tasks" className="border-t-2 border-foreground">
                <div className={`${WRAP} py-10 lg:py-14`}>
                  <h2 id="docs-tasks" className="font-display text-[clamp(28px,3.2vw,44px)] leading-[1.06] font-bold tracking-[-0.035em]">
                    {t.tasksTitle}
                  </h2>
                  <div lang="en" className="doc-body doc-wide mt-6">
                    <DocBody blocks={[tasks]} />
                  </div>
                </div>
              </section>
            )}

            {DOC_GROUPS.map((group, index) => (
              <section
                key={group}
                aria-labelledby={`docs-group-${group}`}
                className={`border-t-2 border-foreground ${index % 2 === 0 ? 'bg-layer' : ''}`}
              >
                <div className={`${WRAP} grid gap-6 py-10 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] lg:gap-14 lg:py-14`}>
                  <div>
                    <h2
                      id={`docs-group-${group}`}
                      className="font-display text-[clamp(28px,3.2vw,44px)] leading-[1.06] font-bold tracking-[-0.035em]"
                    >
                      {t.groups[group].title}
                    </h2>
                    <p className="mt-3 max-w-[34ch] text-[15px] leading-relaxed text-muted-foreground">{t.groups[group].lede}</p>
                  </div>
                  <ul lang="en" className="border-t-2 border-foreground">
                    {docsOf(group).map((doc) => (
                      <li key={doc.slug} className="border-b border-rule">
                        <a
                          href={docHref(doc.slug)}
                          className={`group block px-1 py-4 transition-colors hover:bg-layer-hover sm:px-3 ${FOCUS} focus-visible:-outline-offset-2`}
                        >
                          <span className="block font-display text-[21px] leading-tight font-bold tracking-[-0.02em] underline-offset-4 group-hover:underline">
                            {doc.title}
                          </span>
                          <span className="mt-1.5 block max-w-[78ch] text-[14.5px] leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">
                            {descriptions[doc.slug]}
                          </span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            ))}

            <section aria-labelledby="docs-kept" className="border-t-2 border-foreground">
              <div className={`${WRAP} grid gap-6 py-10 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] lg:gap-14 lg:py-14`}>
                <div>
                  <h2 id="docs-kept" className="font-display text-[clamp(28px,3.2vw,44px)] leading-[1.06] font-bold tracking-[-0.035em]">
                    {t.keptTitle}
                  </h2>
                  <p className="mt-3 max-w-[40ch] text-[15px] leading-relaxed text-muted-foreground">{t.keptLede}</p>
                </div>
                <div>
                  <ul className="grid border-t-2 border-foreground sm:grid-cols-2">
                    {KEPT.map((item) => {
                      const label = t.kept[item.id];
                      const count = item.family === undefined ? undefined : unpublished[item.family];
                      return (
                        <li key={item.id} className="border-b border-rule">
                          <a
                            href={githubUrl(item.path)}
                            target="_blank"
                            rel="noreferrer noopener"
                            aria-label={`${label}, ${site.opensExternal}`}
                            className={`flex min-h-12 items-center justify-between gap-3 px-1 py-2 text-[15px] font-semibold hover:bg-layer-hover sm:px-3 ${FOCUS} focus-visible:-outline-offset-2`}
                          >
                            <span>
                              {label}
                              {count !== undefined && count > 0 && (
                                <span className="ml-2 font-mono text-[13px] font-medium text-muted-foreground">{count}</span>
                              )}
                            </span>
                            <ArrowUpRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                  <a
                    href={DOCS_ON_GITHUB}
                    target="_blank"
                    rel="noreferrer noopener"
                    aria-label={`${t.keptBrowse}, ${site.opensExternal}`}
                    className={`mt-6 inline-flex items-center gap-2 border-b-2 border-foreground pb-0.5 text-[15px] font-semibold ${FOCUS}`}
                  >
                    {t.keptBrowse}
                    <ArrowUpRight className="size-4" aria-hidden="true" />
                  </a>
                </div>
              </div>
            </section>
          </>
        );
      }}
    </SiteFrame>
  );
}
