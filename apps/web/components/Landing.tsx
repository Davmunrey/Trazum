'use client';

import { ArrowRight } from 'lucide-react';

import { COPY, MORE_LINKS, type LandingCopy } from '../lib/landing-copy';
import type { MarketingLocale } from '../lib/marketing-locales';
import { COMMAND } from '../lib/site';
import type { SiteCopy } from '../lib/site-copy';
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

function Page({ t, copy }: { t: LandingCopy; copy: SiteCopy }) {
  return (
    <>
      <section aria-labelledby="landing-title" className={`${WRAP} pt-7 pb-8 sm:pt-10 lg:pt-12 lg:pb-12`}>
        <p className="font-mono text-[12px] leading-relaxed text-muted-foreground sm:text-[13px]">{t.eyebrow}</p>
        {/*
          The headline's measure is in em, not ch: 22ch of Space Grotesk Bold is 14.25em, and a ch read from the
          fallback face before the font arrives is narrower, which wrapped the headline onto a fourth line and then
          back (measured: a layout shift of 0.027 at 1440x900). For the same reason the two actions stack on a phone
          rather than wrap: in the fallback face they did not fit on one line (0.12 at 390x844).
        */}
        <h1
          id="landing-title"
          className="mt-3 max-w-[14.25em] font-display text-[clamp(34px,4.9vw,72px)] leading-[1.0] font-bold tracking-[-0.045em] text-balance sm:mt-4"
        >
          {t.heroTitle}
        </h1>
        <div className="mt-6 grid gap-4 sm:mt-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,560px)] lg:items-end lg:gap-x-16">
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

      <section aria-labelledby="more-title" className={`${WRAP} border-t-2 border-foreground py-14 lg:py-20`}>
        <h2
          id="more-title"
          className="border-b-2 border-foreground pb-6 font-display text-[clamp(30px,3.6vw,52px)] leading-[1.04] font-bold tracking-[-0.04em]"
        >
          {t.moreTitle}
        </h2>
        {/* The story shows the gate and the trimming; the budget check has no chapter (the repository has no example call of it to run), so its words are here, quiet, after the story. */}
        <article className="flex flex-col border-b-2 border-foreground py-8 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:gap-x-12 lg:py-10">
          <div>
            <code className="inline-block border-2 border-foreground bg-primary px-2.5 py-1 font-mono text-[13px] font-semibold text-primary-foreground">
              {MORE_LINKS.mcp.command}
            </code>
            <h3 className="mt-5 font-display text-[clamp(22px,2.2vw,30px)] leading-[1.12] font-bold tracking-[-0.03em]">{t.more.mcp.title}</h3>
          </div>
          <div>
            <p className="mt-3 text-[15.5px] leading-[1.7] text-muted-foreground lg:mt-0">{t.more.mcp.body}</p>
            <a
              href={MORE_LINKS.mcp.href}
              className="mt-6 inline-flex items-center gap-2 self-start border-b-2 border-foreground pb-0.5 text-[15px] font-semibold transition-colors hover:text-terracotta focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
            >
              {t.more.mcp.link}
              <ArrowRight className="size-4" aria-hidden="true" />
            </a>
          </div>
        </article>
      </section>
    </>
  );
}

export function Landing({ initialLocale }: { initialLocale: MarketingLocale }) {
  return <SiteFrame initialLocale={initialLocale}>{(locale, copy) => <Page t={COPY[locale]} copy={copy} />}</SiteFrame>;
}
