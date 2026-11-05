import type { PromptSize } from './pricing.js';
import type { ModelPricing } from './types.js';
import type { UsageRecord } from './usage.js';

/*
 * When and on what prompt a usage record was billed.
 *
 * Its own module, not a pair of functions in `usage.ts`, because the trackers
 * `usage.ts` drives (truncation, repeats, conversation growth, session cost)
 * price records too, and every one of them has to price a record the way the
 * total does: a finding that costs a call at another moment, or on another
 * band, than the bill it sits under is a finding that disagrees with it.
 */

/**
 * The instant a record was billed at: its own clock, or `on` when it has none.
 *
 * Every figure priced from a record goes through this, so the bill and every
 * finding drawn from the same calls price them at the same moment. The total
 * learned it in 2.4.3; the findings priced at the report's date until the
 * next change, so a DeepSeek retry wasted at peak was costed off-peak.
 */
export function billedAt(record: UsageRecord, on: Date): Date {
  return record.ts !== null ? new Date(record.ts) : on;
}

/**
 * What a record says about the size of the prompt it was billed on.
 *
 * A call carries its own: every input token, cache reads and writes included,
 * which is what a model priced by prompt length counts. A row that sums
 * requests says only that no request in it was larger than the whole row.
 */
export function promptSizeOf(record: UsageRecord): PromptSize {
  const prompt =
    record.inputTokens + record.cacheReadTokens + record.cacheWrite5mTokens + record.cacheWrite1hTokens;
  const how = {
    ...(record.speed === undefined ? {} : { speed: record.speed }),
    ...(record.serviceTier === undefined ? {} : { serviceTier: record.serviceTier }),
    ...(record.inferenceGeo === undefined ? {} : { inferenceGeo: record.inferenceGeo }),
    ...(record.batch === true ? { batch: true } : {}),
  };
  return record.requests === undefined ? { inputTokens: prompt, ...how } : { inputTokensAtMost: prompt, ...how };
}

/**
 * What a record's web searches cost: per search, at the row's fee, flat.
 *
 * Here beside `billedAt` and `promptSizeOf` for the same reason they are: the
 * total and every tracker under it price a call, and a finding that costs a
 * call without its searches disagrees with the bill it sits under. Zero for a
 * row with no fee, whose searches the total names as unpriced instead.
 */
export function webSearchUsdOf(record: UsageRecord, model: ModelPricing): number {
  const searches = record.webSearchRequests ?? 0;
  if (searches <= 0 || model.webSearchPerThousandUsd === undefined) return 0;
  return (searches / 1_000) * model.webSearchPerThousandUsd;
}
