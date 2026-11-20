import { BUNDLED_CATALOGUE } from './pricing.js';
import type { PricingCatalogue } from './pricing.js';
import type { PricingOverlay } from './pricing-overlay.js';
import type { ModelPricing } from './types.js';

/**
 * Claude Code's `modelPricing` managed setting, read as a pricing overlay (#856).
 *
 * Since v2.1.242 an organisation can give Claude Code its contracted rates, so
 * the dollar figures in `/usage`, the status line and OpenTelemetry match its
 * bill: an optional `multiplier` that scales every cost, and an optional
 * `overrides` map of model id to four USD-per-million rates. Trazum priced the
 * same sessions at list price, so the organisation saw two figures for one piece
 * of work, and Trazum's was the one that did not match the invoice.
 *
 * The shape and the rules are the settings reference's, read 2026-11-20
 * (code.claude.com/docs/en/settings-reference#modelpricing):
 *
 * - `multiplier` is a number above 0 and at most 10. It scales every cost Claude
 *   Code computes, a row included.
 * - A row needs all four of `input`, `output`, `cacheRead` and `cacheWrite`, each
 *   0 to 10000. `cacheWrite` covers the five-minute and the one-hour write.
 * - A row's rates are used as written: no fast-mode surcharge and no US-only
 *   rate on top.
 * - A row Claude Code cannot parse is dropped and the rest kept.
 * - A row keyed by a built-in model's id applies to its snapshots and
 *   provider-specific ids; any other key applies to that one id.
 *
 * **What this does not do.** The table has no batch rate and no fast-mode rate,
 * so neither is invented: batch keeps the catalogue's ratio to the new input, a
 * published fast-mode rate stays as published, and both are named per model.
 * A key the catalogue cannot place is named and priced nowhere, because which
 * model a Bedrock or gateway id means is the operator's to say. A rate of zero is
 * refused: Trazum prices nothing at zero, and a row it cannot apply is named.
 */

export const MAX_MULTIPLIER = 10;
export const MAX_RATE = 10_000;
type RateKey = 'input' | 'output' | 'cacheRead' | 'cacheWrite';
type Row = Record<RateKey, number>;

/** Why a row in the table does not reach the overlay. */
export interface SkippedRow {
  key: string;
  reason: 'invalid' | 'zero' | 'unknown-model' | 'duplicate';
  /** For `invalid`, what was wrong; for `duplicate`, the key whose row was used. */
  detail?: string;
}

export interface ClaudeModelPricingResult {
  overlay: PricingOverlay;
  /** The multiplier, when the table sets a usable one. */
  multiplier?: number;
  /** Models priced from a row of the table, by catalogue id. */
  fromRows: string[];
  /** Claude models with no row, priced at list times the multiplier. */
  fromMultiplier: string[];
  skipped: SkippedRow[];
  /** Models whose published fast-mode rate this overlay leaves as published. */
  fastKept: string[];
  /** Models whose batch price is the catalogue's batch ratio applied to the new input. */
  batchFromRatio: string[];
  /** Models whose US-only rate is dropped, as Claude Code drops it on a row. */
  usOnlyDropped: string[];
}

export class ClaudeModelPricingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClaudeModelPricingError';
  }
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Twelve significant figures: 3 x 0.85 is 2.55, not 2.5500000000000003. */
const tidy = (value: number): number => Number(value.toPrecision(12));

/** The `modelPricing` object, from a whole settings file or from the object itself. */
function tableOf(document: unknown): Record<string, unknown> {
  if (!isPlainObject(document)) throw new ClaudeModelPricingError('the file is not a JSON object');
  if ('modelPricing' in document) {
    if (!isPlainObject(document.modelPricing)) throw new ClaudeModelPricingError('"modelPricing" is not an object');
    return document.modelPricing;
  }
  const keys = Object.keys(document);
  if (keys.length > 0 && keys.every((key) => key === 'multiplier' || key === 'overrides')) return document;
  throw new ClaudeModelPricingError('no "modelPricing" in the file');
}

/**
 * One rate of a row as Claude Code reads it, or why it would drop the row.
 * Named fields rather than a loop over keys, so nothing indexes an object by a
 * computed name.
 */
function rate(value: unknown, name: RateKey): number | string {
  if (value === undefined) return `no "${name}"`;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > MAX_RATE) {
    return `"${name}" is not a number from 0 to ${MAX_RATE}`;
  }
  return value;
}

/** A row as Claude Code reads it, or why Claude Code would drop it. */
function readRow(raw: unknown): { row: Row } | { invalid: string } {
  if (!isPlainObject(raw)) return { invalid: 'not an object' };
  const input = rate(raw.input, 'input');
  const output = rate(raw.output, 'output');
  const cacheRead = rate(raw.cacheRead, 'cacheRead');
  const cacheWrite = rate(raw.cacheWrite, 'cacheWrite');
  for (const read of [input, output, cacheRead, cacheWrite]) {
    if (typeof read === 'string') return { invalid: read };
  }
  return { row: { input, output, cacheRead, cacheWrite } as Row };
}

/** Whether any of a row's rates is zero, which Trazum never prices at. */
const hasZero = (row: Row): boolean =>
  row.input === 0 || row.output === 0 || row.cacheRead === 0 || row.cacheWrite === 0;

/**
 * The overlay a `modelPricing` table makes of a catalogue.
 *
 * `reviewed` is the date somebody last checked the table against the contract.
 * It is required: an overlay whose age is unknown is worse than the bundled
 * catalogue, whose age is printed on every report.
 */
export function overlayFromClaudeModelPricing(
  document: unknown,
  options: { reviewed: string; source?: string; catalogue?: PricingCatalogue },
): ClaudeModelPricingResult {
  if (!ISO_DATE.test(options.reviewed) || Number.isNaN(Date.parse(`${options.reviewed}T00:00:00Z`))) {
    throw new ClaudeModelPricingError(`"${options.reviewed}" is not a date as YYYY-MM-DD`);
  }
  const catalogue = options.catalogue ?? BUNDLED_CATALOGUE;
  const source = options.source ?? "Claude Code's modelPricing";
  const table = tableOf(document);

  const skipped: SkippedRow[] = [];
  let multiplier: number | undefined;
  if (table.multiplier !== undefined) {
    const m = table.multiplier;
    if (typeof m !== 'number' || !Number.isFinite(m) || m <= 0 || m > MAX_MULTIPLIER) {
      // Claude Code drops a multiplier it cannot parse and keeps the rest.
      skipped.push({ key: 'multiplier', reason: 'invalid', detail: `not a number above 0 and at most ${MAX_MULTIPLIER}` });
    } else {
      multiplier = m;
    }
  }
  const scale = multiplier ?? 1;

  if (table.overrides !== undefined && !isPlainObject(table.overrides)) {
    throw new ClaudeModelPricingError('"overrides" is not an object');
  }
  const overrides = (table.overrides ?? {}) as Record<string, unknown>;

  // Each usable row, by the catalogue model it lands on. A model's own id wins
  // over an alias of it, as Claude Code's exact match wins over the family row.
  const rows = new Map<string, { key: string; row: Row }>();
  for (const [key, raw] of Object.entries(overrides)) {
    const read = readRow(raw);
    if ('invalid' in read) {
      skipped.push({ key, reason: 'invalid', detail: read.invalid });
      continue;
    }
    if (hasZero(read.row)) {
      skipped.push({ key, reason: 'zero' });
      continue;
    }
    const model = catalogue.byId.get(key);
    if (model === undefined) {
      skipped.push({ key, reason: 'unknown-model' });
      continue;
    }
    const held = rows.get(model.id);
    if (held === undefined) {
      rows.set(model.id, { key, row: read.row });
    } else if (key === model.id) {
      skipped.push({ key: held.key, reason: 'duplicate', detail: key });
      rows.set(model.id, { key, row: read.row });
    } else {
      skipped.push({ key, reason: 'duplicate', detail: held.key });
    }
  }

  const note = `Contracted rates from ${source}, reviewed ${options.reviewed}.`;
  const withNote = (model: ModelPricing): string => (model.notes ? `${model.notes} ${note}` : note);
  const models: PricingOverlay['models'] = {};
  const fromRows: string[] = [];
  const fromMultiplier: string[] = [];
  const fastKept: string[] = [];
  const batchFromRatio: string[] = [];
  const usOnlyDropped: string[] = [];
  const hasFast = (model: ModelPricing): boolean => (model.tiers ?? []).some((tier) => tier.when.kind === 'speed');

  for (const model of catalogue.models) {
    const own = rows.get(model.id);
    if (own !== undefined) {
      const { row } = own;
      const base = model.multipliers ?? {};
      models[model.id] = {
        inputPerMTok: tidy(row.input * scale),
        outputPerMTok: tidy(row.output * scale),
        // Ratios of the row's own input: the multiplier scales both sides, so
        // it does not enter them.
        multipliers: {
          ...base,
          cacheRead: tidy(row.cacheRead / row.input),
          cacheWrite5m: tidy(row.cacheWrite / row.input),
          cacheWrite1h: tidy(row.cacheWrite / row.input),
        },
        // A row is used as written, with no US-only rate on top.
        ...(model.inferenceGeoMultipliers?.us !== undefined ? { inferenceGeoMultipliers: { us: 1 } } : {}),
        notes: withNote(model),
      };
      fromRows.push(model.id);
      if (model.inferenceGeoMultipliers?.us !== undefined) usOnlyDropped.push(model.id);
    } else if (multiplier !== undefined && model.provider === 'anthropic') {
      models[model.id] = {
        inputPerMTok: tidy(model.inputPerMTok * scale),
        outputPerMTok: tidy(model.outputPerMTok * scale),
        notes: withNote(model),
      };
      fromMultiplier.push(model.id);
    } else {
      continue;
    }
    if (hasFast(model)) fastKept.push(model.id);
    if (model.multipliers?.batch !== null) batchFromRatio.push(model.id);
  }

  return {
    overlay: { lastReviewed: options.reviewed, models },
    ...(multiplier !== undefined ? { multiplier } : {}),
    fromRows,
    fromMultiplier,
    skipped,
    fastKept,
    batchFromRatio,
    usOnlyDropped,
  };
}
