import { effectivePricing, multipliersFor } from './pricing.js';
import { UNLABELLED } from './usage.js';
import type { PricingCatalogue } from './pricing.js';
import type { UsageRecord } from './usage.js';

/**
 * The same request, sent again a moment later.
 *
 * ## The failure mode nothing else here can see
 *
 * A conversation's input **grows with every turn** — that is the finding
 * `conversations` exists for. So two consecutive calls in one conversation
 * carrying *exactly* the same input size, seconds apart, is the shape of
 * something going wrong rather than something working: a retry after a
 * timeout, an agent step repeating because a tool call failed, a loop that
 * re-sends the whole context and gets nowhere.
 *
 * That is expensive in a way a total hides completely. The retried call is
 * billed in full, and on an agent workload the input is the bill.
 * `duplicateLines` catches the same line recorded twice; this catches two
 * *different* calls that sent the same thing.
 *
 * ## What it compares, and why only that
 *
 * Each call is compared to **the one immediately before it in the same
 * session**, and only when the log carries both a session and a clock. Not to
 * every earlier call: a workload that legitimately sends a fixed-size prompt
 * would light up under a looser rule, and holding every size a session has
 * ever sent would grow without bound on a log measured in megabytes. One
 * previous call per session is bounded and is where a retry actually sits.
 *
 * The gap must be **non-negative and under the window** (a minute by default).
 * Non-negative because a log is not guaranteed to be in time order, and a
 * negative gap means the two records arrived out of order rather than that a
 * call repeated.
 *
 * ## What it refuses to conclude
 *
 * It cannot see content, so it cannot tell a retry from two genuinely
 * identical requests a second apart. It reports the count and the money and
 * stops — the same rule `duplicateLines` follows. Every rendering says the
 * pattern is *usually* a retry or a loop, never that it is one.
 */

/** Consecutive same-size calls in one conversation, per slice. */
export interface RepeatedTurns {
  label: string;
  model: string;
  modelName: string;
  /** How many calls repeated the previous call's input size inside the window. */
  repeats: number;
  /** Calls in this slice that could be checked at all — the denominator. */
  checkedCalls: number;
  /** What those repeated calls cost, in full. */
  usd: number;
  /** The window they had to fall inside, in milliseconds. */
  withinMs: number;
}

export interface RepeatsOptions {
  catalogue: PricingCatalogue;
  on?: Date;
  /**
   * How close two calls have to be. A minute by default: long enough to cover
   * a timeout and a retry, short enough that an ordinary next turn — which
   * needs a human or a tool to produce it — rarely lands inside it.
   */
  withinMs?: number;
  /** Slices below this many repeats are dropped. Default 2. */
  minRepeats?: number;
}

export interface RepeatsTracker {
  add(record: UsageRecord): void;
  finish(): RepeatedTurns[];
}

interface Slice {
  repeats: number;
  checkedCalls: number;
  usd: number;
}

/** An accumulator, fed in the pass a profile already makes. */
export function createRepeatsTracker(options: RepeatsOptions): RepeatsTracker {
  const { catalogue, on = new Date(), withinMs = 60_000, minRepeats = 2 } = options;
  const slices = new Map<string, Slice>();
  /** The previous call of each session: its input size and when it happened. */
  const previous = new Map<string, { tokens: number; ts: number }>();

  const add = (record: UsageRecord): void => {
    const model = catalogue.byId.get(record.model);
    // An unpriced model has no dollars anywhere else; naming money here that
    // no total contains would be a figure with nothing behind it.
    if (!model) return;
    if (record.session === null || record.ts === null) return;

    const tokens =
      record.inputTokens +
      record.cacheReadTokens +
      record.cacheWrite5mTokens +
      record.cacheWrite1hTokens;
    if (tokens <= 0) return;

    const key = `${record.label ?? UNLABELLED}\n${record.model}`;
    let slice = slices.get(key);
    if (!slice) {
      slice = { repeats: 0, checkedCalls: 0, usd: 0 };
      slices.set(key, slice);
    }
    slice.checkedCalls += 1;

    const before = previous.get(record.session);
    previous.set(record.session, { tokens, ts: record.ts });
    if (before === undefined) return;

    const gap = record.ts - before.ts;
    // Out of order is not a repeat, and neither is a call an hour later.
    if (gap < 0 || gap >= withinMs) return;
    if (before.tokens !== tokens) return;

    const { inputPerMTok, outputPerMTok } = effectivePricing(model, on);
    const rates = multipliersFor(model);
    const per = (count: number, rate: number): number => (count / 1_000_000) * rate;
    slice.repeats += 1;
    slice.usd +=
      per(record.inputTokens, inputPerMTok) +
      per(record.cacheReadTokens, inputPerMTok * rates.cacheRead) +
      per(record.cacheWrite5mTokens, inputPerMTok * rates.cacheWrite5m) +
      per(record.cacheWrite1hTokens, inputPerMTok * rates.cacheWrite1h) +
      per(record.outputTokens, outputPerMTok);
  };

  const finish = (): RepeatedTurns[] => {
    const out: RepeatedTurns[] = [];
    for (const [key, slice] of slices) {
      if (slice.repeats < minRepeats) continue;
      const split = key.indexOf('\n');
      const modelId = key.slice(split + 1);
      const model = catalogue.byId.get(modelId);
      if (!model) continue;
      out.push({
        label: key.slice(0, split),
        model: modelId,
        modelName: model.displayName,
        repeats: slice.repeats,
        checkedCalls: slice.checkedCalls,
        usd: slice.usd,
        withinMs,
      });
    }
    return out.sort((a, b) => b.usd - a.usd);
  };

  return { add, finish };
}

/** The same measurement over a list of records, for a caller holding one. */
export function repeatedTurns(
  records: readonly UsageRecord[],
  options: RepeatsOptions,
): RepeatedTurns[] {
  const tracker = createRepeatsTracker(options);
  for (const record of records) tracker.add(record);
  return tracker.finish();
}
