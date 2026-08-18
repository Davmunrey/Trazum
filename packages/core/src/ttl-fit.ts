import { effectivePricing, multipliersFor } from './pricing.js';
import { UNLABELLED } from './usage.js';
import type { PricingCatalogue } from './pricing.js';
import type { UsageRecord } from './usage.js';

/**
 * Does the cache TTL fit how fast the turns actually arrive?
 *
 * ## The mechanism nothing else can see
 *
 * A cache entry lives 5 minutes, or an hour at twice the write price. Whether
 * either is the right choice depends on one number the bill never shows: **how
 * long the workload waits between turns.** A support agent whose users answer in
 * nine minutes writes a 5-minute entry on every turn and reads it back on none of
 * them — every write expires unread, which from the bill is indistinguishable
 * from any other losing cache. `cacheEconomics` can say *that* money was lost;
 * only the clock can say *why*, and the why decides the fix: the 1-hour TTL, or
 * caching switched off.
 *
 * The opposite mistake is quieter and this is the only place it appears at all:
 * turns arriving seconds apart, written at the 1-hour rate. Those writes work —
 * the verdict above reads `paid-off` — and every one of them pays 2x input for
 * endurance the workload never uses. **Switching them to the 5-minute TTL is the
 * one exact saving in this module**: the same tokens at 1.25x instead of 2x,
 * which is the same-tokens-different-rate arithmetic `cacheEconomics` already
 * draws the counterfactual line at.
 *
 * ## What it measures, and how it stays honest
 *
 * The gap between consecutive turns **of the same conversation**, from the
 * recorded clock — sessions are what a cache entry actually serves, and gaps
 * between unrelated calls of a label say nothing about whether *this*
 * conversation's next turn found the entry alive. Timestamps are sorted within
 * each session before differencing, so the measurement is independent of the
 * order of the log — the property the conversation tracker had to learn the
 * hard way.
 *
 * The reported number is the **median** gap, named as such: a median survives
 * the overnight gap between a user's Tuesday and Wednesday in a way a mean does
 * not, and a verdict hung on a mean would flip on one lunch break.
 *
 * When the log did not record which TTL the writes used, the gap can sit where
 * the verdict depends on the answer — over 5 minutes and under an hour survives
 * one TTL and not the other. That is reported as `unsettled`, the same refusal
 * `cacheEconomics` makes for the same missing field, and never resolved in the
 * flattering direction.
 *
 * The session key is used to group turns and never leaves this module, like
 * everywhere else the field is touched.
 */

/** Cache-entry lifetimes, in milliseconds. Anthropic's two published TTLs. */
export const TTL_5M_MS = 5 * 60 * 1000;
export const TTL_1H_MS = 60 * 60 * 1000;

export type TtlFitVerdict =
  /** The median gap outlives the entry: writes expire before the next turn. */
  | 'expires-before-reuse'
  /** 1-hour writes on gaps inside the 5-minute window: paying 2x for nothing. */
  | 'overlong-ttl'
  /** The TTL the log did not record decides the verdict, so nothing does. */
  | 'unsettled'
  /** The entry outlives the gap at the TTL the writes actually used. */
  | 'fits';

export interface CacheTtlFit {
  label: string;
  model: string;
  modelName: string;
  /** Conversations with at least two timestamped turns. Never which ones. */
  sessions: number;
  /** Gaps measured across them. */
  gaps: number;
  medianGapMs: number;
  /** Write tokens the log said were 5-minute entries. */
  write5mTokens: number;
  /** Write tokens the log said were 1-hour entries. */
  write1hTokens: number;
  /** Write tokens whose TTL the log did not record. */
  assumedTtlTokens: number;
  verdict: TtlFitVerdict;
  /**
   * What the 1-hour writes would save at the 5-minute rate, when the gaps show
   * the hour is never needed. Exact — the same tokens at 1.25x instead of 2x,
   * at the model's own input rate — and zero for every other verdict.
   */
  overpayUsd: number;
}

export interface TtlFitOptions {
  catalogue: PricingCatalogue;
  /** Date the prices are read at, so a promotional rate resolves the same way. */
  on?: Date;
}

export interface TtlFitTracker {
  /** Feed one parsed record. */
  add(record: UsageRecord): void;
  /** The finished measurement. */
  finish(): CacheTtlFit[];
}

interface Slice {
  write5mTokens: number;
  write1hTokens: number;
  assumedTtlTokens: number;
  /** Timestamps per session, sorted only at the end. */
  sessions: Map<string, number[]>;
}

const median = (sorted: number[]): number => {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

/**
 * An accumulator, like the conversation tracker and for the same reason: a
 * usage log is measured in megabytes and `profileUsage` makes one pass. What
 * this holds is one number per timestamped call that belongs to a session,
 * which is the minimum the gaps can be computed from at all.
 */
export function createTtlFitTracker(options: TtlFitOptions): TtlFitTracker {
  const { catalogue, on = new Date() } = options;
  const slices = new Map<string, Slice>();

  const add = (record: UsageRecord): void => {
    // An unpriced model has no rates to judge a TTL against, and contributes no
    // dollars anywhere else either.
    if (!catalogue.byId.has(record.model)) return;

    const writes =
      record.cacheWrite5mTokens + record.cacheWrite1hTokens;
    const hasClockedTurn = record.session !== null && record.ts !== null;
    // A slice exists once it writes to the cache or can contribute a gap;
    // everything else has nothing to say here.
    if (writes === 0 && !hasClockedTurn) return;

    const key = `${record.label ?? UNLABELLED}\n${record.model}`;
    let slice = slices.get(key);
    if (!slice) {
      slice = { write5mTokens: 0, write1hTokens: 0, assumedTtlTokens: 0, sessions: new Map() };
      slices.set(key, slice);
    }

    if (record.writeTtlKnown) {
      slice.write5mTokens += record.cacheWrite5mTokens;
      slice.write1hTokens += record.cacheWrite1hTokens;
    } else {
      // The flat count sits in the 5m bucket by pricing convention; here it is
      // kept apart, because the whole question is which TTL it really was.
      slice.assumedTtlTokens += record.cacheWrite5mTokens;
    }

    if (hasClockedTurn) {
      const turns = slice.sessions.get(record.session!);
      if (turns) turns.push(record.ts!);
      else slice.sessions.set(record.session!, [record.ts!]);
    }
  };

  const finish = (): CacheTtlFit[] => {
    const out: CacheTtlFit[] = [];

    for (const [key, slice] of slices) {
      const writes = slice.write5mTokens + slice.write1hTokens + slice.assumedTtlTokens;
      // No writes means no TTL to judge. Gaps alone are the conversation
      // tracker's business, not this module's.
      if (writes === 0) continue;

      const gaps: number[] = [];
      let sessions = 0;
      for (const turns of slice.sessions.values()) {
        if (turns.length < 2) continue;
        sessions += 1;
        turns.sort((a, b) => a - b);
        for (let i = 1; i < turns.length; i += 1) gaps.push(turns[i]! - turns[i - 1]!);
      }
      // Writes with no measurable gap: the caller reports "could not be
      // measured" from the absence of a row, the same way missing sessions
      // read everywhere else.
      if (gaps.length === 0) continue;

      const split = key.indexOf('\n');
      const modelId = key.slice(split + 1);
      const model = catalogue.byId.get(modelId)!;

      gaps.sort((a, b) => a - b);
      const gap = median(gaps);

      /**
       * First match wins, ordered so that a certain failure outranks an
       * uncertain one and money comes last: writes that expire are broken at
       * any price, and only writes that demonstrably work can be overpaying.
       */
      let verdict: TtlFitVerdict;
      if (slice.write5mTokens > 0 && gap > TTL_5M_MS) verdict = 'expires-before-reuse';
      else if (slice.write1hTokens > 0 && gap > TTL_1H_MS) verdict = 'expires-before-reuse';
      else if (slice.assumedTtlTokens > 0 && gap > TTL_1H_MS) verdict = 'expires-before-reuse';
      else if (slice.write1hTokens > 0 && gap <= TTL_5M_MS) verdict = 'overlong-ttl';
      else if (slice.assumedTtlTokens > 0 && gap > TTL_5M_MS) verdict = 'unsettled';
      else verdict = 'fits';

      const { inputPerMTok } = effectivePricing(model, on);
      const rates = multipliersFor(model);
      const overpayUsd =
        verdict === 'overlong-ttl'
          ? (slice.write1hTokens / 1_000_000) *
            inputPerMTok *
            (rates.cacheWrite1h - rates.cacheWrite5m)
          : 0;

      out.push({
        label: key.slice(0, split),
        model: modelId,
        modelName: model.displayName,
        sessions,
        gaps: gaps.length,
        medianGapMs: gap,
        write5mTokens: slice.write5mTokens,
        write1hTokens: slice.write1hTokens,
        assumedTtlTokens: slice.assumedTtlTokens,
        verdict,
        overpayUsd,
      });
    }

    // Broken first, then overpaying by money, then the rest — the order
    // somebody would act in.
    const rank: Record<TtlFitVerdict, number> = {
      'expires-before-reuse': 0,
      'overlong-ttl': 1,
      unsettled: 2,
      fits: 3,
    };
    return out.sort(
      (a, b) => rank[a.verdict] - rank[b.verdict] || b.overpayUsd - a.overpayUsd,
    );
  };

  return { add, finish };
}

/** The same measurement over a list, for a caller holding one already. */
export function cacheTtlFit(
  records: readonly UsageRecord[],
  options: TtlFitOptions,
): CacheTtlFit[] {
  const tracker = createTtlFitTracker(options);
  for (const record of records) tracker.add(record);
  return tracker.finish();
}
