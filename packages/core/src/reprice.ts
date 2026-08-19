import { effectivePricing, multipliersFor } from './pricing.js';
import type { PricingCatalogue } from './pricing.js';
import type { ModelPricing } from './types.js';
import type { UsageBreakdown, UsageProfileReport } from './usage.js';

/**
 * The same tokens at another model's rates.
 *
 * ## Why this is allowed to exist
 *
 * `usage.ts` refuses to report a saving, and the reason is that a saving
 * requires imagining a prompt nobody wrote. This does not. Every token here
 * was actually billed; the only thing being changed is the rate card it is
 * multiplied by, which is the same move `cacheEconomics` makes and is
 * arithmetic rather than a guess.
 *
 * What it answers is the question a bill provokes and a total cannot settle:
 * `classify` spent $4,000 on a frontier model — what would those exact calls
 * have cost on the small one? That is a number, and it is the number a routing
 * decision is argued over.
 *
 * ## The four things it refuses
 *
 * **It says nothing about whether the answers would be as good.** This is
 * multiplication. Whether the cheap model can do the work is a question about
 * the work, and Trazum has never seen the prompts — by design, there is nowhere
 * in a usage record to put one. Every rendering states this next to the figure,
 * because a dollar number with no caveat attached reads as a recommendation.
 *
 * **It refuses to price traffic that would not fit.** A cheaper model with a
 * smaller context window does not make a 400k-token call cheaper; it makes it
 * impossible. Slices holding a call larger than the target's window are pulled
 * out into `overContext` and their money is excluded from every total here —
 * counting an impossible call's price difference as a saving is exactly the
 * flattering direction this repository refuses. `maxCallInputTokens` is the
 * maximum rather than an average for the same reason: one call over the ceiling
 * is a failed call, and a mean hides it.
 *
 * **It excludes what is already there.** Calls billed on the target model
 * reprice to themselves, and folding them in would pad both totals with money
 * that cannot move — a $10,000 bill of which $9,900 is already on the cheap
 * model would report a 1% difference and read as "not worth doing". They are
 * counted in `alreadyOnTarget` instead, so the reader sees the shape.
 *
 * **It assumes the token counts survive the move, and says so.** A different
 * model tokenizes differently, and one that is worse at the task may answer at
 * greater length or be retried. The counts are the ones that were billed, not a
 * prediction; that makes this an exact restatement of the past at another price
 * and an approximation of the future. Stated, not hidden — `sameTokensAssumed`
 * exists so no rendering can forget to say it.
 *
 * ## Why the write TTLs are kept apart
 *
 * A cache write costs 1.25x input at five minutes and 2x at an hour, and that
 * ratio is not a constant across providers. Repricing a combined write total
 * would mean picking one of the two rates for tokens that were billed at both,
 * so `UsageBreakdown` carries the split and this reads it. Writes whose TTL the
 * log never stated are in the 5-minute bucket, the same assumption
 * `cacheWriteUsdIfAssumed1h` prices — `assumedWriteTtlCalls` is carried through
 * so a reader knows the comparison inherits it.
 */

/** One label-and-model slice, as billed and as it would have been billed. */
export interface RepricedSlice {
  label: string;
  /** The model these calls were actually billed on. */
  model: string;
  calls: number;
  /** What the log says this slice cost. */
  currentUsd: number;
  /** What the same tokens cost at the target's rates. */
  targetUsd: number;
  /** `targetUsd - currentUsd`. Negative is cheaper on the target. */
  deltaUsd: number;
  /** The slice's largest single call, cache reads and writes included. */
  maxCallInputTokens: number;
  /**
   * Present when the slice's cache traffic could not exist on the target.
   *
   * A cache entry only forms above the model's minimum prompt size, and when
   * even this slice's largest call sits under the target's minimum, none of
   * its calls could create one — so `targetUsd`, which grants the cache
   * traffic the target's discounted rates, is priced on entries the target
   * would refuse to create. That error flatters the move, which is exactly
   * the direction this repository refuses. `noCacheUsd` is the same tokens
   * with every cache token at the full input rate: the figure the target
   * would actually bill if the entries cannot form. The truth sits at
   * `noCacheUsd` (no entries) — not between the two by interpolation.
   *
   * Null when the slice has no cache traffic, or when its calls clear the
   * target's minimum — where the standard figure stands unqualified.
   */
  cacheBeyondTarget: { minTokens: number; noCacheUsd: number } | null;
}

/** A slice holding a call the target model could not have accepted. */
export interface OverContextSlice {
  label: string;
  model: string;
  calls: number;
  currentUsd: number;
  /** The call that does not fit, in tokens. */
  maxCallInputTokens: number;
}

export interface RepriceReport {
  target: {
    id: string;
    displayName: string;
    /** The ceiling `overContext` was judged against. */
    contextWindow: number;
  };
  /**
   * Slices that could move, largest saving first. Ties break on the larger
   * bill, so the row somebody would act on comes first.
   */
  slices: RepricedSlice[];
  /** Totals over `slices` only — the money that would actually change hands. */
  currentUsd: number;
  targetUsd: number;
  deltaUsd: number;
  /**
   * Slices excluded because at least one of their calls is larger than the
   * target's context window. Their money is in none of the totals above.
   */
  overContext: OverContextSlice[];
  /** Calls already billed on the target, and what they cost. Not repriced. */
  alreadyOnTarget: { calls: number; usd: number };
  /**
   * Repriced calls whose write TTL the log did not state. Non-zero means both
   * sides of the comparison rest on the cheaper assumption.
   */
  assumedWriteTtlCalls: number;
  /**
   * Models in the log the catalogue could not price, and how many calls they
   * made. Their tokens could be priced on the target, but the difference
   * cannot be — there is no current figure to subtract from. Named rather
   * than dropped, so a comparison covering half a bill cannot look complete.
   */
  unpricedModels: string[];
  unpricedCalls: number;
  /** Always true. A field, not a comment, so a rendering can print it. */
  sameTokensAssumed: true;
}

/**
 * What a set of token counts costs on one model, at the rates in force on a
 * date.
 *
 * The same arithmetic `profileUsage` does per call, over an aggregate — which
 * is only sound because every token class is priced independently of the
 * others and of how many calls produced them.
 */
export function priceTokensOn(
  breakdown: Pick<
    UsageBreakdown,
    'inputTokens' | 'cacheReadTokens' | 'cacheWrite5mTokens' | 'cacheWrite1hTokens' | 'outputTokens'
  >,
  model: ModelPricing,
  on: Date = new Date(),
): number {
  const { inputPerMTok, outputPerMTok } = effectivePricing(model, on);
  const rates = multipliersFor(model);
  const per = (tokens: number, rate: number): number => (tokens / 1_000_000) * rate;
  return (
    per(breakdown.inputTokens, inputPerMTok) +
    per(breakdown.cacheReadTokens, inputPerMTok * rates.cacheRead) +
    per(breakdown.cacheWrite5mTokens, inputPerMTok * rates.cacheWrite5m) +
    per(breakdown.cacheWrite1hTokens, inputPerMTok * rates.cacheWrite1h) +
    per(breakdown.outputTokens, outputPerMTok)
  );
}

/**
 * Reprices a profile's label-and-model slices onto one target model.
 *
 * Returns `null` when the catalogue does not know the target: a comparison
 * against a price nobody has is worse than no comparison, and the caller is
 * better placed to say so in its own words than this is to invent a zero.
 */
export function repriceProfile(
  report: UsageProfileReport,
  targetId: string,
  catalogue: PricingCatalogue,
  on: Date = new Date(),
): RepriceReport | null {
  const target = catalogue.byId.get(targetId);
  if (!target) return null;

  const slices: RepricedSlice[] = [];
  const overContext: OverContextSlice[] = [];
  const alreadyOnTarget = { calls: 0, usd: 0 };
  let assumedWriteTtlCalls = 0;

  for (const slice of report.byLabelAndModel) {
    const { breakdown } = slice;
    if (slice.model === target.id) {
      alreadyOnTarget.calls += breakdown.calls;
      alreadyOnTarget.usd += breakdown.totalUsd;
      continue;
    }
    if (breakdown.maxCallInputTokens > target.contextWindow) {
      overContext.push({
        label: slice.label,
        model: slice.model,
        calls: breakdown.calls,
        currentUsd: breakdown.totalUsd,
        maxCallInputTokens: breakdown.maxCallInputTokens,
      });
      continue;
    }
    const targetUsd = priceTokensOn(breakdown, target, on);
    assumedWriteTtlCalls += breakdown.assumedWriteTtlCalls;
    /**
     * Cache traffic the target could not grant. The comparison is against the
     * slice's *largest* call: if even that one sits under the target's cache
     * minimum, no call in the slice could create an entry, and that is a fact
     * rather than a guess. A slice whose largest call clears the minimum may
     * still hold smaller calls that do not — undecidable per call from an
     * aggregate, so nothing is claimed there.
     */
    const cacheTokens =
      breakdown.cacheReadTokens + breakdown.cacheWrite5mTokens + breakdown.cacheWrite1hTokens;
    // A null minimum is an *unknown* one — overlay-added models leave it null
    // rather than invent a number — and nothing can be claimed against a
    // threshold nobody stated. Unqualified is the only honest rendering there.
    const cacheBeyondTarget =
      cacheTokens > 0 &&
      target.cacheMinTokens !== null &&
      breakdown.maxCallInputTokens < target.cacheMinTokens
        ? {
            minTokens: target.cacheMinTokens,
            noCacheUsd: priceTokensOn(
              {
                inputTokens: breakdown.inputTokens + cacheTokens,
                cacheReadTokens: 0,
                cacheWrite5mTokens: 0,
                cacheWrite1hTokens: 0,
                outputTokens: breakdown.outputTokens,
              },
              target,
              on,
            ),
          }
        : null;
    slices.push({
      label: slice.label,
      model: slice.model,
      calls: breakdown.calls,
      currentUsd: breakdown.totalUsd,
      targetUsd,
      deltaUsd: targetUsd - breakdown.totalUsd,
      maxCallInputTokens: breakdown.maxCallInputTokens,
      cacheBeyondTarget,
    });
  }

  slices.sort((a, b) => a.deltaUsd - b.deltaUsd || b.currentUsd - a.currentUsd);
  overContext.sort((a, b) => b.currentUsd - a.currentUsd);

  const currentUsd = slices.reduce((sum, s) => sum + s.currentUsd, 0);
  const targetUsd = slices.reduce((sum, s) => sum + s.targetUsd, 0);

  return {
    target: { id: target.id, displayName: target.displayName, contextWindow: target.contextWindow },
    slices,
    currentUsd,
    targetUsd,
    deltaUsd: targetUsd - currentUsd,
    overContext,
    alreadyOnTarget,
    assumedWriteTtlCalls,
    unpricedModels: report.unpricedModels,
    unpricedCalls: report.unpriced.calls,
    sameTokensAssumed: true,
  };
}
