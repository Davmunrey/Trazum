'use client';

import { ArrowRight, ArrowUpRight } from 'lucide-react';

import { COPY, ILLUSTRATIVE_BILL, MORE_LINKS, type LandingCopy } from '../lib/landing-copy';
import type { MarketingLocale } from '../lib/marketing-locales';
import { COMMAND } from '../lib/site';
import type { SiteCopy } from '../lib/site-copy';
import { CommandLine } from './site/CommandLine';
import { GitHubButton } from './site/GitHub';
import { DashboardAction } from './site/SiteHeader';
import { SiteFrame } from './site/SiteFrame';

/**
 * The landing: the site's front door, in Persuade mode.
 *
 * In the order a visitor needs it: what Trazum does, in the README's own
 * first line; the one command, with a control that copies it, and the way
 * into the dashboard; a real bill as the worked example; why that number
 * holds up; what never leaves the machine; the three other things it does;
 * and the command again, with the way in and the way to GitHub.
 *
 * Every sentence is the README's (`lib/landing-copy.ts` says why), and the
 * bill is the README's illustrative one, labelled as the README labels it.
 *
 * One authored moment: the bill's share bars fill once on load (`ledger-bar`
 * in `globals.css`), time-based, finished by default, and off for a reader
 * who asked for less motion. Nothing else moves, and no text waits for
 * anything to be visible.
 */

const WRAP = 'mx-auto w-full max-w-[1440px] px-4 sm:px-8 lg:px-12';

function Kicker({ children, inverse = false }: { children: string; inverse?: boolean }) {
  return (
    <p
      className={`font-mono text-[12px] font-semibold tracking-[0.1em] uppercase ${
        inverse ? 'text-primary dark:text-terracotta' : 'text-terracotta'
      }`}
    >
      {children}
    </p>
  );
}

function BillTable({
  caption,
  t,
  rows,
}: {
  caption: string;
  t: LandingCopy;
  rows: readonly { name: string; calls: number; usd: string; share: string }[];
}) {
  return (
    <table className="mt-6 w-full border-collapse font-mono text-[13px] tabular-nums sm:text-[14px]">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr className="border-b-2 border-foreground text-left text-[11px] tracking-[0.08em] text-muted-foreground uppercase">
          <th scope="col" className="py-2 pr-3 font-semibold">
            {caption}
          </th>
          <th scope="col" className="py-2 pr-3 text-right font-semibold">
            {t.billCalls}
          </th>
          <th scope="col" className="py-2 pr-3 text-right font-semibold">
            USD
          </th>
          <th scope="col" className="py-2 text-right font-semibold sm:text-left">
            {t.billShare}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.name} className="border-b border-rule">
            <th scope="row" className="py-2.5 pr-3 text-left font-normal break-all">
              {row.name}
            </th>
            <td className="py-2.5 pr-3 text-right">{row.calls}</td>
            <td className="py-2.5 pr-3 text-right">{row.usd}</td>
            <td className="py-2.5 text-right sm:text-left">
              <span className="flex items-center justify-end gap-3 sm:justify-start">
                <span aria-hidden="true" className="hidden h-3.5 w-28 shrink-0 border-2 border-foreground bg-background sm:block lg:w-36">
                  <span className="ledger-bar block h-full bg-primary" style={{ width: row.share }} />
                </span>
                <span className="w-12 text-right">{row.share}</span>
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Page({ t, copy }: { t: LandingCopy; copy: SiteCopy }) {
  const bill = ILLUSTRATIVE_BILL;
  return (
    <>
      <section aria-labelledby="landing-title" className={`${WRAP} pt-8 pb-12 sm:pt-12 lg:pt-14 lg:pb-20`}>
        <p className="font-mono text-[12px] leading-relaxed text-muted-foreground sm:text-[13px]">{t.eyebrow}</p>
        <h1
          id="landing-title"
          className="mt-3 max-w-[24ch] font-display text-[clamp(36px,5.9vw,88px)] leading-[0.99] font-bold tracking-[-0.045em] text-balance sm:mt-4"
        >
          {t.heroTitle}
        </h1>
        <div className="mt-6 grid gap-5 border-t-2 border-foreground pt-5 sm:mt-8 sm:gap-6 sm:pt-6 lg:mt-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,560px)] lg:gap-x-16 lg:gap-y-7 lg:pt-8">
          <p className="max-w-[58ch] text-[15px] leading-[1.6] text-muted-foreground sm:text-[18px] lg:col-start-1 lg:row-start-1">
            {t.heroLede}
          </p>
          <div className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1">
            <p className="mb-2.5 text-[13px] font-semibold sm:text-[14px]">{t.commandLabel}</p>
            <CommandLine command={COMMAND} copyLabel={copy.copyCommand} copiedLabel={copy.copied} />
          </div>
          <div className="flex flex-wrap items-center gap-3 lg:col-start-1 lg:row-start-2">
            <DashboardAction label={copy.dashboardCta} className="min-h-12 px-6 text-[16px]" />
            <GitHubButton label={copy.links.github} opensExternal={copy.opensExternal} className="min-h-12" />
          </div>
        </div>
      </section>

      <section aria-labelledby="bill-title" className="border-y-2 border-foreground bg-layer">
        <div className={`${WRAP} grid gap-10 py-14 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16 lg:py-24`}>
          <div className="max-w-[56ch]">
            <Kicker>{t.billKicker}</Kicker>
            <h2
              id="bill-title"
              className="mt-3 font-display text-[clamp(32px,4vw,56px)] leading-[1.04] font-bold tracking-[-0.04em] text-balance"
            >
              {t.billTitle}
            </h2>
            <p className="mt-5 text-[16px] leading-[1.7] text-muted-foreground">{t.billBody}</p>
            <p className="mt-6 border-l-4 border-foreground pl-4 text-[15px] leading-relaxed font-semibold">{t.billCaveat}</p>
          </div>
          <figure data-illustrative-bill="" className="min-w-0 self-start border-2 border-foreground bg-background">
            <div className="flex items-center gap-2.5 overflow-x-auto border-b-2 border-foreground bg-foreground px-4 py-2.5 font-mono text-[13px] whitespace-nowrap text-background dark:bg-muted dark:text-foreground">
              <span aria-hidden="true" className="text-primary">
                $
              </span>
              {bill.command}
            </div>
            <div className="px-4 py-6 sm:px-7 sm:py-7">
              <p className="font-mono text-[12px] tracking-[0.08em] text-muted-foreground uppercase">{t.billHeading}</p>
              <p className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-display text-[clamp(52px,6vw,84px)] leading-none font-bold tracking-[-0.05em] tabular-nums">
                  {bill.total}
                </span>
                <span className="text-[16px] font-semibold">{t.billTotal(bill.calls)}</span>
              </p>
              <p className="mt-3 font-mono text-[12px] leading-relaxed text-muted-foreground sm:text-[13px]">
                {t.billPeriod(bill.from, bill.to, bill.days)}
              </p>
              <BillTable caption={t.billProject} t={t} rows={bill.projects} />
              <BillTable caption={t.billModel} t={t} rows={bill.models} />
            </div>
            <figcaption className="border-t-2 border-foreground px-4 py-3 text-[13px] leading-relaxed text-muted-foreground sm:px-7">
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
            </figcaption>
          </figure>
        </div>
      </section>

      <section aria-labelledby="reasons-title" className={`${WRAP} py-14 lg:py-24`}>
        <h2
          id="reasons-title"
          className="border-b-2 border-foreground pb-6 font-display text-[clamp(32px,4vw,56px)] leading-[1.04] font-bold tracking-[-0.04em]"
        >
          {t.reasonsTitle}
        </h2>
        <ol className="grid md:grid-cols-2">
          {t.reasons.map(([title, body], index) => (
            <li
              key={title}
              className="border-b-2 border-foreground py-8 md:py-10 md:odd:border-r-2 md:odd:pr-10 md:even:pl-10"
            >
              <span aria-hidden="true" className="font-mono text-[13px] font-semibold text-terracotta">
                {String(index + 1).padStart(2, '0')}
              </span>
              <h3 className="mt-3 max-w-[26ch] font-display text-[clamp(22px,2.2vw,30px)] leading-[1.15] font-bold tracking-[-0.03em]">
                {title}
              </h3>
              <p className="mt-3 max-w-[58ch] text-[16px] leading-[1.7] text-muted-foreground">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section
        aria-labelledby="never-title"
        className="border-y-2 border-foreground bg-foreground text-background dark:bg-layer dark:text-foreground"
      >
        <div className={`${WRAP} grid gap-10 py-14 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-16 lg:py-24`}>
          <div>
            <h2
              id="never-title"
              className="font-display text-[clamp(34px,4.4vw,64px)] leading-[1.02] font-bold tracking-[-0.045em] text-balance"
            >
              {t.neverTitle}
            </h2>
            <p className="mt-6 max-w-[52ch] text-[16px] leading-[1.7] opacity-80 dark:text-muted-foreground dark:opacity-100">
              {t.neverLede}
            </p>
          </div>
          <div>
            <Kicker inverse>{t.neverLabel}</Kicker>
            <ul className="mt-4 border-t-2 border-background dark:border-foreground">
              {t.neverItems.map((item, index) => (
                <li
                  key={item}
                  className="flex items-baseline justify-between gap-6 border-b-2 border-background py-4 dark:border-foreground"
                >
                  <span className="font-display text-[clamp(24px,2.8vw,38px)] leading-tight font-bold tracking-[-0.03em]">
                    {item}
                  </span>
                  <span aria-hidden="true" className="font-mono text-[13px] opacity-70">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-7 flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="border-2 border-primary bg-primary px-2.5 py-1 font-mono text-[12px] font-semibold tracking-[0.08em] text-primary-foreground uppercase">
                {t.leavesLabel}
              </span>
              <span className="text-[17px] font-semibold">{t.leaves}</span>
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="more-title" className={`${WRAP} py-14 lg:py-24`}>
        <h2
          id="more-title"
          className="border-b-2 border-foreground pb-6 font-display text-[clamp(32px,4vw,56px)] leading-[1.04] font-bold tracking-[-0.04em]"
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
                <code className="self-start border-2 border-foreground bg-layer px-2.5 py-1 font-mono text-[13px] font-semibold">
                  {link.command}
                </code>
                <h3 className="mt-5 font-display text-[clamp(24px,2.4vw,32px)] leading-[1.12] font-bold tracking-[-0.03em]">
                  {item.title}
                </h3>
                <p className="mt-3 flex-1 text-[15.5px] leading-[1.7] text-muted-foreground">{item.body}</p>
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

      <section aria-labelledby="close-title" className="border-t-2 border-foreground bg-layer">
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
