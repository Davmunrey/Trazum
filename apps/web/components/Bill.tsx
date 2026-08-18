'use client';

import { useRef, useState } from 'react';

import {
  BUNDLED_CATALOGUE,
  TTL_1H_MS,
  UNLABELLED,
  billLevers,
  cacheEconomics,
  cacheHitRate,
  driversBetween,
  formatSignedUsd,
  formatUsd,
  profileUsage,
  reviewAgeDays,
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
  /** The previous log's report, when one was handed over to compare against. */
  previous: UsageProfileReport | null;
}

/** Rows shown per table before "…and N more". Enough to act on, short enough to read. */
const MAX_ROWS = 8;
const MAX_SLICES = 5;
const MAX_SECTIONS = 3;

export function Bill({ t }: { t: WebMessages }) {
  const [pasted, setPasted] = useState('');
  const [logText, setLogText] = useState<string | null>(null);
  const [previousText, setPreviousText] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  /** The time window, as `YYYY-MM-DD` strings; `''` is no bound. */
  const [since, setSince] = useState('');
  const [until, setUntil] = useState('');
  /**
   * Why the window produced no report, when it did not. A window matching
   * nothing must not become a $0 report — the CLI's rule, kept here so the
   * two surfaces refuse the same things.
   */
  const [windowError, setWindowError] = useState<string | null>(null);
  /**
   * The workload being looked at alone, or null for the whole log — the
   * CLI's `--label`, reached by clicking a row instead of retyping the
   * command. Only labels the report already listed can be selected, so the
   * CLI's "a label matching nothing is an error" case cannot arise here.
   */
  const [drillLabel, setDrillLabel] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const previousInput = useRef<HTMLInputElement>(null);

  const n = (value: number): string => value.toLocaleString(t.numberLocale);
  const pct = (fraction: number): string =>
    fraction > 0 && fraction < 0.005 ? '<1%' : `${(fraction * 100).toFixed(0)}%`;

  function analyze(
    text: string,
    previous: string | null,
    sinceStr = since,
    untilStr = until,
    label: string | null = drillLabel,
  ) {
    /**
     * A bare date is that whole UTC day — since its first instant, until its
     * last — with the half-open `[since, until)` window underneath, exactly
     * the CLI's reading. The two surfaces must not disagree about which days
     * a window covers.
     */
    const sinceMs = sinceStr !== '' ? Date.parse(`${sinceStr}T00:00:00Z`) : undefined;
    const untilMs = untilStr !== '' ? Date.parse(`${untilStr}T00:00:00Z`) + 86_400_000 : undefined;
    setLogText(text);
    if (sinceMs !== undefined && untilMs !== undefined && sinceMs >= untilMs) {
      setWindowError(t.bill.windowOrder);
      setAnalysis(null);
      return;
    }
    const report = profileUsage(text, {
      catalogue: BUNDLED_CATALOGUE,
      sinceMs,
      untilMs,
      ...(label !== null ? { label } : {}),
    });
    const windowed = sinceMs !== undefined || untilMs !== undefined;
    if (windowed && report.total.calls === 0 && report.unpriced.calls === 0) {
      // The CLI's refusals, kept in step: a window matching nothing names
      // what the log does cover; a clockless log cannot be windowed at all.
      const unfiltered = profileUsage(text, { catalogue: BUNDLED_CATALOGUE });
      if (unfiltered.total.calls > 0 || unfiltered.unpriced.calls > 0) {
        setWindowError(
          unfiltered.span === null
            ? t.bill.windowNeedsClock
            : t.bill.windowMatchesNothing(
                new Date(unfiltered.span.fromMs).toISOString().slice(0, 10),
                new Date(unfiltered.span.toMs).toISOString().slice(0, 10),
              ),
        );
        setAnalysis(null);
        return;
      }
    }
    setWindowError(null);
    const levers = billLevers(report, { catalogue: BUNDLED_CATALOGUE });
    const cache = cacheEconomics(report.total);
    setAnalysis({
      report,
      levers,
      cache,
      // The same window on both sides: a windowed bill against an unwindowed
      // one compares a slice to a whole and calls the difference growth.
      // The same filters on both sides, as on the CLI: comparing one
      // workload's bill against the whole previous log would report every
      // sibling workload as a vanished saving.
      previous:
        previous !== null
          ? profileUsage(previous, {
              catalogue: BUNDLED_CATALOGUE,
              sinceMs,
              untilMs,
              ...(label !== null ? { label } : {}),
            })
          : null,
    });
    /**
     * Shape only, never content: no label names, no spend, no counts. The
     * drill-down is reported as a boolean computed *before* the call, so the
     * telemetry expression contains no identifier that could ever be read as
     * carrying one — the guard in bill-ui.test.mjs checks the call site
     * textually, and a guard worth having is one worth writing around.
     */
    const drilled = label !== null;
    track('bill', {
      priced: report.total.calls > 0,
      sessions: report.hasSessions,
      compared: previous !== null,
      windowed,
      drilled,
    });
  }

  async function readFile(file: File | undefined) {
    if (!file) return;
    analyze(await file.text(), previousText);
  }

  /** The second log, re-analysing in place when a report is already on screen. */
  async function readPrevious(file: File | undefined) {
    if (!file) return;
    const text = await file.text();
    setPreviousText(text);
    if (logText !== null) analyze(logText, text);
  }

  function clearPrevious() {
    setPreviousText(null);
    if (logText !== null) analyze(logText, null);
  }

  const Eyebrow = ({ children }: { children: React.ReactNode }) => (
    <CardTitle className="text-[13px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
      {children}
    </CardTitle>
  );

  const labelName = (label: string): string => (label === UNLABELLED ? t.bill.unlabelled : label);

  /**
   * Look at one workload alone, or go back to the whole log. Re-profiles the
   * text already in hand — the log never leaves the page, drill-down included.
   */
  function drillTo(label: string | null) {
    setDrillLabel(label);
    if (logText !== null) analyze(logText, previousText, since, until, label);
  }

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
          <Button onClick={() => analyze(pasted, previousText)} disabled={pasted.trim() === ''}>
            {t.bill.analyze}
          </Button>

          {/* The second log, read in this tab exactly like the first. */}
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => previousInput.current?.click()}
            >
              {t.bill.againstLabel}
            </Button>
            {previousText !== null && (
              <Button type="button" variant="ghost" size="sm" onClick={clearPrevious}>
                {t.bill.againstClear}
              </Button>
            )}
            <span>{t.bill.againstHint}</span>
            <input
              ref={previousInput}
              type="file"
              accept=".jsonl,.json,.txt,.log"
              className="hidden"
              onChange={(event) => {
                void readPrevious(event.target.files?.[0]);
                event.target.value = '';
              }}
            />
          </div>

          {/* The time window: one period of the same log, the CLI's --since/--until. */}
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{t.bill.windowLabel}</span>
            <input
              type="date"
              value={since}
              aria-label={t.bill.windowSinceAria}
              onChange={(event) => {
                setSince(event.target.value);
                if (logText !== null) analyze(logText, previousText, event.target.value, until);
              }}
              className="rounded-md border bg-muted px-2 py-1 text-[13px]"
            />
            <span aria-hidden>→</span>
            <input
              type="date"
              value={until}
              aria-label={t.bill.windowUntilAria}
              onChange={(event) => {
                setUntil(event.target.value);
                if (logText !== null) analyze(logText, previousText, since, event.target.value);
              }}
              className="rounded-md border bg-muted px-2 py-1 text-[13px]"
            />
            {(since !== '' || until !== '') && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSince('');
                  setUntil('');
                  if (logText !== null) analyze(logText, previousText, '', '');
                }}
              >
                {t.bill.windowClear}
              </Button>
            )}
            <span>{t.bill.windowHint}</span>
          </div>
          {windowError !== null && (
            <div className="rounded-lg border border-l-[3px] border-l-warn px-3.5 py-3 text-[13px] leading-snug text-warn">
              {windowError}
            </div>
          )}

          <p className="m-0 max-w-[72ch] text-xs text-muted-foreground">{t.bill.recipe}</p>
        </CardContent>
      </Card>

      {analysis !== null && (
        <Report
          analysis={analysis}
          t={t}
          n={n}
          pct={pct}
          labelName={labelName}
          drillLabel={drillLabel}
          onDrill={drillTo}
        />
      )}
    </div>
  );
}

function Report({
  analysis,
  t,
  n,
  pct,
  labelName,
  drillLabel,
  onDrill,
}: {
  analysis: Analysis;
  drillLabel: string | null;
  onDrill: (label: string | null) => void;
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
              The window before any figure is trusted as "the log": everything
              below describes a slice. The undated count is loud — those calls'
              spend is in the log and not in this report, so the window's
              figures are a floor on the period, and only this line says so.
            */}
            {report.timeWindow !== null && (
              <span className="text-[13px] text-muted-foreground">{t.bill.windowLine}</span>
            )}
            {/*
              Looking at one workload alone. Said before the figures it
              governs, and it says the awkward half out loud: every share
              below is a share of *this* workload's bill, not of the log —
              the same property the CLI's --label has, and the one a reader
              would otherwise misread as "chat is 100% of our spend".
            */}
            {drillLabel !== null && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-l-[3px] border-l-warn px-3.5 py-3 text-[13px] leading-snug text-warn">
                <span>{t.bill.drillActive(labelName(drillLabel))}</span>
                <Button type="button" variant="ghost" size="sm" onClick={() => onDrill(null)}>
                  {t.bill.drillClear}
                </Button>
              </div>
            )}
            {report.timeWindow !== null && report.timeWindow.undatedExcluded > 0 && (
              <span className="text-terracotta">
                {t.bill.windowUndated(report.timeWindow.undatedExcluded)}
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
            {/*
              The shape of the day: twenty-four bars, one per UTC hour, drawn
              with divs like the day chart above. Hours with no traffic are
              drawn as empty rather than skipped — a gap is the finding when
              the question is whether the spend is concentrated, and a chart
              that closed the gaps would make every workload look flat.
            */}
            {report.spendByHour.length >= 4 && total.totalUsd > 0 && (() => {
              const byHour = new Map(report.spendByHour.map((entry) => [entry.hour, entry.usd]));
              const max = Math.max(...report.spendByHour.map((entry) => entry.usd));
              if (max <= 0) return null;
              // The fewest hours holding 80% of the spend — the CLI's measure,
              // stated the same way so the two surfaces cannot disagree.
              const ranked = [...report.spendByHour].sort((a, b) => b.usd - a.usd);
              let covered = 0;
              let hoursForMost = 0;
              for (const entry of ranked) {
                covered += entry.usd;
                hoursForMost += 1;
                if (covered >= 0.8 * total.totalUsd) break;
              }
              const busiest = new Set(ranked.slice(0, hoursForMost).map((entry) => entry.hour));
              return (
                <div className="flex flex-col gap-1.5">
                  <div
                    role="img"
                    aria-label={t.bill.hourChartLabel}
                    className="flex h-12 items-end gap-px"
                  >
                    {Array.from({ length: 24 }, (_, hour) => {
                      const usd = byHour.get(hour) ?? 0;
                      return (
                        <div
                          key={`hour:${hour}`}
                          title={`${String(hour).padStart(2, '0')}:00 UTC: ${formatUsd(usd)}`}
                          className={`min-w-[2px] flex-1 rounded-t-[2px] ${
                            busiest.has(hour) ? 'bg-terracotta' : 'bg-muted-foreground/30'
                          }`}
                          style={{ height: `${usd > 0 ? Math.max(6, (usd / max) * 100) : 0}%` }}
                        />
                      );
                    })}
                  </div>
                  <span className="text-[13px] text-muted-foreground">
                    {hoursForMost <= 8
                      ? t.bill.hoursConcentrated(hoursForMost)
                      : t.bill.hoursFlat(hoursForMost)}
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
              rows={report.byLabel.map((e) => ({
                name: labelName(e.label),
                breakdown: e.breakdown,
                key: e.label,
              }))}
              totalUsd={total.totalUsd}
              t={t}
              n={n}
              pct={pct}
              onSelect={drillLabel === null ? onDrill : undefined}
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
          {analysis.previous !== null && (
            <Card className="gap-4 py-[18px]">
              <CardHeader className="px-[18px]">{eyebrow(t.bill.againstHeading)}</CardHeader>
              <CardContent className="flex flex-col gap-3 px-[18px] text-sm">
                {analysis.previous.total.calls === 0 ? (
                  <span className="text-muted-foreground">{t.bill.againstNothingPriced}</span>
                ) : (
                  (() => {
                    const prev = analysis.previous!;
                    const delta = total.totalUsd - prev.total.totalUsd;
                    const growthPct =
                      prev.total.totalUsd > 0
                        ? `${delta >= 0 ? '+' : ''}${((delta / prev.total.totalUsd) * 100).toFixed(1)}%`
                        : '—';
                    // Drivers over the union of keys — core's one
                    // implementation, shared with the CLI and the MCP, so
                    // three surfaces cannot disagree about what a vanished
                    // workload contributed.
                    const drivers = driversBetween(
                      prev.byLabel.map((r) => ({ key: r.label, usd: r.breakdown.totalUsd })),
                      report.byLabel.map((r) => ({ key: r.label, usd: r.breakdown.totalUsd })),
                    ).slice(0, 5);
                    // The same change by model — where the mix moved. One
                    // model on both sides restates the totals line, so it
                    // stays silent, exactly as on the CLI.
                    const modelDrivers = driversBetween(
                      prev.byModel.map((r) => ({ key: r.model, usd: r.breakdown.totalUsd })),
                      report.byModel.map((r) => ({ key: r.model, usd: r.breakdown.totalUsd })),
                    ).slice(0, 3);
                    const modelsInvolved = new Set([
                      ...prev.byModel.map((r) => r.model),
                      ...report.byModel.map((r) => r.model),
                    ]);
                    return (
                      <>
                        {/* The convention, before the first figure it governs. */}
                        <div className="rounded-lg border border-l-[3px] border-l-warn px-3.5 py-3 text-[13px] leading-snug text-warn">
                          {t.bill.againstConvention}
                        </div>
                        <div
                          className={`text-[19px] font-semibold ${delta > 0 ? 'text-terracotta' : delta < 0 ? 'text-good' : ''}`}
                        >
                          {t.bill.againstTotals(
                            formatUsd(prev.total.totalUsd),
                            formatUsd(total.totalUsd),
                            formatSignedUsd(delta),
                            growthPct,
                          )}
                        </div>
                        <span className="text-[13px] text-muted-foreground">
                          {t.bill.againstCalls(prev.total.calls, total.calls)}
                        </span>
                        <ul className="m-0 list-none p-0 text-[13px]">
                          {drivers.map((d) => (
                            <li key={d.key} className={`py-px ${d.delta > 0 ? 'text-terracotta' : 'text-muted-foreground'}`}>
                              {d.was === null
                                ? t.bill.againstDriverNew(formatSignedUsd(d.delta), labelName(d.key))
                                : d.now === null
                                  ? t.bill.againstDriverGone(formatSignedUsd(d.delta), labelName(d.key))
                                  : t.bill.againstDriver(
                                      formatSignedUsd(d.delta),
                                      labelName(d.key),
                                      formatUsd(d.was),
                                      formatUsd(d.now),
                                    )}
                            </li>
                          ))}
                        </ul>
                        {modelDrivers.length > 0 && modelsInvolved.size > 1 && (
                          <>
                            <span className="text-[13px] text-muted-foreground">
                              {t.bill.againstByModel}
                            </span>
                            <ul className="m-0 list-none p-0 text-[13px]">
                              {modelDrivers.map((d) => (
                                <li
                                  key={`model:${d.key}`}
                                  className={`py-px ${d.delta > 0 ? 'text-terracotta' : 'text-muted-foreground'}`}
                                >
                                  {d.was === null
                                    ? t.bill.againstDriverNew(formatSignedUsd(d.delta), d.key)
                                    : d.now === null
                                      ? t.bill.againstDriverGone(formatSignedUsd(d.delta), d.key)
                                      : t.bill.againstDriver(
                                          formatSignedUsd(d.delta),
                                          d.key,
                                          formatUsd(d.was),
                                          formatUsd(d.now),
                                        )}
                                </li>
                              ))}
                            </ul>
                          </>
                        )}
                      </>
                    );
                  })()
                )}
              </CardContent>
            </Card>
          )}
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
              {/*
                Conversations that never came back. Two claims for the same
                tokens, decided by the slice's own reads: with zero cache reads
                anywhere in the slice nothing read those writes — a fact, loud;
                with reads present another conversation sharing the prefix may
                have read them, the log cannot see whose write a read hit, and
                the figure renders as the ceiling it is.
              */}
              {report.singleTurnCacheWrites.slice(0, 3).map((row) => {
                const who = labelName(row.label);
                const reads =
                  report.byLabelAndModel.find(
                    (e) => e.label === row.label && e.model === row.model,
                  )?.breakdown.cacheReadTokens ?? 0;
                const confirmed = reads === 0;
                return (
                  <span
                    key={`ledger:${row.label}\n${row.model}`}
                    className={confirmed ? 'text-terracotta' : 'text-[13px] text-muted-foreground'}
                  >
                    {confirmed
                      ? t.bill.singleTurnConfirmed(
                          who,
                          row.modelName,
                          row.singleTurnSessions,
                          row.sessions,
                          formatUsd(row.singleTurnWriteUsd),
                        )
                      : t.bill.singleTurnCeiling(
                          who,
                          row.modelName,
                          row.singleTurnSessions,
                          row.sessions,
                          formatUsd(row.singleTurnWriteUsd),
                        )}
                  </span>
                );
              })}
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
              {/*
                What one conversation costs, in the same card as the growth
                it belongs beside. Median against p95, never a mean: one
                runaway loop would drag a mean up and hide the ordinary
                case, which is the figure a per-seat price is set from.
              */}
              {report.sessionCosts.slice(0, MAX_SECTIONS).map((shape) => (
                <div key={`cost:${shape.label}\n${shape.model}`} className="rounded-lg border px-3.5 py-3">
                  <div className="text-[13px]">
                    {t.bill.sessionCost(
                      labelName(shape.label),
                      shape.modelName,
                      shape.sessions,
                      formatUsd(shape.medianUsd),
                      shape.medianTurns,
                      formatUsd(shape.p95Usd),
                      formatUsd(shape.maxUsd),
                    )}
                  </div>
                  {shape.medianUsd > 0 && shape.p95Usd > 10 * shape.medianUsd && (
                    <div className="mt-1 text-[13px] text-warn">
                      {t.bill.sessionCostTail((shape.p95Usd / shape.medianUsd).toFixed(0))}
                    </div>
                  )}
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
                    {/*
                      The max_tokens ceilings, omitted when the covering bucket
                      is the open-ended last one — no honest number to name.
                    */}
                    {shape.medianWithinTokens !== null && shape.p95WithinTokens !== null && (
                      <span className="mt-1 block text-muted-foreground">
                        {t.bill.outputPercentiles(n(shape.medianWithinTokens), n(shape.p95WithinTokens))}
                      </span>
                    )}
                  </span>
                ))}
              </CardContent>
            </Card>
          )}

          <Card className="gap-4 py-[18px]">
            <CardHeader className="px-[18px]">{eyebrow(t.bill.truncatedHeading)}</CardHeader>
            <CardContent className="flex flex-col gap-2 px-[18px] text-sm">
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
              {/*
                Which workloads pay for it, at a rate over calls that recorded
                a stop reason — never over every call, because a workload
                logging the field half the time is not one whose other half
                completed. Silent when one label is the whole log, where
                naming it restates the total.
              */}
              {total.truncatedCalls > 0 &&
                report.byLabel.length > 1 &&
                report.byLabel
                  .filter((entry) => entry.breakdown.truncatedCalls > 0)
                  .sort((a, b) => b.breakdown.truncatedOutputUsd - a.breakdown.truncatedOutputUsd)
                  .slice(0, MAX_SECTIONS)
                  .map((entry) => (
                    <span key={`truncated:${entry.label}`} className="text-[13px] text-muted-foreground">
                      {t.bill.truncatedBy(
                        labelName(entry.label),
                        entry.breakdown.truncatedCalls,
                        entry.breakdown.stopReasonCalls,
                        pct(entry.breakdown.truncatedCalls / entry.breakdown.stopReasonCalls),
                        formatUsd(entry.breakdown.truncatedOutputUsd),
                      )}
                    </span>
                  ))}
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
  onSelect,
}: {
  heading: string;
  rows: Array<{ name: string; breakdown: { totalUsd: number; calls: number }; key?: string }>;
  totalUsd: number;
  t: WebMessages;
  n: (value: number) => string;
  pct: (fraction: number) => string;
  /**
   * When given, each row becomes a button that profiles that workload alone.
   * Absent while already drilled in: a drill-down inside a drill-down would
   * filter an already-filtered report and quietly produce an empty one.
   */
  onSelect?: (key: string) => void;
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
                {onSelect !== undefined && row.key !== undefined ? (
                  <button
                    type="button"
                    onClick={() => onSelect(row.key!)}
                    className="cursor-pointer underline decoration-dotted underline-offset-2 hover:decoration-solid"
                  >
                    {row.name}
                  </button>
                ) : (
                  row.name
                )}
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
  const { skippedLines, unpricedModels, unpriced, fieldCoverage } = report;
  /**
   * What this log cannot answer yet. Counts rather than booleans — twelve
   * labelled records out of forty thousand is not a labelled log — and
   * nothing at all when the log is complete, because a paragraph of things
   * that are fine is the paragraph readers learn to skip.
   */
  const seen = (count: number): string => `${count}/${fieldCoverage.parsed}`;
  const missingFields =
    fieldCoverage.parsed === 0
      ? []
      : [
          fieldCoverage.label < fieldCoverage.parsed
            ? t.bill.needsLabel(seen(fieldCoverage.label))
            : null,
          fieldCoverage.session < fieldCoverage.parsed
            ? t.bill.needsSession(seen(fieldCoverage.session))
            : null,
          fieldCoverage.ts < fieldCoverage.parsed ? t.bill.needsTs(seen(fieldCoverage.ts)) : null,
          fieldCoverage.stopReason < fieldCoverage.parsed
            ? t.bill.needsStopReason(seen(fieldCoverage.stopReason))
            : null,
          fieldCoverage.cacheWrites > 0 && fieldCoverage.cacheTtl < fieldCoverage.cacheWrites
            ? t.bill.needsCacheTtl(`${fieldCoverage.cacheTtl}/${fieldCoverage.cacheWrites}`)
            : null,
        ].filter((line): line is string => line !== null);
  /**
   * The provenance caveat, said only when old enough to matter and loud
   * then: a stale price table qualifies every dollar above, and unlike a
   * skipped line it does not name its own size — the error is exactly
   * whatever the provider changed. The 45-day threshold matches the CLI's.
   */
  const staleDays = reviewAgeDays(BUNDLED_CATALOGUE.lastReviewed, new Date());
  const stale = staleDays !== null && staleDays > 45;
  if (
    unpricedModels.length === 0 &&
    skippedLines.length === 0 &&
    !stale &&
    missingFields.length === 0
  ) {
    return null;
  }
  const shownLines = skippedLines.slice(0, 8).join(', ') + (skippedLines.length > 8 ? '…' : '');
  return (
    <div className="flex flex-col gap-1 text-[13px] text-terracotta">
      {stale && <span>{t.bill.pricesStale(BUNDLED_CATALOGUE.lastReviewed, staleDays)}</span>}
      {unpricedModels.length > 0 && (
        <span>{t.bill.unpriced(unpricedModels.join(', '), unpriced.calls)}</span>
      )}
      {skippedLines.length > 0 && <span>{t.bill.skipped(skippedLines.length, shownLines)}</span>}
      {missingFields.length > 0 && (
        <div className="mt-1 flex flex-col gap-1 text-muted-foreground">
          <span className="font-semibold">{t.bill.coverageHeading}</span>
          {missingFields.map((line) => (
            <span key={line.slice(0, 24)}>{line}</span>
          ))}
        </div>
      )}
    </div>
  );
}
