import { effectivePricing, multipliersFor } from './pricing.js';
import { UNLABELLED } from './usage.js';
import type { PricingCatalogue } from './pricing.js';
import type { UsageRecord } from './usage.js';

/**
 * How big a call's input actually is, and how uneven that is across a slice.
 *
 * ## The half of the bill nothing described
 *
 * `outputShapes` says where the *output* spend concentrates. Input had a total
 * and nothing else — and on a RAG or agent workload input is most of the bill,
 * made of retrieved context, conversation history and tool results that no
 * prompt file contains. "Input is 63% of this bill" is true and unactionable;
 * the question somebody can act on is whether that 63% is *every* call
 * carrying a large prompt, or a few calls carrying an enormous one.
 *
 * Two slices with identical input spend want opposite responses:
 *
 * - **Even.** The p95 call carries roughly what the median call carries. The
 *   prompt is simply large, and the lever is the prompt: fewer retrieved
 *   documents, a shorter system block, caching if the prefix repeats.
 * - **Skewed.** The p95 call carries twelve times the median. Something is
 *   growing — a conversation nobody truncates, a retrieval with no cap, a
 *   tool result pasted in whole. The median call is fine and the fix is a
 *   limit, not a rewrite.
 *
 * A total cannot tell those apart, and neither can the per-day series.
 *
 * ## What "input" means here
 *
 * Everything the model read: fresh input, cache reads and cache writes. That
 * is the size of the request, which is what a context window and a retrieval
 * cap are about. `cachedShare` then says how much of it was billed at the
 * cache-read rate — a tenth of input on Anthropic — because a slice whose
 * large calls are almost entirely cache reads is a very different bill from
 * one paying full rate for the same tokens, and the token counts alone cannot
 * tell them apart.
 *
 * ## Ceilings, never interpolations
 *
 * The counts live in fixed buckets, so a usage log measured in megabytes costs
 * bounded memory. Every figure reported is a **bucket edge**: "half the calls
 * fit within N tokens" is exact for the N named, where interpolating a median
 * between two buckets would invent a call nobody made. `p95OverMedian` is
 * therefore a ratio of two ceilings and coarse by construction — it is a shape,
 * not a measurement, and the copy that renders it says which.
 */

/** How one label-and-model slice's input is distributed across its calls. */
export interface InputShape {
  label: string;
  model: string;
  modelName: string;
  calls: number;
  /** Fresh input, cache reads and cache writes — everything the model read. */
  inputTokens: number;
  /** What those tokens cost, at each class's own rate. */
  inputUsd: number;
  /** This slice's input spend as a fraction of the whole bill. */
  shareOfBill: number;
  /**
   * The bucket ceiling at least half the calls fit within, and the same for
   * 95% of them. `null` only when the covering bucket is the open-ended last
   * one, which has no ceiling to name.
   */
  medianWithinTokens: number | null;
  p95WithinTokens: number | null;
  /**
   * `p95WithinTokens / medianWithinTokens` — how much bigger the large calls
   * are than the ordinary one. A ratio of two ceilings, so it is coarse on
   * purpose; `null` when either ceiling is unknown or the median ceiling is
   * zero.
   */
  p95OverMedian: number | null;
  /**
   * The share of these tokens that were cache reads.
   *
   * Says what the size actually costs: on Anthropic a cache read is a tenth of
   * input, so a slice at 0.9 here is large and cheap, and one at 0 is large at
   * full rate. Without it, "the p95 call carries 400,000 tokens" reads as an
   * emergency in a workload that is caching correctly.
   */
  cachedShare: number;
}

export interface InputShapeOptions {
  catalogue: PricingCatalogue;
  on?: Date;
  /** Slices whose input is below this share of the bill are dropped. Default 5%. */
  minShare?: number;
  /**
   * Slices with fewer calls than this are dropped. Default 20.
   *
   * A p95 over four calls is the largest of the four wearing a percentile's
   * name, and the sentence this feeds — "the large calls are twelve times the
   * ordinary one" — would be a description of one call.
   */
  minCalls?: number;
}

/**
 * Bucket edges sized for requests rather than answers.
 *
 * 512 tokens up to 65,536 is finer than any decision about a prompt, and past
 * that the buckets widen to 8,192: the difference between a 400,000-token
 * request and a 404,000-token one changes nothing. The last bucket is
 * open-ended so a call larger than the widest edge still lands somewhere,
 * counted rather than dropped.
 */
const SMALL_STEP = 512;
const SMALL_LIMIT = 65_536;
const LARGE_STEP = 8_192;
const LARGE_LIMIT = 1_048_576;

const EDGES: number[] = (() => {
  const edges: number[] = [];
  for (let t = 0; t < SMALL_LIMIT; t += SMALL_STEP) edges.push(t);
  for (let t = SMALL_LIMIT; t < LARGE_LIMIT; t += LARGE_STEP) edges.push(t);
  return edges;
})();

const SMALL_BUCKETS = SMALL_LIMIT / SMALL_STEP;

/** Index of the bucket a count falls in. The last bucket is open-ended. */
function bucketOf(tokens: number): number {
  if (tokens >= EDGES[EDGES.length - 1]!) return EDGES.length - 1;
  if (tokens < SMALL_LIMIT) return Math.floor(tokens / SMALL_STEP);
  return SMALL_BUCKETS + Math.floor((tokens - SMALL_LIMIT) / LARGE_STEP);
}

/** A bucket's upper edge, or `null` for the open-ended last one. */
function upperEdgeOf(bucket: number): number | null {
  if (bucket >= EDGES.length - 1) return null;
  return EDGES[bucket + 1]!;
}

/**
 * The bucket ceiling covering `share` of the calls, walking up from the
 * smallest requests. Exact over the histogram: every call at or below the
 * returned ceiling is counted, none is interpolated.
 */
function ceilingFor(buckets: Map<number, number>, totalCalls: number, share: number): number | null {
  const ascending = [...buckets.keys()].sort((a, b) => a - b);
  const target = totalCalls * share;
  let covered = 0;
  for (const b of ascending) {
    covered += buckets.get(b)!;
    if (covered >= target) return upperEdgeOf(b);
  }
  return upperEdgeOf(ascending[ascending.length - 1]!);
}

interface Slice {
  calls: number;
  inputTokens: number;
  cachedTokens: number;
  inputUsd: number;
  /** Calls per bucket, sparse. */
  buckets: Map<number, number>;
}

export interface InputShapeTracker {
  add(record: UsageRecord): void;
  finish(totalUsd: number): InputShape[];
}

/** An accumulator, fed in the pass a profile already makes. */
export function createInputShapeTracker(options: InputShapeOptions): InputShapeTracker {
  const { catalogue, on = new Date(), minShare = 0.05, minCalls = 20 } = options;
  const slices = new Map<string, Slice>();

  const add = (record: UsageRecord): void => {
    const model = catalogue.byId.get(record.model);
    // An unpriced model contributes no dollars anywhere else; a shape drawn
    // from one would describe a bill that was never computed.
    if (!model) return;

    const tokens =
      record.inputTokens +
      record.cacheReadTokens +
      record.cacheWrite5mTokens +
      record.cacheWrite1hTokens;
    if (tokens <= 0) return;

    const key = `${record.label ?? UNLABELLED}\n${record.model}`;
    let slice = slices.get(key);
    if (!slice) {
      slice = { calls: 0, inputTokens: 0, cachedTokens: 0, inputUsd: 0, buckets: new Map() };
      slices.set(key, slice);
    }

    const { inputPerMTok } = effectivePricing(model, on);
    const rates = multipliersFor(model);
    const per = (count: number, rate: number): number => (count / 1_000_000) * rate;

    slice.calls += 1;
    slice.inputTokens += tokens;
    slice.cachedTokens += record.cacheReadTokens;
    slice.inputUsd +=
      per(record.inputTokens, inputPerMTok) +
      per(record.cacheReadTokens, inputPerMTok * rates.cacheRead) +
      per(record.cacheWrite5mTokens, inputPerMTok * rates.cacheWrite5m) +
      per(record.cacheWrite1hTokens, inputPerMTok * rates.cacheWrite1h);

    const b = bucketOf(tokens);
    slice.buckets.set(b, (slice.buckets.get(b) ?? 0) + 1);
  };

  const finish = (totalUsd: number): InputShape[] => {
    const out: InputShape[] = [];

    for (const [key, slice] of slices) {
      const split = key.indexOf('\n');
      const label = key.slice(0, split);
      const modelId = key.slice(split + 1);
      const model = catalogue.byId.get(modelId);
      if (!model || slice.calls < minCalls) continue;

      const shareOfBill = totalUsd > 0 ? slice.inputUsd / totalUsd : 0;
      if (shareOfBill < minShare) continue;

      const medianWithinTokens = ceilingFor(slice.buckets, slice.calls, 0.5);
      const p95WithinTokens = ceilingFor(slice.buckets, slice.calls, 0.95);

      out.push({
        label,
        model: modelId,
        modelName: model.displayName,
        calls: slice.calls,
        inputTokens: slice.inputTokens,
        inputUsd: slice.inputUsd,
        shareOfBill,
        medianWithinTokens,
        p95WithinTokens,
        p95OverMedian:
          medianWithinTokens !== null && p95WithinTokens !== null && medianWithinTokens > 0
            ? p95WithinTokens / medianWithinTokens
            : null,
        cachedShare: slice.inputTokens > 0 ? slice.cachedTokens / slice.inputTokens : 0,
      });
    }

    return out.sort((a, b) => b.inputUsd - a.inputUsd);
  };

  return { add, finish };
}

/** The same measurement over a list of records, for a caller holding one. */
export function inputShapes(
  records: readonly UsageRecord[],
  totalUsd: number,
  options: InputShapeOptions,
): InputShape[] {
  const tracker = createInputShapeTracker(options);
  for (const record of records) tracker.add(record);
  return tracker.finish(totalUsd);
}
