'use client';

import { ArrowRight } from 'lucide-react';
import type { CSSProperties } from 'react';

import { COPY, MORE_LINKS, type LandingCopy } from '../lib/landing-copy';
import type { MarketingLocale } from '../lib/marketing-locales';
import { COMMAND } from '../lib/site';
import type { SiteCopy } from '../lib/site-copy';
import { CLEARING } from '../lib/story-timeline';
import { Story } from './landing/Story';
import { CommandLine } from './site/CommandLine';
import { GitHubButton } from './site/GitHub';
import { DashboardAction } from './site/SiteHeader';
import { SiteFrame } from './site/SiteFrame';

/**
 * The landing: the site's front door, in Persuade mode, told as the visitor
 * scrolls.
 *
 * In the order a visitor needs it: what Trazum does, in the README's own
 * first line, with the one command and the way into the dashboard, all in
 * the first screen; then the story (`landing/Story.tsx`), one pinned stage
 * from the desk to the end: the one laptop lands on the desk, `bill` runs and
 * the receipt prints, each capability takes its turn as an object that puts
 * its own output on the screen, the receipt comes forward to say why the
 * number holds up, and the lid closes over what never leaves, with the
 * command, the way in and the way to GitHub. After it, quietly, the one
 * thing the desk cannot show (the budget check for agents).
 *
 * Every sentence is the README's (`lib/landing-copy.ts` says why), and every
 * character on the laptop's screen is what the built CLI printed
 * (`lib/landing-terminal.ts`). The page is paper first; ink is for type,
 * rules and the laptop's screen. DESIGN.md, "Landing: the desk", is the
 * rule this follows.
 */

const WRAP = 'mx-auto w-full max-w-[1440px] px-4 sm:px-8 lg:px-12';

/** The landing in one language: the hero, the story on the desk, what else Trazum does, and the footer. */
function Page({ t, copy }: { t: LandingCopy; copy: SiteCopy }) {
  return (
    <>
      {/* Short enough that the laptop, open on the desk, already stands under it in the first screen. */}
      <section aria-labelledby="landing-title" className={`${WRAP} pt-5 pb-6 sm:pt-8 lg:pt-7 lg:pb-7`}>
        <p className="font-mono text-[12px] leading-relaxed text-muted-foreground sm:text-[13px]">{t.eyebrow}</p>
        {/*
          The headline's measure is in em, not ch: 22ch of Space Grotesk Bold is 14.25em, and a ch read from the
          fallback face before the font arrives is narrower, which wrapped the headline onto a fourth line and then
          back (measured: a layout shift of 0.027 at 1440x900). For the same reason the two actions stack on a phone
          rather than wrap: in the fallback face they did not fit on one line (0.12 at 390x844).
        */}
        <h1
          id="landing-title"
          className="mt-3 max-w-[14.25em] font-display text-[clamp(32px,4.4vw,64px)] leading-[1.0] font-bold tracking-[-0.045em] text-balance sm:mt-4"
        >
          {t.heroTitle}
        </h1>
        <div className="mt-5 grid gap-4 sm:mt-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,560px)] lg:items-end lg:gap-x-16">
          <div className="min-w-0 lg:col-start-2 lg:row-start-1">
            <p className="mb-2.5 text-[13px] font-semibold sm:text-[14px]">{t.commandLabel}</p>
            <CommandLine command={COMMAND} copyLabel={copy.copyCommand} copiedLabel={copy.copied} />
          </div>
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:flex-wrap sm:items-center lg:col-start-1 lg:row-start-1">
            <DashboardAction label={copy.dashboardCta} className="min-h-12 px-6 text-[16px]" />
            <GitHubButton label={copy.links.github} opensExternal={copy.opensExternal} className="min-h-12" />
          </div>
        </div>
      </section>

      <Story t={t} copy={copy} />

      {/*
        The one thing the desk cannot show: the budget check has no chapter (the repository has no example call of it
        to run), so it is one compact band after the story, its name, its command, a sentence and the way in.
      */}
      <section
        aria-labelledby="more-title"
        className={`${WRAP} border-t-2 border-foreground py-6 lg:py-7`}
        data-after-story=""
        style={{ '--clearing': `${CLEARING}svh` } as CSSProperties}
      >
        <div className="grid gap-x-8 gap-y-3 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-baseline">
          <h2 id="more-title" className="font-display text-[clamp(20px,1.7vw,24px)] leading-[1.15] font-bold tracking-[-0.03em]">
            {t.moreTitle}
          </h2>
          <article className="min-w-0">
            <h3 className="flex flex-wrap items-baseline gap-x-3 gap-y-2 font-display text-[clamp(18px,1.5vw,21px)] leading-[1.2] font-bold tracking-[-0.025em]">
              <code className="border-2 border-foreground bg-primary px-2 py-0.5 font-mono text-[13px] font-semibold tracking-normal text-primary-foreground">
                {MORE_LINKS.mcp.command}
              </code>
              {t.more.mcp.title}
            </h3>
            <p className="mt-2 max-w-[64ch] text-[14.5px] leading-[1.6] text-muted-foreground">{t.more.mcp.body}</p>
          </article>
          <a
            href={MORE_LINKS.mcp.href}
            className="inline-flex items-center gap-2 self-start justify-self-start border-b-2 border-foreground pb-0.5 text-[15px] font-semibold whitespace-nowrap transition-colors hover:text-terracotta focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground lg:self-baseline"
          >
            {t.more.mcp.link}
            <ArrowRight className="size-4" aria-hidden="true" />
          </a>
        </div>
      </section>
    </>
  );
}

/** The landing inside the site's frame, which chooses the language and passes its copy down. */
export function Landing({ initialLocale }: { initialLocale: MarketingLocale }) {
  return <SiteFrame initialLocale={initialLocale}>{(locale, copy) => <Page t={COPY[locale]} copy={copy} />}</SiteFrame>;
}
