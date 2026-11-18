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
 * the first screen; then the story (`landing/Story.tsx`): a laptop, the CLI
 * at work on its screen, and a lid that closes over what never leaves the
 * machine; then why the number holds up, the three other things it does,
 * and the command again with the way in and the way to GitHub.
 *
 * Every sentence is the README's (`lib/landing-copy.ts` says why), and every
 * character on the laptop's screen is what the built CLI printed
 * (`lib/landing-terminal.ts`). The page is paper first; ink is for type,
 * rules and the laptop's screen. DESIGN.md, "Landing: the story told by
 * scrolling", is the rule this follows.
 */

const WRAP = 'mx-auto w-full max-w-[1440px] px-4 sm:px-8 lg:px-12';

function Page({ t, copy }: { t: LandingCopy; copy: SiteCopy }) {
  const bill = ILLUSTRATIVE_BILL;
  return (
    <>
      <section aria-labelledby="landing-title" className={`${WRAP} pt-7 pb-8 sm:pt-10 lg:pt-12 lg:pb-12`}>
        <p className="font-mono text-[12px] leading-relaxed text-muted-foreground sm:text-[13px]">{t.eyebrow}</p>
        <h1
          id="landing-title"
          className="mt-3 max-w-[22ch] font-display text-[clamp(34px,4.9vw,72px)] leading-[1.0] font-bold tracking-[-0.045em] text-balance sm:mt-4"
        >
          {t.heroTitle}
        </h1>
        <div className="mt-6 grid gap-4 sm:mt-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,560px)] lg:items-end lg:gap-x-16">
          <div className="min-w-0 lg:col-start-2 lg:row-start-1">
            <p className="mb-2.5 text-[13px] font-semibold sm:text-[14px]">{t.commandLabel}</p>
            <CommandLine command={COMMAND} copyLabel={copy.copyCommand} copiedLabel={copy.copied} />
          </div>
          <div className="flex flex-wrap items-center gap-3 lg:col-start-1 lg:row-start-1">
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

      <section aria-labelledby="reasons-title" className="border-t-2 border-foreground bg-layer">
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
        <div className="grid lg:grid-cols-3">
          {(['ci', 'mcp', 'trim'] as const).map((key, index) => {
            const item = t.more[key];
            const link = MORE_LINKS[key];
            return (
              <article
                key={key}
                className={`flex flex-col border-b-2 border-foreground py-8 lg:py-10 ${
                  index === 0 ? 'lg:pr-8' : index === 1 ? 'lg:border-x-2 lg:px-8' : 'lg:pl-8'
                }`}
              >
                <code className="self-start border-2 border-foreground bg-primary px-2.5 py-1 font-mono text-[13px] font-semibold text-primary-foreground">
                  {link.command}
                </code>
                <h3 className="mt-5 font-display text-[clamp(22px,2.2vw,30px)] leading-[1.12] font-bold tracking-[-0.03em]">
                  {item.title}
                </h3>
                {/* The budget check has no scene on the laptop (the repository has no example call of it to run), so its words are here. */}
                {key === 'mcp' && <p className="mt-3 flex-1 text-[15.5px] leading-[1.7] text-muted-foreground">{item.body}</p>}
                <a
                  href={link.href}
                  {...(link.external
                    ? { target: '_blank', rel: 'noreferrer noopener', 'aria-label': `${item.link}, ${copy.opensExternal}` }
                    : {})}
                  className="mt-6 inline-flex items-center gap-2 self-start border-b-2 border-foreground pb-0.5 text-[15px] font-semibold transition-colors hover:text-terracotta focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
                >
                  {item.link}
                  {link.external ? (
                    <ArrowUpRight className="size-4" aria-hidden="true" />
                  ) : (
                    <ArrowRight className="size-4" aria-hidden="true" />
                  )}
                </a>
              </article>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="close-title" data-landing-close="" className="border-t-2 border-foreground">
        <div className={`${WRAP} grid items-end gap-10 py-14 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-16 lg:py-24`}>
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
