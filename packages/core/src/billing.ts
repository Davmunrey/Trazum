import type { PromptSize } from './pricing.js';
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
  return record.requests === undefined ? { inputTokens: prompt } : { inputTokensAtMost: prompt };
}
