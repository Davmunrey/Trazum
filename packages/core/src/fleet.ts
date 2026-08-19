/**
 * Twelve services, one rollup, and the one that is actually bleeding.
 *
 * `profile` merges a directory of logs into one bill, which is right for one
 * service and wrong for a fleet: the merged report hides which service the
 * money is coming from, per-service budgets cannot exist at all, and the
 * findings a *comparison between services* could make are invisible — the
 * same workload on Opus in one team and Haiku in another is a decision
 * somebody should get to see, and no single merged total shows it.
 *
 * This module does the fleet arithmetic on reports the caller already built.
 * It reads no files and runs no globs against a filesystem — the caller hands
 * it file names and per-source reports, so the module stays browser-safe and
 * the CLI keeps its monopoly on I/O.
 *
 * **The rollup refuses to average what it cannot compare.** Two sources whose
 * logs cover different periods can be *summed* — a total is a total — but a
 * share of that total is not a comparison of rates, and the module says which
 * sources cover which days rather than letting a 3-day log look cheap beside
 * a 30-day one.
 */

import { mostSpecificMatch } from './glob.js';
import { UNLABELLED } from './usage.js';
import type { UsageProfileReport } from './usage.js';

/**
 * Which source each file belongs to.
 *
 * Assignment is by the most specific matching glob, so `services/api/**`
 * beats `services/**` on the same file — the same tie-break the budget
 * patterns use, because two rules for pattern precedence in one tool is one
 * rule too many. Files matching no source are returned rather than dropped:
 * a log that silently joined no report would be spend missing from every
 * bill, which is the flattering omission this repository refuses everywhere.
 */
export function assignSources(
  files: string[],
  sources: Record<string, string[]>,
): { bySource: Map<string, string[]>; unmatched: string[] } {
  const bySource = new Map<string, string[]>();
  const unmatched: string[] = [];

  // Flatten to (pattern, source) pairs so specificity decides across sources.
  const patterns: { pattern: string; source: string }[] = [];
  for (const [source, globs] of Object.entries(sources)) {
    for (const pattern of globs) patterns.push({ pattern, source });
  }

  for (const file of files) {
    const best = mostSpecificMatch(
      patterns.map((p) => p.pattern),
      file,
    );
    if (best === null) {
      unmatched.push(file);
      continue;
    }
    const source = patterns.find((p) => p.pattern === best)!.source;
    const list = bySource.get(source) ?? [];
    list.push(file);
    bySource.set(source, list);
  }
  return { bySource, unmatched };
}

export interface FleetSource {
  name: string;
  report: UsageProfileReport;
}

export interface FleetRollup {
  /** Sum over every source. A total is a total, whatever the spans. */
  totalUsd: number;
  calls: number;
  /** Every source, dearest first, with its share of the fleet's total. */
  sources: { name: string; usd: number; calls: number; share: number; spanDays: number | null }[];
  /**
   * The one that is actually bleeding: the dearest source, with its share —
   * or null when the fleet spent nothing, because "nothing is bleeding" and
   * "the worst of nothing" are different statements.
   */
  worst: { name: string; usd: number; share: number } | null;
  /**
   * True when the sources' logs cover meaningfully different periods (their
   * spans differ by more than one day, or some carry no clock at all). Shares
   * of the total remain valid — they are shares of a sum — but reading them
   * as *rate* comparisons is exactly the mistake this flag exists to stop,
   * and every rendering states it when set.
   */
  mismatchedSpans: boolean;
  /**
   * The same workload label running on different models in different sources
   * — one team on Opus, another on Haiku, same job. A merged bill renders
   * this invisible: the label's slices coexist with no seam. Only splits
   * where both sides carry real spend are reported, dearest gap first.
   */
  splitBrains: {
    label: string;
    sources: { name: string; model: string; usd: number }[];
  }[];
  /**
   * Sources where caching lost money while the fleet's aggregate paid off.
   * An aggregate verdict is the flattering rendering when three sources are
   * quietly underwater; each is named with its own delta. Sources whose
   * verdict matches the aggregate are not listed — this is the exception
   * report, not the census.
   */
  cacheUnderwater: { name: string; deltaUsd: number }[];
}

/** Span length in days, or null when the report has no clock. */
function spanDaysOf(report: UsageProfileReport): number | null {
  return report.span === null ? null : (report.span.toMs - report.span.fromMs) / 86_400_000;
}

export function fleetRollup(
  sources: FleetSource[],
  options: {
    /**
     * Per-source cache verdict delta, positive meaning caching added money to
     * the bill — the caller computes it with `cacheEconomics` because that
     * module owns the counterfactual, and this one must not restate it.
     */
    cacheDeltas?: Map<string, number>;
    /** The fleet-wide delta under the same convention. */
    aggregateCacheDelta?: number;
  } = {},
): FleetRollup {
  const rows = sources
    .map((s) => ({
      name: s.name,
      usd: s.report.total.totalUsd,
      calls: s.report.total.calls,
      spanDays: spanDaysOf(s.report),
    }))
    .sort((a, b) => b.usd - a.usd);

  const totalUsd = rows.reduce((sum, r) => sum + r.usd, 0);
  const calls = rows.reduce((sum, r) => sum + r.calls, 0);
  const withShare = rows.map((r) => ({
    ...r,
    share: totalUsd > 0 ? r.usd / totalUsd : 0,
  }));

  const spans = rows.map((r) => r.spanDays);
  const known = spans.filter((d): d is number => d !== null);
  const mismatchedSpans =
    spans.some((d) => d === null && known.length > 0) ||
    (known.length > 1 && Math.max(...known) - Math.min(...known) > 1);

  /**
   * Split brains: one label, different models, different sources. Judged on
   * each source's *dearest* model for the label, so a stray experiment call
   * does not report a team as migrated.
   */
  const labelModel = new Map<string, Map<string, { model: string; usd: number }>>();
  for (const source of sources) {
    for (const slice of source.report.byLabelAndModel) {
      if (slice.label === UNLABELLED) continue;
      const perSource = labelModel.get(slice.label) ?? new Map();
      const current = perSource.get(source.name);
      if (current === undefined || slice.breakdown.totalUsd > current.usd) {
        perSource.set(source.name, { model: slice.model, usd: slice.breakdown.totalUsd });
      }
      labelModel.set(slice.label, perSource);
    }
  }
  const splitBrains: FleetRollup['splitBrains'] = [];
  for (const [label, perSource] of labelModel) {
    if (perSource.size < 2) continue;
    const models = new Set([...perSource.values()].map((v) => v.model));
    if (models.size < 2) continue;
    const list = [...perSource.entries()]
      .map(([name, v]) => ({ name, model: v.model, usd: v.usd }))
      .filter((v) => v.usd > 0)
      .sort((a, b) => b.usd - a.usd);
    if (new Set(list.map((v) => v.model)).size < 2) continue;
    splitBrains.push({ label, sources: list });
  }
  splitBrains.sort(
    (a, b) =>
      b.sources.reduce((s, v) => s + v.usd, 0) - a.sources.reduce((s, v) => s + v.usd, 0),
  );

  /**
   * Cache underwater: only meaningful when the aggregate paid off — when the
   * aggregate itself lost money, the whole-fleet report already shouts and
   * naming each source would repeat it in pieces.
   */
  const cacheUnderwater: FleetRollup['cacheUnderwater'] = [];
  if (
    options.cacheDeltas !== undefined &&
    options.aggregateCacheDelta !== undefined &&
    options.aggregateCacheDelta <= 0
  ) {
    for (const [name, deltaUsd] of options.cacheDeltas) {
      if (deltaUsd > 0) cacheUnderwater.push({ name, deltaUsd });
    }
    cacheUnderwater.sort((a, b) => b.deltaUsd - a.deltaUsd);
  }

  return {
    totalUsd,
    calls,
    sources: withShare,
    worst: totalUsd > 0 ? { name: rows[0]!.name, usd: rows[0]!.usd, share: withShare[0]!.share } : null,
    mismatchedSpans,
    splitBrains,
    cacheUnderwater,
  };
}
