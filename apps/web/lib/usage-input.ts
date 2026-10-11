import type { UsageProfile } from '@trazum/core';

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
 * One parser, so both routes refuse the same things in the same words, and the
 * message names the field and the range rather than saying "invalid".
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

const EXPECTED: Readonly<Record<UsageField, UsageExpectation>> = {
  model: 'text',
  callsPerMonth: 'count',
  avgOutputTokens: 'tokens',
  cacheHitRate: 'rate',
  batchEligible: 'boolean',
};

/** Upper bounds that no real workload reaches and arithmetic still handles. */
export const USAGE_LIMITS = { callsPerMonth: 1_000_000_000_000, avgOutputTokens: 10_000_000 } as const;

export type UsageParse =
  | { ok: true; usage: Partial<UsageProfile> }
  | { ok: false; kind: 'notAnObject' }
  | { ok: false; kind: 'unknownField'; field: string }
  | { ok: false; kind: 'badField'; field: UsageField; expected: UsageExpectation };

function fits(field: UsageField, value: unknown): boolean {
  switch (EXPECTED[field]) {
    case 'text':
      return typeof value === 'string';
    case 'boolean':
      return typeof value === 'boolean';
    case 'rate':
      return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
    case 'count':
      /* A fraction is allowed: a monthly volume is often an average, and the
         page's own input passes what the reader typed. A negative is not. */
      return (
        typeof value === 'number'
        && Number.isFinite(value)
        && value >= 0
        && value <= USAGE_LIMITS.callsPerMonth
      );
    case 'tokens':
      return (
        typeof value === 'number'
        && Number.isFinite(value)
        && value >= 0
        && value <= USAGE_LIMITS.avgOutputTokens
      );
  }
}

/** `undefined` and `null` are an absent object; anything else is checked field by field. */
export function parseUsage(input: unknown): UsageParse {
  if (input === undefined || input === null) return { ok: true, usage: {} };
  if (typeof input !== 'object' || Array.isArray(input)) return { ok: false, kind: 'notAnObject' };
  const usage: Partial<UsageProfile> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!(USAGE_FIELDS as readonly string[]).includes(key)) return { ok: false, kind: 'unknownField', field: key };
    const field = key as UsageField;
    // An explicit null is the field left out, as JSON writers often send it.
    if (value === null) continue;
    if (!fits(field, value)) return { ok: false, kind: 'badField', field, expected: EXPECTED[field] };
    (usage as Record<string, unknown>)[field] = value;
  }
  return { ok: true, usage };
}
