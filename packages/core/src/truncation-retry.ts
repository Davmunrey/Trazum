import { effectivePricing, multipliersFor } from './pricing.js';
import { UNLABELLED } from './usage.js';
import type { PricingCatalogue } from './pricing.js';
import type { UsageRecord } from './usage.js';

/**
 * The retry bill of truncation.
 *
 * ## The half of the cost the truncation line could not see
 *
 * `truncatedOutputUsd` prices the answers cut off at `max_tokens` — paid in
 * full, and the attempt bought nothing. The sentence next to it has always
 * said "frequently retried, billed again", and that second half was an
 * assertion rather than a measurement: nothing counted the retries.
 *
 * This does. A truncated answer followed **within a couple of minutes by
 * another call in the same conversation** is the shape a retry has — the
 * user or the harness asked again, usually with a raised ceiling — and both
 * sides of that pair are in the log. The first call's full price is money
 * that bought a cut-off answer; the follow-up is the same question billed a
 * second time, at conversation prices, with the history re-sent.
 *
 * ## What it compares, and why only that
 *
 * Each call is checked against the one immediately before it in the same
 * session — the bounded-memory design `repeats.ts` uses, for the same
 * reasons — and only when the previous call was truncated and the gap is
 * non-negative and inside the window. Two minutes by default, wider than the
 * repeat window: a human rephrasing after a cut-off answer takes longer than
 * a harness retrying a timeout.
 *
 * ## What it refuses to conclude
 *
 * It cannot see content, so it cannot tell a retry from a user changing the
 * subject right after a truncated answer. The pair is a pattern, stated as
 * one. A single pair is not reported — one retry is an anecdote — and the
 * per-slice denominator (`truncatedCalls` that *could* be checked) travels
 * with the count, so "3 of 40" and "3 of 3" read as differently as they are.
 */

/** Truncated answers followed by another call in the same conversation. */
export interface TruncationRetry {
  label: string;
  model: string;
  modelName: string;
  /** Truncated calls that were followed up inside the window. */
  retried: number;
  /** Truncated calls in this slice that carried a session and a clock. */
  truncatedCalls: number;
  /** The full price of the truncated attempts that were followed up. */
  wastedUsd: number;
  /** The full price of the follow-up calls. */
  retryUsd: number;
  /** The window the follow-up had to fall inside, in milliseconds. */
  withinMs: number;
}

export interface TruncationRetryOptions {
  catalogue: PricingCatalogue;
  on?: Date;
  /**
   * How close the follow-up has to be. Two minutes by default — a human
   * rephrasing after a cut-off answer takes longer than a harness retrying,
   * and past a couple of minutes the next call is a next question.
   */
  withinMs?: number;
  /** Slices below this many retried pairs are dropped. Default 2. */
  minRetried?: number;
}

export interface TruncationRetryTracker {
  add(record: UsageRecord): void;
  finish(): TruncationRetry[];
}

interface Slice {
  retried: number;
  truncatedCalls: number;
  wastedUsd: number;
  retryUsd: number;
}

/** An accumulator, fed in the pass a profile already makes. */
export function createTruncationRetryTracker(options: TruncationRetryOptions): TruncationRetryTracker {
  const { catalogue, on = new Date(), withinMs = 120_000, minRetried = 2 } = options;
  const slices = new Map<string, Slice>();
  /** The previous call of each session: whether it truncated, when, its price, and whose slice it was. */
  const previous = new Map<string, { truncated: boolean; ts: number; usd: number; key: string }>();

  const priceOf = (record: UsageRecord): number | null => {
    const model = catalogue.byId.get(record.model);
    if (!model) return null;
    const { inputPerMTok, outputPerMTok } = effectivePricing(model, on);
    const rates = multipliersFor(model);
    const per = (count: number, rate: number): number => (count / 1_000_000) * rate;
    return (
      per(record.inputTokens, inputPerMTok) +
      per(record.cacheReadTokens, inputPerMTok * rates.cacheRead) +
      per(record.cacheWrite5mTokens, inputPerMTok * rates.cacheWrite5m) +
      per(record.cacheWrite1hTokens, inputPerMTok * rates.cacheWrite1h) +
      per(record.outputTokens, outputPerMTok)
    );
  };

  const add = (record: UsageRecord): void => {
    if (record.session === null || record.ts === null) return;
    const usd = priceOf(record);
    // An unpriced model has no dollars anywhere else in the report; a retry
    // bill stated for it would be a figure with nothing behind it.
    if (usd === null) return;

    const key = `${record.label ?? UNLABELLED}\n${record.model}`;
    const before = previous.get(record.session);
    previous.set(record.session, { truncated: record.truncated === true, ts: record.ts, usd, key });

    if (record.truncated === true) {
      let slice = slices.get(key);
      if (!slice) {
        slice = { retried: 0, truncatedCalls: 0, wastedUsd: 0, retryUsd: 0 };
        slices.set(key, slice);
      }
      slice.truncatedCalls += 1;
    }

    if (before === undefined || !before.truncated) return;
    const gap = record.ts - before.ts;
    // Out of order is not a retry, and neither is tomorrow's next question.
    if (gap < 0 || gap >= withinMs) return;

    // Attributed to the slice of the *truncated* call: that is where the
    // ceiling that caused this lives, and where the fix is applied.
    let slice = slices.get(before.key);
    if (!slice) {
      slice = { retried: 0, truncatedCalls: 0, wastedUsd: 0, retryUsd: 0 };
      slices.set(before.key, slice);
    }
    slice.retried += 1;
    slice.wastedUsd += before.usd;
    slice.retryUsd += usd;
  };

  const finish = (): TruncationRetry[] => {
    const out: TruncationRetry[] = [];
    for (const [key, slice] of slices) {
      if (slice.retried < minRetried) continue;
      const split = key.indexOf('\n');
      const modelId = key.slice(split + 1);
      const model = catalogue.byId.get(modelId);
      if (!model) continue;
      out.push({
        label: key.slice(0, split),
        model: modelId,
        modelName: model.displayName,
        retried: slice.retried,
        truncatedCalls: slice.truncatedCalls,
        wastedUsd: slice.wastedUsd,
        retryUsd: slice.retryUsd,
        withinMs,
      });
    }
    return out.sort((a, b) => b.wastedUsd + b.retryUsd - (a.wastedUsd + a.retryUsd));
  };

  return { add, finish };
}

/** The same measurement over a list of records, for a caller holding one. */
export function truncationRetries(
  records: readonly UsageRecord[],
  options: TruncationRetryOptions,
): TruncationRetry[] {
  const tracker = createTruncationRetryTracker(options);
  for (const record of records) tracker.add(record);
  return tracker.finish();
}
