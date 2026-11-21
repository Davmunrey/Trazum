'use client';

import { ArrowUpRight } from 'lucide-react';
import type { ReactNode } from 'react';

import { ROADMAP_COPY } from '../../lib/pages-copy';
import type { MarketingLocale } from '../../lib/marketing-locales';
import type { RoadmapMilestone } from '../../lib/history/types';
import { GITHUB_URL } from '../../lib/site';
import { cn } from '../../lib/utils';
import { GitHubMark } from '../site/GitHub';
import { SiteFrame } from '../site/SiteFrame';

/**
 * `/roadmap`: the milestones in the order `.github/milestones.json` states
 * them, each with its issues and a link to the live milestone, and what
 * `ROADMAP.md` keeps under consideration.
 *
 * There is no date on a milestone and no field that could carry one: the
 * order is the commitment. The page makes no request; an issue shows its
 * title only where the repository's own table of open work already has it.
 */

const WRAP = 'mx-auto w-full max-w-[1440px] px-4 sm:px-8 lg:px-12';
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground';
const SECTION_TITLE = 'font-display text-[clamp(28px,3.2vw,44px)] leading-[1.06] font-bold tracking-[-0.035em]';

export function RoadmapPage({
  initialLocale,
  milestones,
  consideration,
  hasConsideration,
}: {
  initialLocale: MarketingLocale;
  milestones: readonly RoadmapMilestone[];
  /** `## Under consideration`, drawn on the server. */
  consideration: ReactNode;
  hasConsideration: boolean;
}) {
  return (
    <SiteFrame initialLocale={initialLocale}>
      {(locale, site) => {
        const t = ROADMAP_COPY[locale];
        return (
          <>
            <section aria-labelledby="roadmap-title" className={`${WRAP} py-12 lg:py-20`}>
              <p className="font-mono text-[12px] font-semibold tracking-[0.1em] text-terracotta uppercase">Trazum</p>
              <h1 id="roadmap-title" className="mt-3 font-display text-[clamp(44px,8vw,104px)] leading-[0.98] font-bold tracking-[-0.045em]">
                {t.title}
              </h1>
              <p className="mt-5 max-w-[60ch] text-[18px] leading-[1.6] text-muted-foreground">{t.lede}</p>
              {locale !== 'en' && <p className="mt-4 max-w-[60ch] text-[14px] leading-relaxed">{t.englishNote}</p>}
              <p className="mt-6 max-w-[78ch] border-l-4 border-foreground pl-4 text-[14.5px] leading-relaxed" data-no-dates="">
                {t.noDates}
              </p>
            </section>

            <section aria-labelledby="roadmap-order" className="border-t-2 border-foreground bg-layer">
              <div className={`${WRAP} grid gap-6 py-10 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] lg:gap-14 lg:py-14`}>
                <div>
                  <h2 id="roadmap-order" className={SECTION_TITLE}>
                    {t.milestonesTitle}
                  </h2>
                  <p className="mt-3 max-w-[34ch] text-[15px] leading-relaxed text-muted-foreground">{t.milestonesLede}</p>
                  <p className="mt-3 max-w-[34ch] text-[13.5px] leading-relaxed text-muted-foreground">{t.titlesNote}</p>
                </div>
                <ol className="border-t-2 border-foreground">
                  {milestones.map((milestone) => (
                    <li
                      key={milestone.position}
                      data-milestone={milestone.position}
                      className="grid gap-x-6 gap-y-3 border-b border-rule py-6 sm:grid-cols-[56px_minmax(0,1fr)]"
                    >
                      <span
                        role="img"
                        aria-label={t.position(milestone.position)}
                        className={cn(
                          'flex size-12 items-center justify-center border-2 border-foreground font-mono text-[17px] font-bold tabular-nums',
                          milestone.position === 1 ? 'bg-primary text-primary-foreground' : 'bg-background',
                        )}
                      >
                        {String(milestone.position).padStart(2, '0')}
                      </span>
                      <div className="min-w-0">
                        <h3 className="font-display text-[24px] leading-tight font-bold tracking-[-0.025em]">
                          <a
                            href={milestone.url}
                            target="_blank"
                            rel="noreferrer noopener"
                            aria-label={`${milestone.title}: ${t.openMilestone}, ${site.opensExternal}`}
                            className={cn('inline-flex items-start gap-1.5 underline-offset-4 hover:underline', FOCUS)}
                          >
                            <span lang="en" className="[overflow-wrap:anywhere]">
                              {milestone.title}
                            </span>
                            <ArrowUpRight className="mt-1.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                          </a>
                        </h3>
                        <p lang="en" className="mt-2 max-w-[78ch] text-[15.5px] leading-relaxed text-muted-foreground">
                          {milestone.description}
                        </p>
                        <div className="mt-4">
                          <p className="font-mono text-[11.5px] font-semibold tracking-[0.07em] text-muted-foreground uppercase">{milestone.issues.length === 0 ? t.noIssues : t.issues(milestone.issues.length)}</p>
                          {milestone.issues.length > 0 && (
                            <ul className="mt-2 flex flex-col">
                              {milestone.issues.map((issue) => (
                                <li key={issue.number} data-issue={issue.number}>
                                  <a
                                    href={issue.url}
                                    target="_blank"
                                    rel="noreferrer noopener"
                                    aria-label={`#${issue.number}${issue.title === null ? '' : ` ${issue.title}`}, ${site.opensExternal}`}
                                    className={cn('flex min-h-9 items-baseline gap-3 py-1 text-[14.5px] underline-offset-4 hover:underline', FOCUS)}
                                  >
                                    <span className="shrink-0 font-mono text-[13px] font-semibold text-terracotta tabular-nums">#{issue.number}</span>
                                    {issue.title !== null && (
                                      <span lang="en" className="min-w-0 [overflow-wrap:anywhere]">
                                        {issue.title}
                                      </span>
                                    )}
                                  </a>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </section>

            <section aria-labelledby="roadmap-consideration" className="border-t-2 border-foreground">
              <div className={`${WRAP} py-10 lg:py-14`}>
                <h2 id="roadmap-consideration" className={SECTION_TITLE}>
                  {t.considerationTitle}
                </h2>
                <p className="mt-3 max-w-[60ch] text-[15px] leading-relaxed text-muted-foreground">{t.considerationLede}</p>
                {hasConsideration ? (
                  <article lang="en" className="doc-body mt-8 max-w-[78ch]" data-roadmap-consideration="">
                    {consideration}
                  </article>
                ) : (
                  <p className="mt-6 text-[15px]">{t.considerationMissing}</p>
                )}
                <a
                  href={`${GITHUB_URL}/blob/main/ROADMAP.md`}
                  target="_blank"
                  rel="noreferrer noopener"
                  aria-label={`${t.viewOnGitHub}, ${site.opensExternal}`}
                  className={cn('mt-10 inline-flex min-h-10 items-center gap-2 border-2 border-foreground bg-background px-4 text-[14px] font-semibold hover:bg-layer-hover', FOCUS)}
                >
                  <GitHubMark className="size-4" />
                  {t.viewOnGitHub}
                </a>
              </div>
            </section>
          </>
        );
      }}
    </SiteFrame>
  );
}
