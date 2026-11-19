'use client';

import { ArrowRight, ArrowUpRight } from 'lucide-react';

import { docHref } from '../../lib/docs/manifest';
import type { MarketingLocale } from '../../lib/marketing-locales';
import { PRO_BREAK_EVEN_TIER, PRO_CONTACT, PRO_FREE_MEMBERS, PRO_MAILTO, PRO_OPEN, PRO_TIERS, euros, share, shareInProse } from '../../lib/pro';
import { PRO_COPY } from '../../lib/pro-copy';
import { GITHUB_URL } from '../../lib/site';
import { cn } from '../../lib/utils';
import { GitHubMark } from '../site/GitHub';
import { SiteFrame } from '../site/SiteFrame';

/**
 * `/pro`: what Trazum Pro is, what it is not, what it would cost, and that it
 * is not open.
 *
 * A page that persuades, quietly: what Pro answers, the one property it is
 * built around, the line between the open tool and Pro, the tiers, and the
 * status with one way to say you want it. Every figure comes from
 * `lib/pro.ts` and is formatted here; none is typed into this file, and
 * `pro-page.test.mjs` parses the table back and compares it with that module.
 *
 * Nothing here sends anything. The call to action is a `mailto:` link to the
 * address the repository publishes, and the page makes no request, sets no
 * cookie and stores nothing: the end-to-end flow watches the network while it
 * reads the page.
 */

const WRAP = 'mx-auto w-full max-w-[1440px] px-4 sm:px-8 lg:px-12';
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground';
const MONO_HEAD = 'font-mono text-[11.5px] font-semibold tracking-[0.07em] uppercase';
const SECTION_TITLE = 'font-display text-[clamp(28px,3.2vw,44px)] leading-[1.06] font-bold tracking-[-0.035em]';
const SPLIT = 'grid gap-6 py-10 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] lg:gap-14 lg:py-14';
const QUIET_BUTTON = 'inline-flex min-h-10 items-center gap-2 border-2 border-foreground bg-background px-4 text-[14px] font-semibold hover:bg-layer-hover';
const TEXT_LINK = 'font-semibold text-terracotta underline underline-offset-4';

const RECEIPT_ANCHOR = 'a-figure-that-still-answers-elsewhere-trazum-receipt';
const RECEIPT_TEST_URL = `${GITHUB_URL}/blob/main/packages/core/test/receipt-redaction.test.js`;
const RELEASES_URL = `${GITHUB_URL}/releases`;

/** A sentence whose names in backticks are code: a command, a function, a package. */
function Prose({ text }: { text: string }) {
  return (
    <>
      {text.split('`').map((part, at) =>
        at % 2 === 1 ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: the parts of one fixed sentence, in their order
          <code key={at} className="font-mono text-[0.92em]">
            {part}
          </code>
        ) : (
          part
        ),
      )}
    </>
  );
}

export function ProPage({ initialLocale }: { initialLocale: MarketingLocale }) {
  return (
    <SiteFrame initialLocale={initialLocale} current="pro">
      {(locale, site) => {
        const t = PRO_COPY[locale];
        const breakEven = PRO_TIERS.find((tier) => tier.id === PRO_BREAK_EVEN_TIER);
        return (
          <>
            <section aria-labelledby="pro-title" className={`${WRAP} py-12 lg:py-20`}>
              {!PRO_OPEN && (
                <p className="font-mono text-[12px] font-semibold tracking-[0.1em] text-terracotta uppercase" data-pro-status="">
                  {t.status}
                </p>
              )}
              <h1 id="pro-title" className="mt-3 font-display text-[clamp(44px,8vw,104px)] leading-[0.98] font-bold tracking-[-0.045em]">
                {t.title}
              </h1>
              <p className="mt-5 max-w-[60ch] text-[18px] leading-[1.6] text-muted-foreground">{t.lede}</p>
            </section>

            <section aria-labelledby="pro-answers" className="border-t-2 border-foreground bg-layer">
              <div className={`${WRAP} ${SPLIT}`}>
                <div>
                  <h2 id="pro-answers" className={SECTION_TITLE}>
                    {t.answersTitle}
                  </h2>
                  <p className="mt-3 max-w-[38ch] text-[15px] leading-relaxed text-muted-foreground">{t.answersLede}</p>
                </div>
                <ol className="border-t-2 border-foreground">
                  {t.answers.map((item, at) => (
                    <li key={item.question} className="grid gap-x-6 gap-y-2 border-b border-rule py-6 sm:grid-cols-[56px_minmax(0,1fr)]">
                      <span aria-hidden="true" className="flex size-12 items-center justify-center border-2 border-foreground bg-background font-mono text-[17px] font-bold tabular-nums">
                        {String(at + 1).padStart(2, '0')}
                      </span>
                      <div className="min-w-0">
                        <h3 className="font-display text-[24px] leading-tight font-bold tracking-[-0.025em]">{item.question}</h3>
                        <p className="mt-2 max-w-[68ch] text-[15.5px] leading-relaxed text-muted-foreground">{item.answer}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </section>

            <section aria-labelledby="pro-property" className="border-t-2 border-foreground">
              <div className={`${WRAP} py-12 lg:py-16`}>
                <h2 id="pro-property" className="max-w-[22ch] font-display text-[clamp(32px,4.6vw,64px)] leading-[1.02] font-bold tracking-[-0.04em]" data-pro-property="">
                  {t.propertyTitle}
                </h2>
                <p className="mt-6 max-w-[72ch] text-[17px] leading-[1.65]">{t.propertyBody}</p>
                <ul className="mt-8 max-w-[78ch] border-t-2 border-foreground">
                  {[t.propertyEmitter, t.propertyTest, t.propertyLabel].map((line) => (
                    <li key={line} className="border-b border-rule py-4 text-[15.5px] leading-relaxed">
                      <Prose text={line} />
                    </li>
                  ))}
                </ul>
                <p className="mt-6 max-w-[78ch] border-l-4 border-foreground pl-4 text-[15.5px] leading-relaxed font-semibold">{t.propertyRule}</p>
                <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
                  <a href={docHref('commands', RECEIPT_ANCHOR)} data-pro-receipt-docs="" className={cn('inline-flex min-h-10 items-center text-[15px]', TEXT_LINK, FOCUS)}>
                    {t.receiptDocs}
                  </a>
                  <a
                    href={RECEIPT_TEST_URL}
                    target="_blank"
                    rel="noreferrer noopener"
                    aria-label={`${t.receiptTest}, ${site.opensExternal}`}
                    className={cn(QUIET_BUTTON, FOCUS)}
                  >
                    <GitHubMark className="size-4" />
                    {t.receiptTest}
                  </a>
                </div>
              </div>
            </section>

            <section aria-labelledby="pro-split" className="border-t-2 border-foreground bg-layer">
              <div className={`${WRAP} ${SPLIT}`}>
                <div>
                  <h2 id="pro-split" className={SECTION_TITLE}>
                    {t.splitTitle}
                  </h2>
                  <p className="mt-3 max-w-[38ch] text-[15px] leading-relaxed text-muted-foreground">{t.splitLede}</p>
                </div>
                <div>
                  <div className="grid gap-8 md:grid-cols-2">
                    {(
                      [
                        ['open', t.openTitle, t.openItems],
                        ['pro', t.proTitle, t.proItems],
                      ] as const
                    ).map(([id, title, items]) => (
                      <div key={id} data-pro-side={id}>
                        <h3 className={cn(MONO_HEAD, 'border-b-2 border-foreground pb-2')}>{title}</h3>
                        <ul>
                          {items.map((item) => (
                            <li key={item} className="border-b border-rule py-3 text-[15.5px] leading-relaxed">
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                  <p className="mt-8 max-w-[78ch] border-l-4 border-foreground pl-4 text-[15px] leading-relaxed" data-pro-promise="">
                    {t.promise}{' '}
                    <a href={docHref('licensing')} className={cn(TEXT_LINK, FOCUS)}>
                      {t.licensingLink}
                    </a>
                  </p>
                </div>
              </div>
            </section>

            <section aria-labelledby="pro-tiers" className="border-t-2 border-foreground">
              <div className={`${WRAP} py-10 lg:py-14`}>
                <h2 id="pro-tiers" className={SECTION_TITLE}>
                  {t.tiersTitle}
                </h2>
                <p className="mt-3 max-w-[68ch] text-[15.5px] leading-relaxed text-muted-foreground">{t.tiersLede}</p>
                <div
                  role="region"
                  aria-label={t.tableCaption}
                  // biome-ignore lint/a11y/noNoninteractiveTabindex: a table wider than a phone scrolls inside this box, and the box has to be reachable by keyboard
                  tabIndex={0}
                  className="mt-6 max-w-full overflow-x-auto border-t-2 border-foreground focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-terracotta"
                >
                  <table className="w-full min-w-[620px] border-collapse text-left" data-pro-tiers="">
                    <caption className="sr-only">{t.tableCaption}</caption>
                    <thead>
                      <tr className="border-b-2 border-foreground">
                        <th scope="col" className={cn(MONO_HEAD, 'px-3 py-2 text-left align-bottom')}>
                          {t.columns.tier}
                        </th>
                        {[t.columns.price, t.columns.spend, t.columns.share].map((label) => (
                          <th key={label} scope="col" className={cn(MONO_HEAD, 'px-3 py-2 text-right align-bottom')}>
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {PRO_TIERS.map((tier, at) => {
                        const below = at > 0 ? PRO_TIERS[at - 1].ceilingEur : null;
                        return (
                          <tr key={tier.id} data-tier={tier.id} className="border-b border-rule">
                            <th scope="row" className="px-3 py-4 font-display text-[22px] leading-tight font-bold tracking-[-0.02em]">
                              {tier.name}
                            </th>
                            <td className="px-3 py-4 text-right font-mono text-[15px] font-semibold whitespace-nowrap tabular-nums" data-cell="price" data-value={tier.priceEur ?? ''}>
                              {tier.priceEur === null ? t.byAgreement : t.perMonth(euros(tier.priceEur, locale))}
                            </td>
                            <td className="px-3 py-4 text-right font-mono text-[15px] whitespace-nowrap tabular-nums" data-cell="spend" data-value={tier.ceilingEur ?? ''}>
                              {tier.ceilingEur !== null ? t.upTo(euros(tier.ceilingEur, locale)) : below !== null ? t.above(euros(below, locale)) : t.byAgreement}
                            </td>
                            <td className="px-3 py-4 text-right font-mono text-[15px] whitespace-nowrap tabular-nums" data-cell="share" data-value={tier.sharePct ?? ''}>
                              {tier.sharePct === null ? t.byAgreement : share(tier.sharePct, locale)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="mt-6 flex max-w-[78ch] flex-col gap-3 text-[15.5px] leading-relaxed">
                  {breakEven !== undefined && breakEven.sharePct !== null && (
                    <p className="border-l-4 border-foreground pl-4 font-semibold" data-pro-break-even="">
                      {t.breakEven(breakEven.name, shareInProse(breakEven.sharePct, locale))}
                    </p>
                  )}
                  <p data-pro-free="">{t.freeLine(PRO_FREE_MEMBERS)}</p>
                  <p className="text-muted-foreground">{t.decided}</p>
                </div>
              </div>
            </section>

            {!PRO_OPEN && (
              <section id="status" aria-labelledby="pro-status" className="border-t-2 border-foreground bg-layer" data-pro-not-open="">
                <div className={`${WRAP} ${SPLIT}`}>
                  <div>
                    <h2 id="pro-status" className={SECTION_TITLE}>
                      {t.notOpenTitle}
                    </h2>
                  </div>
                  <div>
                    <p className="max-w-[68ch] text-[17px] leading-[1.65]">{t.notOpen}</p>
                    <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
                      <a
                        href={PRO_MAILTO}
                        data-pro-cta=""
                        className={cn(
                          'inline-flex min-h-11 items-center justify-center gap-3 border-2 border-foreground bg-primary px-5 text-[15px] font-bold text-primary-foreground shadow-[3px_3px_0_var(--foreground)] transition-[transform,box-shadow] active:translate-x-px active:translate-y-px active:shadow-none',
                          FOCUS,
                        )}
                      >
                        <span>{t.cta}</span>
                        <ArrowRight className="size-[18px]" aria-hidden="true" />
                      </a>
                      <a
                        href={RELEASES_URL}
                        target="_blank"
                        rel="noreferrer noopener"
                        aria-label={`${t.watch}, ${site.opensExternal}`}
                        className={cn(QUIET_BUTTON, FOCUS)}
                      >
                        <GitHubMark className="size-4" />
                        {t.watch}
                        <ArrowUpRight className="size-4" aria-hidden="true" />
                      </a>
                    </div>
                    <p className="mt-5 max-w-[68ch] text-[14.5px] leading-relaxed text-muted-foreground" data-pro-mail-note="">
                      {t.ctaNote(PRO_CONTACT)}
                    </p>
                  </div>
                </div>
              </section>
            )}
          </>
        );
      }}
    </SiteFrame>
  );
}
