'use client';

import { useRef, useState } from 'react';

import {
  BUNDLED_CATALOGUE,
  TTL_1H_MS,
  UNLABELLED,
  billLevers,
  cacheEconomics,
  cacheHitRate,
  formatSignedUsd,
  formatUsd,
  profileUsage,
  sharesOf,
} from '@trazum/core';
import type { BillLevers, CacheEconomics, UsageProfileReport } from '@trazum/core';

import { track } from './Analytics';
import { AnimatedContent } from './motion/AnimatedContent';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import type { WebMessages } from '../lib/i18n';

/**
 * A usage log, read where it was pasted and nowhere else.
 *
 * This is the CLI's `profile` command in the browser, and the one property that
 * makes it acceptable to offer at all: **the log never leaves the page**. There
 * is no fetch in this file. Parsing, pricing and every verdict below run on
 * `@trazum/core` in the reader's own tab — a usage log names workloads, spend
 * and conversation counts, which is exactly the kind of file nobody should be
 * asked to upload to see a report about it.
 *
 * The copy carries the same doctrine as the CLI: ceilings are named as
 * ceilings, an unsettled cache verdict is reported as unsettled rather than at
 * its flattering end, and "not recorded" is never rendered as "did not happen".
 */

interface Analysis {
  report: UsageProfileReport;
  levers: BillLevers;
  cache: CacheEconomics;
}

/** Rows shown per table before "…and N more". Enough to act on, short enough to read. */
const MAX_ROWS = 8;
const MAX_SLICES = 5;
const MAX_SECTIONS = 3;

export function Bill({ t }: { t: WebMessages }) {
  const [pasted, setPasted] = useState('');
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const n = (value: number): string => value.toLocaleString(t.numberLocale);
  const pct = (fraction: number): string =>
    fraction > 0 && fraction < 0.005 ? '<1%' : `${(fraction * 100).toFixed(0)}%`;

  function analyze(text: string) {
    const report = profileUsage(text, { catalogue: BUNDLED_CATALOGUE });
    const levers = billLevers(report, { catalogue: BUNDLED_CATALOGUE });
    const cache = cacheEconomics(report.total);
    setAnalysis({ report, levers, cache });
    // Shape only, never content: no label names, no spend, no counts.
    track('bill', { priced: report.total.calls > 0, sessions: report.hasSessions });
  }

  async function readFile(file: File | undefined) {
    if (!file) return;
    analyze(await file.text());
  }

  const Eyebrow = ({ children }: { children: React.ReactNode }) => (
    <CardTitle className="text-[13px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
      {children}
    </CardTitle>
  );

  const labelName = (label: string): string => (label === UNLABELLED ? t.bill.unlabelled : label);

  return (
    <div className="flex flex-col gap-[18px]">
      <Card className="gap-4 py-[18px]">
        <CardHeader className="px-[18px]">
          <Eyebrow>{t.bill.tab}</Eyebrow>
        </CardHeader>
        <CardContent className="flex flex-col gap-3.5 px-[18px]">
          <p className="m-0 max-w-[72ch] text-sm text-muted-foreground">{t.bill.lede}</p>

          {/*
            Before the drop zone, deliberately: the decision to paste a log is
            made on this sentence, so it has to be read before the input is
            reachable — the same ordering rule the Compare tab applies to its
            sign convention.
          */}
          <div className="rounded-lg border border-l-[3px] border-l-good px-3.5 py-3 text-[13px] leading-snug">
            {t.bill.privacy}
          </div>

          <div
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              void readFile(event.dataTransfer.files[0]);
            }}
            className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground"
          >
            <span>{t.bill.dropLabel}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInput.current?.click()}
            >
              {t.bill.chooseFile}
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept=".jsonl,.json,.txt,.log"
              className="hidden"
              onChange={(event) => {
                void readFile(event.target.files?.[0]);
                // The same file chosen twice should analyse twice.
                event.target.value = '';
              }}
            />
          </div>

          <span className="text-xs text-muted-foreground">{t.bill.orPaste}</span>
          <Textarea
            value={pasted}
            onChange={(event) => setPasted(event.target.value)}
            spellCheck={false}
            aria-label={t.bill.pasteAriaLabel}
            placeholder='{"model":"claude-sonnet-5","label":"support","session":"a1","usage":{"input_tokens":1200,"output_tokens":300}}'
            className="min-h-28 resize-y bg-muted font-mono text-[13px] leading-relaxed"
          />
          <Button onClick={() => analyze(pasted)} disabled={pasted.trim() === ''}>
            {t.bill.analyze}
          </Button>

          <p className="m-0 max-w-[72ch] text-xs text-muted-foreground">{t.bill.recipe}</p>
        </CardContent>
      </Card>

      {analysis !== null && <Report analysis={analysis} t={t} n={n} pct={pct} labelName={labelName} />}
    </div>
  );
}

function Report({
  analysis,
  t,
  n,
  pct,
  labelName,
}: {
  analysis: Analysis;
  t: WebMessages;
  n: (value: number) => string;
  pct: (fraction: number) => string;
  labelName: (label: string) => string;
}) {
  const { report, levers, cache } = analysis;
  const { total } = report;

  if (total.calls === 0) {
    return (
      <AnimatedContent>
        <Card className="gap-0 py-[18px]">
          <CardContent className="flex flex-col gap-2 px-[18px] text-sm text-muted-foreground">
            <span>{report.unpriced.calls > 0 ? t.bill.nothingPriced : t.bill.empty}</span>
            <Gaps report={report} t={t} n={n} />
          </CardContent>
        </Card>
      </AnimatedContent>
    );
  }

  const shares = sharesOf(total);
  const parts: Array<[string, number, number, number]> = [
    [t.bill.partInput, total.inputUsd, shares.input, total.inputTokens],
    [t.bill.partCacheRead, total.cacheReadUsd, shares.cacheRead, total.cacheReadTokens],
    [t.bill.partCacheWrite, total.cacheWriteUsd, shares.cacheWrite, total.cacheWriteTokens],
    [t.bill.partOutput, total.outputUsd, shares.output, total.outputTokens],
  ];

  /**
   * The verdict is unsettled when the TTL assumption alone flips it. Gated
   * before any confident sentence renders, so the flattering half is never
   * stated as the answer — same rule as the CLI, pinned by the same wording.
   */
  const unsettled = cache.worstCaseVerdict !== cache.verdict && total.assumedWriteTtlCalls > 0;
  const hitRate = cacheHitRate(total);
  const gapOf = (ms: number): string => {
    if (ms < 90_000) return `${Math.round(ms / 1000)}s`;
    if (ms < 90 * 60_000) return `${Math.round(ms / 60_000)}m`;
    if (ms < 36 * 3_600_000) return `${(ms / 3_600_000).toFixed(1)}h`;
    return `${(ms / 86_400_000).toFixed(1)}d`;
  };
  const lostLabels = report.byLabel
    .map((entry) => ({ label: entry.label, economics: cacheEconomics(entry.breakdown) }))
    .filter((entry) => entry.economics.verdict === 'lost-money');
  const hiddenLossUsd = lostLabels.reduce((sum, entry) => sum + entry.economics.deltaUsd, 0);

  const eyebrow = (text: string) => (
    <CardTitle className="text-[13px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
      {text}
    </CardTitle>
  );

  const outputShare = total.outputUsd > 0 ? total.truncatedOutputUsd / total.outputUsd : 0;

  return (
    <AnimatedContent>
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
        <Card className="gap-4 py-[18px]">
          <CardHeader className="px-[18px]">{eyebrow(t.bill.heading)}</CardHeader>
          <CardContent className="flex flex-col gap-3.5 px-[18px]">
            <div className="font-display text-[26px] leading-tight font-semibold">
              {t.bill.headline(total.calls, formatUsd(total.totalUsd))}
            </div>
            {/*
              The period, stated and never extrapolated: the span makes the
              reader's own monthly arithmetic valid. Partial coverage is said
              in the same breath — a span over a slice of the log presented as
              the log's period would be a figure attributed to something it
              does not describe.
            */}
            {report.span !== null && (
              <span className="text-[13px] text-muted-foreground">
                {t.bill.span(
                  new Date(report.span.fromMs).toISOString().slice(0, 10),
                  new Date(report.span.toMs).toISOString().slice(0, 10),
                  ((report.span.toMs - report.span.fromMs) / 86_400_000).toFixed(1),
                )}
                {report.span.calls < total.calls + report.unpriced.calls &&
                  ` ${t.bill.spanPartial(report.span.calls, total.calls + report.unpriced.calls)}`}
              </span>
            )}
            {/*
              Spend per day, drawn with divs rather than a chart library — the
              zero-dependency posture reaches the pixels too. The peak bar takes
              the warning colour; the sentence beside it names the day, its
              multiple of the median (a mean would let the spike inflate its
              own yardstick) and the label that drove it.
            */}
            {report.spendByDay.length >= 2 && (() => {
              const days = report.spendByDay;
              const max = Math.max(...days.map((d) => d.usd));
              const sorted = [...days.map((d) => d.usd)].sort((a, b) => a - b);
              const mid = Math.floor(sorted.length / 2);
              const medianUsd =
                sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
              const peak = days.reduce((a, b) => (b.usd > a.usd ? b : a));
              if (max <= 0 || medianUsd <= 0) return null;
              return (
                <div className="flex flex-col gap-1.5">
                  <div
                    role="img"
                    aria-label={t.bill.dayChartLabel(days.length)}
                    className="flex h-12 items-end gap-px"
                  >
                    {days.map((d) => (
                      <div
                        key={d.day}
                        title={`${d.day}: ${formatUsd(d.usd)}`}
                        className={`min-w-[2px] flex-1 rounded-t-[2px] ${
                          d.day === peak.day ? 'bg-terracotta' : 'bg-muted-foreground/30'
                        }`}
                        style={{ height: `${Math.max(6, (d.usd / max) * 100)}%` }}
                      />
                    ))}
                  </div>
                  <span
                    className={`text-[13px] ${peak.usd > 2 * medianUsd ? 'text-terracotta' : 'text-muted-foreground'}`}
                  >
                    {t.bill.dayPeak(peak.day, formatUsd(peak.usd), (peak.usd / medianUsd).toFixed(1))}
                    {peak.topLabel !== null && report.byLabel.length > 1 &&
                      ` ${t.bill.dayPeakLabel(labelName(peak.topLabel), formatUsd(peak.topLabelUsd))}`}
                  </span>
                </div>
              );
            })()}
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-1 pr-2 font-normal" />
                  <th className="py-1 pr-2 text-right font-normal">{t.bill.spendColumn}</th>
                  <th className="py-1 pr-2 text-right font-normal">{t.bill.shareColumn}</th>
                  <th className="py-1 text-right font-normal">{t.bill.tokensColumn}</th>
                </tr>
              </thead>
              <tbody>
                {parts.map(([name, usd, share, tokens]) => (
                  <tr key={name} className="border-t">
                    <td className="py-1 pr-2">{name}</td>
                    <td className="py-1 pr-2 text-right font-mono">{formatUsd(usd)}</td>
                    <td className="py-1 pr-2 text-right">{pct(share)}</td>
                    <td className="py-1 text-right font-mono">{n(tokens)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <BreakdownTable
              heading={t.bill.byLabelHeading}
              rows={report.byLabel.map((e) => ({ name: labelName(e.label), breakdown: e.breakdown }))}
              totalUsd={total.totalUsd}
              t={t}
              n={n}
              pct={pct}
            />
            <BreakdownTable
              heading={t.bill.byModelHeading}
              rows={report.byModel.map((e) => ({ name: e.model, breakdown: e.breakdown }))}
              totalUsd={total.totalUsd}
              t={t}
              n={n}
              pct={pct}
            />
            <Gaps report={report} t={t} n={n} />
          </CardContent>
        </Card>

        <div className="flex flex-col gap-5">
          <Card className="gap-4 py-[18px]">
            <CardHeader className="px-[18px]">{eyebrow(t.bill.cacheHeading)}</CardHeader>
            <CardContent className="flex flex-col gap-2 px-[18px] text-sm">
              {unsettled ? (
                <div className="rounded-lg border border-l-[3px] border-l-warn px-3.5 py-3 text-[13px] leading-snug text-warn">
                  {t.bill.cacheUnsettled(
                    total.assumedWriteTtlCalls,
                    formatUsd(Math.abs(cache.deltaUsd)),
                    formatUsd(Math.abs(cache.worstCaseDeltaUsd)),
                  )}
                </div>
              ) : (
                <>
                  {cache.verdict === 'not-attempted' && <span>{t.bill.cacheNever}</span>}
                  {cache.verdict === 'unpriced' && <span>{t.bill.cacheUnpriced}</span>}
                  {cache.verdict === 'paid-off' && (
                    <span className="text-good">
                      {t.bill.cachePaidOff(formatUsd(Math.abs(cache.deltaUsd)))}
                    </span>
                  )}
                  {cache.verdict === 'lost-money' && (
                    <span className="text-terracotta">
                      {t.bill.cacheLost(formatUsd(cache.deltaUsd))}
                    </span>
                  )}
                  {cache.verdict === 'no-difference' && <span>{t.bill.cacheNoDifference}</span>}
                  {total.assumedWriteTtlCalls > 0 && (
                    <span className="text-[13px] text-muted-foreground">
                      {t.bill.cacheTtlBound(
                        total.assumedWriteTtlCalls,
                        formatSignedUsd(cache.worstCaseDeltaUsd),
                      )}
                    </span>
                  )}
                </>
              )}
              {cache.verdict !== 'lost-money' && lostLabels.length > 0 && (
                <span className="text-terracotta">
                  {t.bill.cacheHiddenLoss(
                    formatUsd(hiddenLossUsd),
                    lostLabels.map((entry) => labelName(entry.label)).join(', '),
                  )}
                </span>
              )}
              {hitRate !== null && (
                <span className="text-[13px] text-muted-foreground">{t.bill.cacheHit(pct(hitRate))}</span>
              )}
              {/*
                Whether the TTL fits how fast the turns arrive — the mechanism
                behind the verdict above. Four verdicts plus "could not be
                measured", the same three-state discipline as truncation:
                silence over writes with no clock would read as fine.
              */}
              {report.cacheTtlFit.slice(0, 3).map((fit) => {
                const who = labelName(fit.label);
                const gap = gapOf(fit.medianGapMs);
                const text =
                  fit.verdict === 'expires-before-reuse'
                    ? fit.medianGapMs > TTL_1H_MS
                      ? t.bill.ttlExpiresBoth(who, fit.modelName, gap)
                      : t.bill.ttlExpires(who, fit.modelName, gap)
                    : fit.verdict === 'overlong-ttl'
                      ? t.bill.ttlOverlong(who, fit.modelName, gap, formatUsd(fit.overpayUsd))
                      : fit.verdict === 'unsettled'
                        ? t.bill.ttlUnsettled(who, fit.modelName, gap)
                        : t.bill.ttlFits(who, fit.modelName, gap);
                const tone =
                  fit.verdict === 'expires-before-reuse' || fit.verdict === 'overlong-ttl'
                    ? 'text-terracotta'
                    : 'text-[13px] text-muted-foreground';
                return (
                  <span key={`${fit.label}\n${fit.model}`} className={tone}>
                    {text}
                  </span>
                );
              })}
              {total.cacheWriteTokens > 0 && report.cacheTtlFit.length === 0 && (
                <span className="text-[13px] text-muted-foreground">{t.bill.ttlUnmeasured}</span>
              )}
            </CardContent>
          </Card>

          <Card className="gap-4 py-[18px]">
            <CardHeader className="px-[18px]">{eyebrow(t.bill.leversHeading)}</CardHeader>
            <CardContent className="flex flex-col gap-3 px-[18px] text-sm">
              {report.byLabel.length === 1 && report.byLabel[0]!.label === UNLABELLED && (
                <div className="rounded-lg border border-l-[3px] border-l-warn px-3.5 py-3 text-[13px] leading-snug text-warn">
                  {t.bill.leversUnlabelled}
                </div>
              )}
              {levers.slices.length === 0 && (
                <span className="text-muted-foreground">{t.bill.leversNone}</span>
              )}
              {levers.slices.slice(0, MAX_SLICES).map((slice) => (
                <div key={`${slice.label}\n${slice.model}`} className="rounded-lg border px-3.5 py-3">
                  <div className="font-semibold">
                    {/*
                      combinedUsd, never spentUsd: the share beside it is the
                      *saving*'s share of the bill, and gluing the slice's spend
                      to the saving's percentage put two figures on one line
                      that described different things. Caught on screen, in a
                      browser — "$0.4669 (72%)" against a by-label table saying
                      the same slice was 100% of the bill.
                    */}
                    {t.bill.leverSlice(
                      labelName(slice.label),
                      slice.modelName,
                      formatUsd(slice.combinedUsd),
                      pct(slice.shareOfBill),
                    )}
                  </div>
                  <div className="text-[13px] text-muted-foreground">
                    {t.bill.leverCalls(slice.calls, formatUsd(slice.spentUsd))}
                  </div>
                  <ul className="m-0 mt-1 list-disc pl-5 text-[13px]">
                    {slice.route !== null && (
                      <li>
                        {t.bill.leverRoute(
                          slice.route.candidate.displayName,
                          formatUsd(slice.route.savingUsd),
                        )}
                      </li>
                    )}
                    {slice.batch !== null && <li>{t.bill.leverBatch(formatUsd(slice.batch.savingUsd))}</li>}
                  </ul>
                </div>
              ))}
              {levers.slices.some((slice) => slice.route !== null) && (
                <span className="text-[13px] text-muted-foreground">{t.bill.routeVerify}</span>
              )}
              <span className="text-[13px] text-muted-foreground">
                {t.bill.leverPromptCeiling(
                  formatUsd(levers.promptCeilingUsd),
                  pct(levers.promptCeilingShare),
                )}
              </span>
            </CardContent>
          </Card>

          <Card className="gap-4 py-[18px]">
            <CardHeader className="px-[18px]">{eyebrow(t.bill.historyHeading)}</CardHeader>
            <CardContent className="flex flex-col gap-3 px-[18px] text-sm">
              {!report.hasSessions && (
                <span className="text-muted-foreground">{t.bill.historyNoSessions}</span>
              )}
              {report.conversations.slice(0, MAX_SECTIONS).map((growth) => (
                <div key={`${growth.label}\n${growth.model}`} className="rounded-lg border px-3.5 py-3">
                  <div className="text-[13px]">
                    {t.bill.historyGrowth(
                      labelName(growth.label),
                      growth.modelName,
                      n(Math.round(growth.minTurnTokens)),
                      n(Math.round(growth.maxTurnTokens)),
                      n(growth.longestSession),
                    )}
                  </div>
                  <div className="mt-1 text-[13px] text-muted-foreground">
                    {t.bill.historyCeiling(
                      formatUsd(growth.growthUsd),
                      pct(growth.shareOfBill),
                      formatUsd(growth.flatUsd),
                      formatUsd(growth.inputUsd),
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {report.outputShapes.length > 0 && (
            <Card className="gap-4 py-[18px]">
              <CardHeader className="px-[18px]">{eyebrow(t.bill.outputHeading)}</CardHeader>
              <CardContent className="flex flex-col gap-2 px-[18px] text-[13px]">
                {report.outputShapes.slice(0, MAX_SECTIONS).map((shape) => (
                  <span key={`${shape.label}\n${shape.model}`}>
                    {shape.heavyCallShare < 0.25
                      ? t.bill.outputTail(
                          labelName(shape.label),
                          shape.modelName,
                          pct(shape.heavyCallShare),
                          pct(shape.heavySpendShare),
                          n(shape.aboveTokens),
                          formatUsd(shape.outputUsd),
                        )
                      : t.bill.outputFlat(
                          labelName(shape.label),
                          shape.modelName,
                          pct(shape.heavyCallShare),
                          pct(shape.heavySpendShare),
                          formatUsd(shape.outputUsd),
                        )}
                  </span>
                ))}
              </CardContent>
            </Card>
          )}

          <Card className="gap-4 py-[18px]">
            <CardHeader className="px-[18px]">{eyebrow(t.bill.truncatedHeading)}</CardHeader>
            <CardContent className="px-[18px] text-sm">
              {total.stopReasonCalls === 0 ? (
                <span className="text-muted-foreground">{t.bill.truncatedNotRecorded}</span>
              ) : total.truncatedCalls > 0 ? (
                <span className="text-terracotta">
                  {t.bill.truncatedWaste(
                    total.truncatedCalls,
                    formatUsd(total.truncatedOutputUsd),
                    pct(outputShare),
                  )}
                </span>
              ) : (
                <span className="text-good">{t.bill.truncatedNone}</span>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AnimatedContent>
  );
}

function BreakdownTable({
  heading,
  rows,
  totalUsd,
  t,
  n,
  pct,
}: {
  heading: string;
  rows: Array<{ name: string; breakdown: { totalUsd: number; calls: number } }>;
  totalUsd: number;
  t: WebMessages;
  n: (value: number) => string;
  pct: (fraction: number) => string;
}) {
  if (rows.length === 0) return null;
  const shown = rows.slice(0, MAX_ROWS);
  return (
    <div>
      <div className="mb-1 text-[13px] font-semibold">{heading}</div>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="py-1 pr-2 font-normal" />
            <th className="py-1 pr-2 text-right font-normal">{t.bill.spendColumn}</th>
            <th className="py-1 pr-2 text-right font-normal">{t.bill.shareColumn}</th>
            <th className="py-1 text-right font-normal">{t.bill.callsColumn}</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((row) => (
            <tr key={row.name} className="border-t">
              <td className="max-w-[18ch] truncate py-1 pr-2" title={row.name}>
                {row.name}
              </td>
              <td className="py-1 pr-2 text-right font-mono">{formatUsd(row.breakdown.totalUsd)}</td>
              <td className="py-1 pr-2 text-right">
                {pct(totalUsd > 0 ? row.breakdown.totalUsd / totalUsd : 0)}
              </td>
              <td className="py-1 text-right font-mono">{n(row.breakdown.calls)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > MAX_ROWS && (
        <div className="mt-1 text-xs text-muted-foreground">{t.bill.moreRows(rows.length - MAX_ROWS)}</div>
      )}
    </div>
  );
}

function Gaps({
  report,
  t,
  n,
}: {
  report: UsageProfileReport;
  t: WebMessages;
  n: (value: number) => string;
}) {
  const { skippedLines, unpricedModels, unpriced } = report;
  if (unpricedModels.length === 0 && skippedLines.length === 0) return null;
  const shownLines = skippedLines.slice(0, 8).join(', ') + (skippedLines.length > 8 ? '…' : '');
  return (
    <div className="flex flex-col gap-1 text-[13px] text-terracotta">
      {unpricedModels.length > 0 && (
        <span>{t.bill.unpriced(unpricedModels.join(', '), unpriced.calls)}</span>
      )}
      {skippedLines.length > 0 && <span>{t.bill.skipped(skippedLines.length, shownLines)}</span>}
    </div>
  );
}
