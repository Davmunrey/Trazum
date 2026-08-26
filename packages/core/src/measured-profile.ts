/**
 * The usage profile `optimize` multiplies by, taken from a log instead of
 * from somebody's typing.
 *
 * `optimize` prices a prompt change as `token delta × callsPerMonth`, with
 * `avgOutputTokens` and `cacheHitRate` shaping the rest. Those three numbers
 * are typed into a config file by a human who is guessing, and the two values
 * most often typed are `1000` and whatever the README's example used. A usage
 * log sitting in the same repository knows all three exactly.
 *
 * **What this module does not do is turn an estimate into a fact.** The token
 * delta stays an estimate with its ±10% band; what stops being a guess is
 * everything it is multiplied by. That distinction has to survive into the
 * rendering, which is why `MeasuredUsage` carries the provenance of each
 * figure rather than only the figures.
 *
 * The hardest decision here is the call count. A month's saving from a log
 * covering three days is a forecast wearing arithmetic's clothes, and this
 * repository refuses those. So the scaling has a floor, it is stated whenever
 * it happens, and under the floor the tool reports the period it measured and
 * declines the multiplication rather than performing it quietly.
 */

import { UNLABELLED } from './usage.js';
import type { UsageProfileReport } from './usage.js';
import type { UsageProfile } from './types.js';

/**
 * The shortest span that may be scaled to a month, in days.
 *
 * A full week, because the week is the cycle traffic actually has: weekdays
 * against weekends is the one periodicity nearly every workload shows, and a
 * span shorter than one cycle scaled up multiplies whichever part of the
 * cycle it happened to catch. Three weekdays scaled to a month is not a
 * monthly figure, it is a Tuesday with a multiplier.
 *
 * Above the floor this is still a *rate*, not a prediction: "at the rate this
 * log measured" is arithmetic about the past, and every rendering says so.
 */
export const MIN_SCALE_DAYS = 7;

/** Days in the month this scales to. Stated rather than hidden in a constant. */
export const SCALE_TO_DAYS = 30;

export interface MeasuredUsage {
  /** Ready to hand to `optimize`. Every field below is measured, not typed. */
  profile: UsageProfile;
  /** Calls the log actually recorded for this slice. Never scaled. */
  calls: number;
  /** What those calls actually cost. The measured half of any comparison. */
  spentUsd: number;
  /**
   * The period the calls fall in, in days, or null when no call carried a
   * clock. Null is why `scaled` can be null with calls above the floor.
   */
  spanDays: number | null;
  /**
   * How `callsPerMonth` was reached, or **null when it was not scaled at
   * all** — in which case `profile.callsPerMonth` is the raw measured count
   * over whatever period the log covers, and the rendering must say so
   * rather than printing it under a "per month" heading.
   */
  scaled: { fromDays: number; factor: number } | null;
  /**
   * The share of input tokens served from cache, 0–1.
   *
   * `UsageProfile.cacheHitRate` is documented as the fraction of *calls* that
   * reuse the prefix; what a log can measure is the fraction of input
   * *tokens* that were cache reads. Those are the same number only when every
   * call is the same size. It is handed over as the better of two
   * approximations — a measured token share beats a typed call share — and
   * named honestly here so no rendering can call it something it is not.
   *
   * The denominator is every input token, **writes included**. Leaving writes
   * out made a constantly-rewritten cache report a high hit rate, which is the
   * one workload that most needs to be told otherwise.
   */
  cacheReadShare: number;
  /**
   * The model carrying the most spend in this slice, and how many models the
   * slice used at all. Above one, the single model handed to `optimize` is a
   * simplification and the rendering says which share it covers.
   */
  models: { chosen: string; count: number; chosenShareOfSpend: number };
  /** True when no call in the slice recorded any output tokens. */
  outputUnmeasured: boolean;
}

/**
 * Derives the usage profile for one label from a measured report.
 *
 * Returns `null` when the label carries no priced calls — a slice with no
 * measured traffic has nothing to hand over, and inventing a zero-call
 * profile would produce a $0 saving that reads as "this change is worthless"
 * rather than "nothing here was measured".
 */
export function measuredUsage(
  report: UsageProfileReport,
  label: string,
  options: { batchEligible?: boolean } = {},
): MeasuredUsage | null {
  const slices = report.byLabelAndModel.filter((row) => row.label === label);
  if (slices.length === 0) return null;

  const calls = slices.reduce((sum, row) => sum + row.breakdown.calls, 0);
  if (calls === 0) return null;

  const spentUsd = slices.reduce((sum, row) => sum + row.breakdown.totalUsd, 0);
  const outputTokens = slices.reduce((sum, row) => sum + row.breakdown.outputTokens, 0);
  const inputTokens = slices.reduce((sum, row) => sum + row.breakdown.inputTokens, 0);
  const cacheReadTokens = slices.reduce((sum, row) => sum + row.breakdown.cacheReadTokens, 0);
  const cacheWriteTokens = slices.reduce((sum, row) => sum + row.breakdown.cacheWriteTokens, 0);

  // The model carrying the most spend. Ties break on the larger call count, so
  // the answer is stable rather than dependent on map ordering.
  const ranked = [...slices].sort(
    (a, b) => b.breakdown.totalUsd - a.breakdown.totalUsd || b.breakdown.calls - a.breakdown.calls,
  );
  const chosen = ranked[0]!;
  const chosenShareOfSpend = spentUsd > 0 ? chosen.breakdown.totalUsd / spentUsd : 0;

  /**
   * The span of *this slice*, not of the whole log. A label active for three
   * days of a thirty-day log has a three-day rate, and using the log's span
   * would divide its calls across weeks it never ran in.
   */
  const spanDays =
    report.span === null ? null : (report.span.toMs - report.span.fromMs) / 86_400_000;

  const scaled =
    spanDays !== null && spanDays >= MIN_SCALE_DAYS
      ? { fromDays: spanDays, factor: SCALE_TO_DAYS / spanDays }
      : null;

  /**
   * Every input token in the denominator, writes included.
   *
   * This was `reads / (input + reads)`, which leaves cache *writes* out of the
   * total it is a share of. A workload that rewrites its prefix on every call
   * and reads it back rarely then reports a **high** hit rate: with 100 read
   * tokens, no plain input and 10,000 written, the old expression answers 100%
   * where the truth is 1%.
   *
   * That is the worst direction for this number to be wrong in. It is handed
   * to `optimize` as `cacheHitRate`, which decides whether caching is paying
   * off — so the shape that is burning money on writes was the shape most
   * likely to be told its cache was working perfectly.
   *
   * Writes are input tokens: they are billed at the input rate times the write
   * multiplier, they arrive in the same `usage` block, and any accounting of
   * "what share of the input came from cache" that omits them is answering a
   * narrower question than the one it is named for.
   */
  const allInputTokens = inputTokens + cacheReadTokens + cacheWriteTokens;
  const readShare = allInputTokens > 0 ? cacheReadTokens / allInputTokens : 0;

  return {
    profile: {
      model: chosen.model,
      // Scaled when the span earns it, the raw measured count otherwise. The
      // caller must read `scaled` before printing this under any heading that
      // says "month".
      callsPerMonth: scaled === null ? calls : Math.round(calls * scaled.factor),
      avgOutputTokens: Math.round(outputTokens / calls),
      cacheHitRate: readShare,
      batchEligible: options.batchEligible ?? false,
    },
    calls,
    spentUsd,
    spanDays,
    scaled,
    cacheReadShare: readShare,
    models: { chosen: chosen.model, count: slices.length, chosenShareOfSpend },
    outputUnmeasured: outputTokens === 0,
  };
}

/**
 * Every label the report priced, with the prompt file the config maps to it —
 * and, deliberately, both kinds of mismatch.
 *
 * The two failures this surfaces are the ones a person cannot see from either
 * side alone: a prompt file mapped to a label that no longer appears in the
 * log (renamed, retired, or a typo that has been silently doing nothing), and
 * a label carrying real money with no prompt file mapped at all (the workload
 * nobody can optimise because nobody said where it lives).
 */
export interface LabelCoverage {
  /** Labels with both traffic and a mapped prompt file. */
  joined: { label: string; promptPath: string; spentUsd: number }[];
  /** Mapped prompt files whose label has no priced traffic in this log. */
  mappedWithoutTraffic: { label: string; promptPath: string }[];
  /** Labels with priced traffic and no prompt file mapped, dearest first. */
  trafficWithoutPrompt: { label: string; spentUsd: number }[];
}

export function labelCoverage(
  report: UsageProfileReport,
  labels: Record<string, string>,
): LabelCoverage {
  const spendByLabel = new Map(report.byLabel.map((row) => [row.label, row.breakdown.totalUsd]));

  const joined: LabelCoverage['joined'] = [];
  const mappedWithoutTraffic: LabelCoverage['mappedWithoutTraffic'] = [];
  for (const [label, promptPath] of Object.entries(labels)) {
    const spentUsd = spendByLabel.get(label);
    if (spentUsd === undefined) mappedWithoutTraffic.push({ label, promptPath });
    else joined.push({ label, promptPath, spentUsd });
  }

  const trafficWithoutPrompt = report.byLabel
    // The unlabelled bucket is not a workload somebody forgot to map; it is
    // calls that carry no label at all, which `fieldCoverage` already reports.
    .filter((row) => row.label !== UNLABELLED && labels[row.label] === undefined)
    .map((row) => ({ label: row.label, spentUsd: row.breakdown.totalUsd }))
    .sort((a, b) => b.spentUsd - a.spentUsd);

  joined.sort((a, b) => b.spentUsd - a.spentUsd);
  mappedWithoutTraffic.sort((a, b) => a.label.localeCompare(b.label));

  return { joined, mappedWithoutTraffic, trafficWithoutPrompt };
}
