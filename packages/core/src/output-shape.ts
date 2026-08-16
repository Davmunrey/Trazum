import { effectivePricing } from './pricing.js';
import { UNLABELLED } from './usage.js';
import type { PricingCatalogue } from './pricing.js';
import type { UsageRecord } from './usage.js';

/**
 * Where the output spend concentrates.
 *
 * ## The biggest line, and nothing said anything actionable about it
 *
 * Output is over half of many real bills — **87%** on the support prompt this
 * repository measures itself against. `profile` could say that much and then
 * stopped, because the advice that follows from "output dominates" is about
 * answers rather than prompts, and the rules engine has nothing to offer there.
 *
 * But a total hides the shape, and the shape is the actionable part. Two bills
 * with identical output spend want opposite responses:
 *
 * - **A tail.** Six per cent of calls hold half the output spend. Those calls are
 *   doing something the other ninety-four are not — a different path through the
 *   prompt, a runaway with no `max_tokens`, a retrieval that returned a book. They
 *   are a morning's work and they are worth finding.
 * - **Flat.** Forty-five per cent of calls hold half of it, which is what "evenly
 *   spread" looks like. There is no tail to hunt; the answer length is inherent to
 *   the task, and the only lever is asking every answer to be shorter.
 *
 * ## The split is derived, not chosen
 *
 * The figure reported is **the smallest group of calls that holds at least half the
 * output spend**. Half is the point that divides the spend in two — a median over
 * money rather than a threshold somebody picked — and the group is found by walking
 * the distribution down from the longest answers until half the spend is covered.
 *
 * "At least half" is meant literally. The walk stops on a bucket boundary, so the
 * group it names is a whole number of buckets and can overshoot; saying "half"
 * flat would be claiming a precision the histogram does not have.
 *
 * ## Bounded memory, exact statement
 *
 * The counts live in fixed buckets rather than a list of every call, because a
 * usage log is measured in megabytes. Every call inside an included bucket is at or
 * above that bucket's lower edge, so **"calls producing more than N tokens" is
 * exact** for the N this reports — it is only ever a bucket edge.
 */

/** How the output spend of one label-and-model slice is distributed. */
export interface OutputShape {
  label: string;
  model: string;
  modelName: string;
  calls: number;
  outputTokens: number;
  outputUsd: number;
  /** The bucket edge the heaviest group sits above. Always a bucket boundary. */
  aboveTokens: number;
  /** How many calls are in that group. */
  heavyCalls: number;
  /** Their share of the calls in this slice. */
  heavyCallShare: number;
  /** Their share of this slice's output spend — at least a half, by construction. */
  heavySpendShare: number;
  /** This slice's output spend as a fraction of the whole bill. */
  shareOfBill: number;
}

export interface OutputShapeOptions {
  catalogue: PricingCatalogue;
  on?: Date;
  /** Slices whose output is below this share of the bill are dropped. Default 5%. */
  minShare?: number;
}

/**
 * Bucket edges, fine where answers actually land and coarse in the tail.
 *
 * 64 tokens up to 8,192 covers ordinary answers at a resolution finer than anybody
 * would act on; past that the buckets widen, because the difference between a
 * 40,000-token answer and a 41,000-token one changes no decision. The last bucket is
 * open-ended so nothing falls off the end — an answer longer than the largest edge
 * still counts, in the group where it belongs.
 */
const EDGES: number[] = (() => {
  const edges: number[] = [];
  for (let t = 0; t < 8192; t += 64) edges.push(t);
  for (let t = 8192; t < 131_072; t += 1024) edges.push(t);
  return edges;
})();

/** Index of the bucket a count falls in. The last bucket is open-ended. */
function bucketOf(tokens: number): number {
  if (tokens >= EDGES[EDGES.length - 1]!) return EDGES.length - 1;
  if (tokens < 8192) return Math.floor(tokens / 64);
  return 128 + Math.floor((tokens - 8192) / 1024);
}

interface Slice {
  calls: number;
  outputTokens: number;
  outputUsd: number;
  /** Calls and output tokens per bucket, sparse. */
  buckets: Map<number, { calls: number; tokens: number }>;
}

export interface OutputShapeTracker {
  add(record: UsageRecord): void;
  finish(totalUsd: number): OutputShape[];
}

/**
 * An accumulator, fed in the pass a profile already makes.
 *
 * What it holds is bounded by the number of slices times the number of buckets any
 * of them actually touches, not by the size of the log.
 */
export function createOutputShapeTracker(options: OutputShapeOptions): OutputShapeTracker {
  const { catalogue, on = new Date(), minShare = 0.05 } = options;
  const slices = new Map<string, Slice>();

  const add = (record: UsageRecord): void => {
    const model = catalogue.byId.get(record.model);
    // An unpriced model contributes no dollars anywhere else; a shape drawn from
    // one would be a distribution of a bill that was never computed.
    if (!model) return;
    if (record.outputTokens <= 0) return;

    const key = `${record.label ?? UNLABELLED}\n${record.model}`;
    let slice = slices.get(key);
    if (!slice) {
      slice = { calls: 0, outputTokens: 0, outputUsd: 0, buckets: new Map() };
      slices.set(key, slice);
    }

    const { outputPerMTok } = effectivePricing(model, on);
    slice.calls += 1;
    slice.outputTokens += record.outputTokens;
    slice.outputUsd += (record.outputTokens / 1_000_000) * outputPerMTok;

    const b = bucketOf(record.outputTokens);
    const cell = slice.buckets.get(b);
    if (cell) {
      cell.calls += 1;
      cell.tokens += record.outputTokens;
    } else {
      slice.buckets.set(b, { calls: 1, tokens: record.outputTokens });
    }
  };

  const finish = (totalUsd: number): OutputShape[] => {
    const out: OutputShape[] = [];

    for (const [key, slice] of slices) {
      const split = key.indexOf('\n');
      const label = key.slice(0, split);
      const modelId = key.slice(split + 1);
      const model = catalogue.byId.get(modelId);
      if (!model || slice.outputTokens === 0) continue;

      const shareOfBill = totalUsd > 0 ? slice.outputUsd / totalUsd : 0;
      if (shareOfBill < minShare) continue;

      /**
       * Walk down from the longest answers until half the output spend is
       * covered. Spend is proportional to tokens inside one slice — one model,
       * one rate — so the tokens are the money here and no second accumulator is
       * needed.
       */
      const target = slice.outputTokens / 2;
      const descending = [...slice.buckets.keys()].sort((a, b) => b - a);
      let tokens = 0;
      let heavyCalls = 0;
      let lastBucket = descending[0]!;
      for (const b of descending) {
        const cell = slice.buckets.get(b)!;
        tokens += cell.tokens;
        heavyCalls += cell.calls;
        lastBucket = b;
        if (tokens >= target) break;
      }

      out.push({
        label,
        model: modelId,
        modelName: model.displayName,
        calls: slice.calls,
        outputTokens: slice.outputTokens,
        outputUsd: slice.outputUsd,
        aboveTokens: EDGES[lastBucket]!,
        heavyCalls,
        heavyCallShare: heavyCalls / slice.calls,
        heavySpendShare: tokens / slice.outputTokens,
        shareOfBill,
      });
    }

    return out.sort((a, b) => b.outputUsd - a.outputUsd);
  };

  return { add, finish };
}

/** The same measurement over a list of records, for a caller holding one. */
export function outputShapes(
  records: readonly UsageRecord[],
  totalUsd: number,
  options: OutputShapeOptions,
): OutputShape[] {
  const tracker = createOutputShapeTracker(options);
  for (const record of records) tracker.add(record);
  return tracker.finish(totalUsd);
}
