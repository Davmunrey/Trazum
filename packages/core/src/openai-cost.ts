/**
 * What OpenAI billed, read from its own cost report.
 *
 * The second provider `reconcile` can set a receipt beside, and the same
 * rule holds: the billed figure and the computed one are never added, and
 * neither corrects the other. `anthropic-cost.ts` makes that argument once;
 * this file adds only what is different about this report.
 *
 * ## The unit, which is *not* the trap here
 *
 * Anthropic's `amount` is a decimal string in cents. OpenAI's is an object,
 * `{"value": 0.06, "currency": "usd"}`, and the schema's own example is a
 * day's bucket at six cents: `value` is **a number in the currency's major
 * unit**, dollars for USD. Nothing is divided here, and a test asserts that
 * against the published example so the cents rule from the other converter
 * cannot leak across by habit. The currency is documented as lowercase
 * ISO-4217; it is compared case-insensitively and anything but USD is
 * refused rather than converted, for the reason the other file gives.
 *
 * ## What the decomposition is for, and how little of it this report allows
 *
 * With `group_by[]=line_item` each row names what it charged for, in words
 * this schema does not enumerate: *"gpt-6-astra, input_tokens"* is the
 * example. What it does enumerate is `quantity_unit`, and that is the
 * honest hook: a row measured in `tokens` or `1000_tokens` is a token
 * charge, a row measured in `duration_seconds`, `images`, `characters` or
 * `gibibyte_hours` is money no token rate ever covered. The first is the
 * remainder's business; the second is named and set aside.
 *
 * A row with a line item but a `null` unit is neither, and the schema says
 * `null` means *no single supported unit applies*. It is not guessed either
 * way: its money is counted under its own name so the reader knows how much
 * of the remainder is standing on a unit nobody stated.
 *
 * **Batch is not separable.** Nothing in this schema says whether a line
 * item was a batch job, so unlike the Anthropic reading no batch figure can
 * be taken out of the difference. `batchSeparable: false` says so, and the
 * command repeats it: a batch discount, if any, is inside the remainder.
 */

import type { BilledReading } from './anthropic-cost.js';

export interface OpenaiCostReading extends BilledReading {
  /** Billed on a line item whose unit is `null`: neither tokens nor not. */
  unknownUnitUsd: number;
  buckets: number;
  rows: number;
  /** Rows whose `amount.value` was not a number. Counted, never read as zero. */
  unreadableAmount: number;
  /** `has_more`: one page of several, so the billed figure is understated. */
  truncated: boolean;
  /** The input was not the JSON this endpoint returns. */
  unparseable: boolean;
}

const asObject = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const TOKEN_UNITS = new Set(['tokens', '1000_tokens']);

/** Read a cost report. Pure, and takes the answer rather than the key. */
export function openaiCostReport(text: string): OpenaiCostReading {
  const empty: OpenaiCostReading = {
    usd: 0,
    notTokensUsd: 0,
    batchUsd: 0,
    batchSeparable: false,
    unknownUnitUsd: 0,
    described: false,
    window: null,
    buckets: 0,
    rows: 0,
    otherCurrencies: [],
    unreadableAmount: 0,
    truncated: false,
    unparseable: false,
  };

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ...empty, unparseable: true };
  }
  const report = asObject(parsed);
  if (report === null || !Array.isArray(report.data)) return { ...empty, unparseable: true };

  let usd = 0;
  let notTokensUsd = 0;
  let unknownUnitUsd = 0;
  let described = false;
  let buckets = 0;
  let rows = 0;
  let unreadableAmount = 0;
  let fromMs: number | null = null;
  let toMs: number | null = null;
  const otherCurrencies = new Set<string>();

  for (const entry of report.data) {
    const bucket = asObject(entry);
    if (bucket === null || typeof bucket.start_time !== 'number' || !Number.isFinite(bucket.start_time)) {
      continue;
    }
    buckets += 1;
    const from = bucket.start_time * 1000;
    fromMs = fromMs === null ? from : Math.min(fromMs, from);
    if (typeof bucket.end_time === 'number' && Number.isFinite(bucket.end_time)) {
      const to = bucket.end_time * 1000;
      toMs = toMs === null ? to : Math.max(toMs, to);
    }

    if (!Array.isArray(bucket.results)) continue;
    for (const found of bucket.results) {
      const result = asObject(found);
      if (result === null) continue;
      rows += 1;

      const amount = asObject(result.amount);
      const currency = typeof amount?.currency === 'string' ? amount.currency.toLowerCase() : 'usd';
      if (currency !== 'usd') otherCurrencies.add(amount?.currency as string);

      const value = amount?.value;
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        unreadableAmount += 1;
        continue;
      }
      usd += value;

      if (typeof result.line_item === 'string') {
        described = true;
        const unit = result.quantity_unit;
        if (typeof unit === 'string') {
          if (!TOKEN_UNITS.has(unit)) notTokensUsd += value;
        } else {
          unknownUnitUsd += value;
        }
      }
    }
  }

  return {
    usd,
    notTokensUsd,
    batchUsd: 0,
    batchSeparable: false,
    unknownUnitUsd,
    described,
    window: fromMs === null || toMs === null ? null : { fromMs, toMs },
    buckets,
    rows,
    otherCurrencies: [...otherCurrencies],
    unreadableAmount,
    truncated: report.has_more === true,
    unparseable: false,
  };
}

/**
 * Whether this text is an OpenAI cost report rather than Anthropic's or
 * some other JSON. The result object names its own type; failing that, an
 * `amount` beside a numeric `start_time` is this shape and not the other
 * provider's, whose buckets say `starting_at`.
 */
export function looksLikeOpenaiCost(text: string, prefixBytes = 8192): boolean {
  const head = text.slice(0, prefixBytes);
  if (head.includes('"organization.costs.result"')) return true;
  return head.includes('"amount"') && head.includes('"start_time"') && !head.includes('"starting_at"');
}
