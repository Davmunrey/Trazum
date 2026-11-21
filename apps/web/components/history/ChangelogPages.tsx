'use client';

import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';

import { CHANGELOG_COPY, type ChangelogCopy } from '../../lib/pages-copy';
import type { MarketingLocale } from '../../lib/marketing-locales';
import type { DocHeading } from '../../lib/docs/types';
import type { ReleaseSummary } from '../../lib/history/types';
import { CHANGELOG_PATH, CHANGELOG_URL } from '../../lib/site';
import { cn } from '../../lib/utils';
import { GitHubMark } from '../site/GitHub';
import { SiteFrame } from '../site/SiteFrame';

/**
 * `/changelog` and `/changelog/<version>`.
 *
 * The file is a million bytes, so the index draws the unreleased changes and
 * the newest few releases in full and lists every other one with its own
 * page; each release has an anchor on the index (its heading when it is drawn
 * there, its row in the list when it is not) and an address of its own. A
 * release whose heading carries a title and no date shows the title, and no
 * date is made up for it.
 */

const WRAP = 'mx-auto w-full max-w-[1440px] px-4 sm:px-8 lg:px-12';
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground';
const SECTION_TITLE = 'font-display text-[clamp(28px,3.2vw,44px)] leading-[1.06] font-bold tracking-[-0.035em]';

/** A release's address, or the index's anchor for the unreleased changes. */
export function releaseHref(release: Pick<ReleaseSummary, 'version' | 'unreleased'>): string {
  return release.unreleased || release.version === null ? `${CHANGELOG_PATH}#unreleased` : `${CHANGELOG_PATH}/${release.version}`;
}

function Label({ release, t }: { release: ReleaseSummary; t: ChangelogCopy }) {
  if (release.unreleased) return null;
  if (release.labelKind === 'date') return <time dateTime={release.label ?? undefined}>{release.label}</time>;
  if (release.labelKind === 'title') return <span lang="en">{release.label}</span>;
  return <span className="text-muted-foreground">{t.notDated}</span>;
}

function GitHubLink({ t, opens, slug }: { t: ChangelogCopy; opens: string; slug?: string }) {
  return (
    <a
      href={`${CHANGELOG_URL}${slug ? `#${slug}` : ''}`}
      target="_blank"
      rel="noreferrer noopener"
      aria-label={`${t.viewOnGitHub}, ${opens}`}
      data-view-on-github=""
      className={cn('inline-flex min-h-10 shrink-0 items-center gap-2 border-2 border-foreground bg-background px-4 text-[14px] font-semibold hover:bg-layer-hover', FOCUS)}
    >
      <GitHubMark className="size-4" />
      {t.viewOnGitHub}
    </a>
  );
}

/**
 * An address that names a release the page does not draw goes to the
 * release's page; one that names a drawn release scrolls to it. Both
 * spellings work: the version (`#2.5.1`) and the address GitHub gives the
 * heading in the file (`#251--a-bill-for-a-period`), which is what an old
 * link to `CHANGELOG.md` carries.
 */
function useAnchorLanding(anchors: Readonly<Record<string, string>>, drawnKey: string) {
  useEffect(() => {
    const drawn = new Set(drawnKey.split(' '));
    const land = () => {
      const raw = window.location.hash.slice(1);
      if (raw === '') return;
      let hash = raw;
      try {
        hash = decodeURIComponent(raw);
      } catch {
        // An address that is not valid text names no release.
      }
      const anchor = Object.hasOwn(anchors, hash) ? anchors[hash] : hash;
      if (!/^(?:unreleased|\d+\.\d+\.\d+)$/.test(anchor)) return;
      if (drawn.has(anchor)) {
        if (anchor !== hash) window.history.replaceState(null, '', `${CHANGELOG_PATH}#${anchor}`);
        document.getElementById(anchor)?.scrollIntoView();
        return;
      }
      if (anchor !== 'unreleased' && Object.values(anchors).includes(anchor)) window.location.replace(`${CHANGELOG_PATH}/${anchor}`);
    };
    land();
    window.addEventListener('hashchange', land);
    return () => window.removeEventListener('hashchange', land);
  }, [anchors, drawnKey]);
}

export interface FeaturedRelease {
  release: ReleaseSummary;
  headings: DocHeading[];
  /** The release's notes, drawn on the server. */
  body: ReactNode;
}

export function ChangelogIndexPage({
  initialLocale,
  intro,
  releases,
  featured,
  anchors,
}: {
  initialLocale: MarketingLocale;
  intro: ReactNode;
  releases: readonly ReleaseSummary[];
  featured: readonly FeaturedRelease[];
  /** GitHub's address of each heading in the file, to the release it is. */
  anchors: Readonly<Record<string, string>>;
}) {
  const drawn = new Set(featured.map((entry) => entry.release.anchor));
  useAnchorLanding(anchors, [...drawn].join(' '));
  const released = releases.filter((release) => !release.unreleased);

  return (
    <SiteFrame initialLocale={initialLocale}>
      {(locale, site) => {
        const t = CHANGELOG_COPY[locale];
        return (
          <>
            <section aria-labelledby="changelog-title" className={`${WRAP} py-12 lg:py-20`}>
              <p className="font-mono text-[12px] font-semibold tracking-[0.1em] text-terracotta uppercase">Trazum</p>
              <h1 id="changelog-title" className="mt-3 font-display text-[clamp(44px,8vw,104px)] leading-[0.98] font-bold tracking-[-0.045em]">
                {t.title}
              </h1>
              <p className="mt-5 max-w-[60ch] text-[18px] leading-[1.6] text-muted-foreground">{t.lede}</p>
              {locale !== 'en' && <p className="mt-4 max-w-[60ch] text-[14px] leading-relaxed">{t.englishNote}</p>}
              <div lang="en" className="doc-body mt-6 max-w-[78ch] text-[15px]" data-changelog-intro="">
                {intro}
              </div>
            </section>

            <section aria-labelledby="changelog-all" className="border-t-2 border-foreground bg-layer">
              <div className={`${WRAP} py-10 lg:py-14`}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2">
                  <h2 id="changelog-all" className={SECTION_TITLE}>
                    {t.allReleases}
                    <span className="ml-3 font-mono text-[14px] font-medium tracking-normal text-muted-foreground" data-release-count={released.length}>
                      {t.count(released.length)}
                    </span>
                  </h2>
                  <p className="max-w-[56ch] text-[14px] text-muted-foreground">{t.drawnBelow(featured.filter((entry) => !entry.release.unreleased).length)}</p>
                </div>
                <div
                  role="region"
                  aria-label={t.allReleases}
                  // biome-ignore lint/a11y/noNoninteractiveTabindex: a list longer than the screen scrolls inside this box, and the box has to be reachable by keyboard
                  tabIndex={0}
                  className="mt-6 max-h-[420px] overflow-y-auto border-y-2 border-foreground focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-terracotta"
                >
                  <ol className="grid sm:grid-cols-2 xl:grid-cols-3" data-release-list="">
                    {releases.map((release) => {
                      const inFull = drawn.has(release.anchor);
                      return (
                        <li key={release.anchor} id={inFull ? undefined : release.anchor} data-release={release.anchor} className="border-b border-rule">
                          <a
                            href={inFull ? `#${release.anchor}` : releaseHref(release)}
                            className={cn('flex min-h-11 items-baseline gap-3 px-3 py-2 hover:bg-layer-hover', FOCUS, 'focus-visible:-outline-offset-2')}
                          >
                            <span className="w-[72px] shrink-0 font-mono text-[14px] font-bold tabular-nums">{release.unreleased ? t.unreleased : release.version}</span>
                            <span className="min-w-0 flex-1 text-[14px] [overflow-wrap:anywhere]">
                              <Label release={release} t={t} />
                            </span>
                            <span className="hidden shrink-0 font-mono text-[11px] text-muted-foreground uppercase sm:inline">{inFull ? t.inFull : t.ownPage}</span>
                          </a>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              </div>
            </section>

            {featured.map(({ release, headings, body }) => (
              <section key={release.anchor} aria-labelledby={release.anchor} className="border-t-2 border-foreground">
                <div className={`${WRAP} py-10 lg:py-14`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-3 border-b-2 border-foreground pb-4">
                    <h2 id={release.anchor} className={cn(SECTION_TITLE, 'scroll-mt-6')}>
                      <span>{release.unreleased ? t.unreleased : release.version}</span>
                      <span className="ml-4 font-sans text-[18px] font-medium tracking-normal text-muted-foreground">
                        <Label release={release} t={t} />
                      </span>
                    </h2>
                    <div className="flex flex-wrap gap-3">
                      {!release.unreleased && (
                        <a
                          href={releaseHref(release)}
                          className={cn('inline-flex min-h-10 items-center gap-2 border-2 border-foreground bg-background px-4 text-[14px] font-semibold hover:bg-layer-hover', FOCUS)}
                        >
                          {t.ownPage}
                          <ArrowRight className="size-4" aria-hidden="true" />
                        </a>
                      )}
                      <GitHubLink t={t} opens={site.opensExternal} slug={release.slug} />
                    </div>
                  </div>
                  {release.unreleased && <p className="mt-4 max-w-[78ch] text-[15px] text-muted-foreground">{t.unreleasedLede}</p>}
                  <article lang="en" className="doc-body mt-6 max-w-[78ch]" data-release-body={release.anchor} data-headings={headings.length}>
                    {body}
                  </article>
                </div>
              </section>
            ))}
          </>
        );
      }}
    </SiteFrame>
  );
}

export function ReleasePage({
  initialLocale,
  release,
  newer,
  older,
  headings,
  body,
}: {
  initialLocale: MarketingLocale;
  release: ReleaseSummary;
  newer: ReleaseSummary | null;
  older: ReleaseSummary | null;
  headings: readonly DocHeading[];
  body: ReactNode;
}) {
  return (
    <SiteFrame initialLocale={initialLocale}>
      {(locale, site) => {
        const t = CHANGELOG_COPY[locale];
        return (
          <div className={`${WRAP} pt-8 pb-20 lg:pt-10`}>
            <div className="mb-8 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b-2 border-foreground pb-4">
              <nav aria-label={t.breadcrumb} className="font-mono text-[12px] font-semibold tracking-[0.08em] uppercase">
                <a href={CHANGELOG_PATH} className={cn('underline-offset-4 hover:underline', FOCUS)}>
                  {t.breadcrumb}
                </a>
                <span aria-hidden="true" className="px-2 text-muted-foreground">
                  /
                </span>
                <span className="text-muted-foreground">{release.version}</span>
              </nav>
              <GitHubLink t={t} opens={site.opensExternal} slug={release.slug} />
            </div>
            {locale !== 'en' && <p className="mb-8 border-2 border-foreground bg-layer px-4 py-3 text-[14px] leading-relaxed">{t.englishNote}</p>}

            <h1 className="font-display text-[clamp(40px,6vw,80px)] leading-[0.98] font-bold tracking-[-0.045em]" data-release-title={release.version}>
              {release.version}
            </h1>
            <p className="mt-3 text-[18px] text-muted-foreground">
              {release.labelKind === 'date' ? t.dateOf(release.label ?? '') : <Label release={release} t={t} />}
            </p>

            {headings.length > 0 && (
              <nav aria-label={t.onThisPage} className="mt-8 max-w-[78ch]">
                <ul className="flex flex-wrap gap-2">
                  {headings
                    .filter((heading) => heading.depth === 3)
                    .map((heading) => (
                      <li key={heading.id}>
                        <a lang="en" href={`#${heading.id}`} className={cn('inline-flex min-h-9 items-center border-2 border-foreground px-3 text-[13.5px] font-semibold hover:bg-layer-hover', FOCUS)}>
                          {heading.text}
                        </a>
                      </li>
                    ))}
                </ul>
              </nav>
            )}

            <article lang="en" className="doc-body mt-8 max-w-[78ch]" data-release-body={release.anchor}>
              {body}
            </article>

            <footer className="mt-16 border-t-2 border-foreground pt-6">
              <nav aria-label={t.allReleases} className="mb-6 grid gap-4 sm:grid-cols-2">
                {newer !== null && (
                  <a href={releaseHref(newer)} rel="prev" className={cn('flex flex-col gap-1.5 border-2 border-foreground p-4 hover:bg-layer-hover', FOCUS)}>
                    <span className="flex items-center gap-2 font-mono text-[12px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                      <ArrowLeft className="size-4" aria-hidden="true" />
                      {t.newer}
                    </span>
                    <span className="font-display text-[22px] leading-tight font-bold tracking-[-0.02em]">{newer.version}</span>
                  </a>
                )}
                {older !== null && (
                  <a href={releaseHref(older)} rel="next" className={cn('flex flex-col gap-1.5 border-2 border-foreground p-4 hover:bg-layer-hover sm:col-start-2 sm:text-right', FOCUS)}>
                    <span className="flex items-center gap-2 font-mono text-[12px] font-semibold tracking-[0.08em] text-muted-foreground uppercase sm:justify-end">
                      {t.older}
                      <ArrowRight className="size-4" aria-hidden="true" />
                    </span>
                    <span className="font-display text-[22px] leading-tight font-bold tracking-[-0.02em]">{older.version}</span>
                  </a>
                )}
              </nav>
              <div className="flex flex-wrap gap-3">
                <a href={CHANGELOG_PATH} className={cn('inline-flex min-h-10 items-center gap-2 border-2 border-foreground bg-background px-4 text-[14px] font-semibold hover:bg-layer-hover', FOCUS)}>
                  <ArrowLeft className="size-4" aria-hidden="true" />
                  {t.allReleasesLink}
                </a>
                <GitHubLink t={t} opens={site.opensExternal} slug={release.slug} />
              </div>
            </footer>
          </div>
        );
      }}
    </SiteFrame>
  );
}
