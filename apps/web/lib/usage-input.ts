import { listModels } from '@trazum/core';
import type { UsageProfile } from '@trazum/core';

import { flag, number, object, oneOf, optional } from './schema';

/**
 * The `usage` object a request carries, checked at the door.
 *
 * `/api/optimize` and `/api/compare` used to read it as given and refuse only
 * an unknown model. So `callsPerMonth: -500` priced a negative monthly bill,
 * `cacheHitRate: 7` priced a cache that hit seven times per call, and
 * `callsPerMonth: "lots"` reached the arithmetic as a string. Each came back
 * `200` with figures that looked like an answer. A misspelt field such as
 * `calls_per_month` was dropped and its default used, which is the same
 * failure the routes already refuse for `disableRules`.
 *
 * One schema, so both routes refuse the same things in the same words, and the
 * message names the field and the range rather than saying "invalid". It was
 * the first body checked this way; `lib/body-schemas.ts` is every other one.
 */

export type UsageField = keyof UsageProfile;

export const USAGE_FIELDS: readonly UsageField[] = [
  'model',
  'callsPerMonth',
  'avgOutputTokens',
  'cacheHitRate',
  'batchEligible',
];

/** What each field must be, as a kind the message catalogue words. */
export type UsageExpectation = 'text' | 'count' | 'tokens' | 'rate' | 'boolean';

export const USAGE_EXPECTED: Readonly<Record<UsageField, UsageExpectation>> = {
  model: 'text',
  callsPerMonth: 'count',
  avgOutputTokens: 'tokens',
  cacheHitRate: 'rate',
  batchEligible: 'boolean',
};

/** Upper bounds that no real workload reaches and arithmetic still handles. */
export const USAGE_LIMITS = { callsPerMonth: 1_000_000_000_000, avgOutputTokens: 10_000_000 } as const;

/** Every model this deployment prices: a model it does not is refused, not priced as zero. */
export const MODEL_IDS: readonly string[] = listModels().map((model) => model.id);

/**
 * A fraction is allowed in a count: a monthly volume is often an average, and
 * the page's own input passes what the reader typed. A negative is not.
 */
export const USAGE = object({
  model: optional(oneOf(MODEL_IDS)),
  callsPerMonth: optional(number({ min: 0, max: USAGE_LIMITS.callsPerMonth })),
  avgOutputTokens: optional(number({ min: 0, max: USAGE_LIMITS.avgOutputTokens })),
  cacheHitRate: optional(number({ min: 0, max: 1 })),
  batchEligible: optional(flag()),
});

