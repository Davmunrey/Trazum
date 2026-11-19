'use client';

import { ArrowRight, ArrowUpRight } from 'lucide-react';

import { COPY, ILLUSTRATIVE_BILL, MORE_LINKS, type LandingCopy } from '../lib/landing-copy';
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
 * the first screen; then the desk (`landing/Story.tsx`): the one laptop lands
 * on it, `bill` runs and the receipt prints, and every capability lies around
 * it as an object that puts its own output on the screen; then why the number
 * holds up, the one thing the desk cannot show (the budget check for agents),
 * and the command again with the way in and the way to GitHub.
 *
 * Every sentence is the README's (`lib/landing-copy.ts` says why), and every
 * character on the laptop's screen is what the built CLI printed
 * (`lib/landing-terminal.ts`). The page is paper first; ink is for type,
 * rules and the laptop's screen. DESIGN.md, "Landing: the desk", is the
 * rule this follows.
 */

const WRAP = 'mx-auto w-full max-w-[1440px] px-4 sm:px-8 lg:px-12';

function Page({ t, copy }: { t: LandingCopy; copy: SiteCopy }) {
  const bill = ILLUSTRATIVE_BILL;
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

      <Story t={t} />

      <p className={`${WRAP} border-t-2 border-foreground py-4 text-[13px] leading-relaxed text-muted-foreground`}>
        {t.billNote}{' '}
        <a
          href={bill.source}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1 font-mono font-semibold text-foreground underline underline-offset-4"
        >
          {t.billSource}
          <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </a>
      </p>

      <section aria-labelledby="reasons-title" className="landing-ledge border-t-2 border-foreground bg-layer">
        <div className={`${WRAP} py-14 lg:py-20`}>
          <h2
            id="reasons-title"
            className="border-b-2 border-foreground pb-6 font-display text-[clamp(30px,3.6vw,52px)] leading-[1.04] font-bold tracking-[-0.04em]"
          >
            {t.reasonsTitle}
          </h2>
          <ol className="grid md:grid-cols-2 xl:grid-cols-4">
            {t.reasons.map(([title, body], index) => (
              <li
                key={title}
                className="border-b-2 border-foreground py-8 md:odd:border-r-2 md:odd:pr-8 md:even:pl-8 xl:border-r-2 xl:px-6 xl:first:pl-0 xl:last:border-r-0 xl:last:pr-0"
              >
                <span aria-hidden="true" className="inline-block bg-primary px-1.5 font-mono text-[13px] font-semibold text-primary-foreground">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <h3 className="mt-3 max-w-[26ch] font-display text-[clamp(21px,1.8vw,26px)] leading-[1.15] font-bold tracking-[-0.03em]">
                  {title}
                </h3>
                <p className="mt-3 max-w-[58ch] text-[15px] leading-[1.7] text-muted-foreground">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section aria-labelledby="more-title" className={`${WRAP} py-14 lg:py-20`}>
        <h2
          id="more-title"
          className="border-b-2 border-foreground pb-6 font-display text-[clamp(30px,3.6vw,52px)] leading-[1.04] font-bold tracking-[-0.04em]"
        >
          {t.moreTitle}
        </h2>
        {/* The desk shows the gate and the trimming; the budget check has no object on it (the repository has no example call of it to run), so its words are here. */}
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

      <section aria-labelledby="close-title" data-landing-close="" className="landing-ledge border-t-2 border-foreground">
        <div className={`${WRAP} grid items-end gap-10 py-14 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-16 lg:py-20`}>
          <div>
            <h2
              id="close-title"
              className="max-w-[18ch] font-display text-[clamp(38px,5.4vw,80px)] leading-[1] font-bold tracking-[-0.05em] text-balance"
            >
              {t.closeTitle}
            </h2>
            <p className="mt-6 max-w-[50ch] text-[17px] leading-[1.65] text-muted-foreground">{t.closeBody}</p>
          </div>
          <div className="min-w-0">
            <CommandLine command={COMMAND} copyLabel={copy.copyCommand} copiedLabel={copy.copied} />
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <DashboardAction label={copy.dashboardCta} className="min-h-12 px-6 text-[16px]" />
              <GitHubButton label={copy.links.github} opensExternal={copy.opensExternal} className="min-h-12" />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

export function Landing({ initialLocale }: { initialLocale: MarketingLocale }) {
  return <SiteFrame initialLocale={initialLocale}>{(locale, copy) => <Page t={COPY[locale]} copy={copy} />}</SiteFrame>;
}
