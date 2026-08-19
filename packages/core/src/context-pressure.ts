import type { PricingCatalogue } from './pricing.js';
import type { UsageProfileReport } from './usage.js';

/**
 * How close each slice's largest call is to its model's context window.
 *
 * ## The failure this sees coming
 *
 * On a chat or agent workload the input grows with every turn, and a
 * retrieval pipeline grows with every document added to the store. Nothing
 * about that shows in a total, and nothing about it hurts — until one call
 * crosses the model's context window and the API refuses it outright. The
 * bill looks fine right up to the day the product breaks.
 *
 * The distance to that ceiling is knowable from what the log already
 * carries: `maxCallInputTokens` per label-and-model slice, against the
 * catalogue's `contextWindow` for that model. This reports the ratio, for
 * slices past a threshold, so the reader hears "your largest call is at 87%
 * of the window" while the fix is still an afternoon rather than an
 * incident.
 *
 * ## What it refuses
 *
 * **No prediction.** It does not say *when* the ceiling will be crossed —
 * that would extrapolate growth this module has not measured, and a straight
 * line through two points is a guess wearing arithmetic's clothes. The share
 * is a fact; the trajectory is the reader's to know.
 *
 * **The maximum, not a percentile.** One call over the window is one failed
 * call, and an average hides exactly the call that matters. This is the same
 * reasoning `reprice.ts` uses for the same field.
 *
 * **Unpriced models are absent, and that is stated by the caller.** A model
 * the catalogue does not know has no window to compare against; inventing
 * one would turn a missing fact into a false comfort.
 */

/** One slice measured against its model's ceiling. */
export interface ContextPressure {
  label: string;
  model: string;
  modelName: string;
  /** The slice's largest single call: input, cache reads and writes. */
  maxCallInputTokens: number;
  /** The model's context window, from the catalogue. */
  contextWindow: number;
  /** `maxCallInputTokens / contextWindow`. 1.0 is a call that just fit. */
  share: number;
  /** Calls in the slice, so a one-off spike reads differently from a fleet. */
  calls: number;
}

export interface ContextPressureOptions {
  /**
   * Slices below this share of the window are not reported. Half by
   * default: below it the ceiling is not the next problem this bill has,
   * and a section listing every slice would bury the one that matters.
   */
  minShare?: number;
}

/** Slices whose largest call is within sight of the window, closest first. */
export function contextPressure(
  report: UsageProfileReport,
  catalogue: PricingCatalogue,
  options: ContextPressureOptions = {},
): ContextPressure[] {
  const { minShare = 0.5 } = options;
  const out: ContextPressure[] = [];

  for (const slice of report.byLabelAndModel) {
    const model = catalogue.byId.get(slice.model);
    if (!model) continue;
    if (model.contextWindow <= 0) continue;
    const share = slice.breakdown.maxCallInputTokens / model.contextWindow;
    if (share < minShare) continue;
    out.push({
      label: slice.label,
      model: slice.model,
      modelName: model.displayName,
      maxCallInputTokens: slice.breakdown.maxCallInputTokens,
      contextWindow: model.contextWindow,
      share,
      calls: slice.breakdown.calls,
    });
  }

  return out.sort((a, b) => b.share - a.share);
}
