import { indexModels, BUNDLED_CATALOGUE } from './pricing.js';
import { nearestName } from './nearest.js';
import type { PricingCatalogue } from './pricing.js';
import type { Capability, CachingMode, CostMultipliers, ModelPricing } from './types.js';

/**
 * Local price corrections, so a price change does not require a library upgrade.
 *
 * This is the honest answer to "pricing data separated from the release cycle".
 * A separate `@trazum/pricing` package would not have achieved it — you would
 * still need to install something to get current numbers. A JSON file in your own
 * repository does, and it keeps the two properties that matter: **the core still
 * makes no network call**, and it still has no dependencies.
 *
 * The bundled catalogue remains the default, so Trazum is correct out of the box
 * and an overlay is only needed once a published price moves.
 *
 * Validation is as strict as the config parser's, for the same reason: a typo'd
 * model id in an overlay would silently price against the bundled number, and a
 * budget decision made on a price nobody applied is the failure this whole file
 * exists to prevent.
 */

export const PRICING_OVERLAY_KEYS = ['lastReviewed', 'models'] as const;

export const PRICING_MODEL_KEYS = [
  'displayName',
  'inputPerMTok',
  'outputPerMTok',
  'contextWindow',
  'cacheMinTokens',
  'tier',
  'capability',
  'caching',
  'notes',
  'promo',
  'multipliers',
] as const;

const PROMO_KEYS = ['inputPerMTok', 'outputPerMTok', 'until'] as const;

/**
 * Cache and batch rates, which an overlay had no way to state — and had to.
 *
 * Without this, a model added through `--pricing` silently inherited Anthropic's
 * multipliers: a cache write at 1.25x input, or 2x at the long TTL. Most
 * providers charge plain input for a write, so `trazum profile` computed a
 * premium that model never charged, accused the workload of a caching loss it
 * could not have, and told the reader to turn caching off. Three documents
 * claimed that could not happen to a provider whose writes cost what input costs,
 * and for an overlay model it was exactly what happened.
 *
 * `batch` accepts `null`, which is not the same as leaving it out: "this provider
 * has no batch API" should stop the advisory offering a discount nobody sells,
 * while "nobody has said" should fall back to the default.
 */
const MULTIPLIER_KEYS = ['cacheRead', 'cacheWrite5m', 'cacheWrite1h', 'batch'] as const;

const TIERS: ModelPricing['tier'][] = ['frontier', 'opus', 'sonnet', 'haiku', 'unknown'];
const CAPABILITIES: Capability[] = ['small', 'mid', 'large', 'frontier', 'unknown'];
const CACHING_MODES: CachingMode[] = ['explicit', 'automatic', 'none', 'unknown'];

/** Largest overlay this will read — a price list, not a dataset. */
export const MAX_PRICING_BYTES = 64 * 1024;

export interface PricingOverlay {
  /**
   * When these prices were checked, as `YYYY-MM-DD`. Required: an overlay whose
   * age is unknown is worse than the bundled catalogue, whose age is printed on
   * every report.
   */
  lastReviewed: string;
  /** Per-model corrections, keyed by model id. */
  models: Record<string, Partial<Omit<ModelPricing, 'id'>>>;
}

export class PricingOverlayError extends Error {
  constructor(
    message: string,
    readonly source: string,
  ) {
    super(`${source}: ${message}`);
    this.name = 'PricingOverlayError';
  }
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function rejectUnknownKeys(
  object: Record<string, unknown>,
  allowed: readonly string[],
  source: string,
  path: string,
): void {
  for (const key of Object.keys(object)) {
    if (allowed.includes(key)) continue;
    const nearest = nearestName(key, allowed);
    throw new PricingOverlayError(
      nearest
        ? `unknown key "${path}${key}" — did you mean "${nearest}"?`
        : `unknown key "${path}${key}". Known keys: ${allowed.join(', ')}`,
      source,
    );
  }
}

function positiveNumber(value: unknown, label: string, source: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new PricingOverlayError(`"${label}" must be a number greater than 0`, source);
  }
  return value;
}

function integerAbove(value: unknown, label: string, source: string): number {
  const n = positiveNumber(value, label, source);
  if (!Number.isInteger(n)) {
    throw new PricingOverlayError(`"${label}" must be a whole number`, source);
  }
  return n;
}

function parsePromo(raw: unknown, label: string, source: string): ModelPricing['promo'] {
  if (!isPlainObject(raw)) {
    throw new PricingOverlayError(`"${label}" must be an object`, source);
  }
  rejectUnknownKeys(raw, PROMO_KEYS, source, `${label}.`);

  for (const key of PROMO_KEYS) {
    if (raw[key] === undefined) {
      throw new PricingOverlayError(
        `"${label}" needs all of ${PROMO_KEYS.join(', ')} — a partial promotion has no meaning`,
        source,
      );
    }
  }
  if (typeof raw.until !== 'string' || !ISO_DATE.test(raw.until)) {
    throw new PricingOverlayError(`"${label}.until" must be a date like 2026-08-31`, source);
  }

  return {
    inputPerMTok: positiveNumber(raw.inputPerMTok, `${label}.inputPerMTok`, source),
    outputPerMTok: positiveNumber(raw.outputPerMTok, `${label}.outputPerMTok`, source),
    until: raw.until,
  };
}

function parseMultipliers(raw: unknown, label: string, source: string): CostMultipliers {
  if (!isPlainObject(raw)) {
    throw new PricingOverlayError(`"${label}" must be an object`, source);
  }
  rejectUnknownKeys(raw, MULTIPLIER_KEYS, source, `${label}.`);
  if (Object.keys(raw).length === 0) {
    throw new PricingOverlayError(
      `"${label}" is empty — remove it, or say which rate it changes`,
      source,
    );
  }

  const multipliers: CostMultipliers = {};
  for (const key of ['cacheRead', 'cacheWrite5m', 'cacheWrite1h'] as const) {
    if (raw[key] === undefined) continue;
    /**
     * Zero is refused along with the negatives. A free cache read is not a price
     * anybody publishes, and admitting one would let an overlay typo turn a real
     * cost into no cost — the flattering direction, and the one this whole file
     * exists to keep out of a report.
     */
    multipliers[key] = positiveNumber(raw[key], `${label}.${key}`, source);
  }
  if (raw.batch !== undefined) {
    multipliers.batch =
      raw.batch === null ? null : positiveNumber(raw.batch, `${label}.batch`, source);
  }
  return multipliers;
}

function parseModel(
  raw: unknown,
  id: string,
  source: string,
): Partial<Omit<ModelPricing, 'id'>> {
  if (!isPlainObject(raw)) {
    throw new PricingOverlayError(`"models.${id}" must be an object`, source);
  }
  rejectUnknownKeys(raw, PRICING_MODEL_KEYS, source, `models.${id}.`);
  if (Object.keys(raw).length === 0) {
    throw new PricingOverlayError(
      `"models.${id}" is empty — remove it, or say what it changes`,
      source,
    );
  }

  const model: Partial<Omit<ModelPricing, 'id'>> = {};

  if (raw.displayName !== undefined) {
    if (typeof raw.displayName !== 'string' || raw.displayName.trim() === '') {
      throw new PricingOverlayError(`"models.${id}.displayName" must be a non-empty string`, source);
    }
    model.displayName = raw.displayName;
  }
  if (raw.inputPerMTok !== undefined) {
    model.inputPerMTok = positiveNumber(raw.inputPerMTok, `models.${id}.inputPerMTok`, source);
  }
  if (raw.outputPerMTok !== undefined) {
    model.outputPerMTok = positiveNumber(raw.outputPerMTok, `models.${id}.outputPerMTok`, source);
  }
  if (raw.contextWindow !== undefined) {
    model.contextWindow = integerAbove(raw.contextWindow, `models.${id}.contextWindow`, source);
  }
  if (raw.cacheMinTokens !== undefined) {
    // `null` is "this catalogue does not know", which is a different statement
    // from any number — including zero, which claims caching from the first
    // token. A live price feed knows what a model costs and nothing about how
    // it caches, so the distinction has to be expressible.
    model.cacheMinTokens =
      raw.cacheMinTokens === null
        ? null
        : integerAbove(raw.cacheMinTokens, `models.${id}.cacheMinTokens`, source);
  }
  if (raw.capability !== undefined) {
    if (typeof raw.capability !== 'string' || !CAPABILITIES.includes(raw.capability as Capability)) {
      throw new PricingOverlayError(
        `"models.${id}.capability" must be one of ${CAPABILITIES.join(', ')}`,
        source,
      );
    }
    model.capability = raw.capability as Capability;
  }
  if (raw.caching !== undefined) {
    if (typeof raw.caching !== 'string' || !CACHING_MODES.includes(raw.caching as CachingMode)) {
      throw new PricingOverlayError(
        `"models.${id}.caching" must be one of ${CACHING_MODES.join(', ')}`,
        source,
      );
    }
    model.caching = raw.caching as CachingMode;
  }
  if (raw.tier !== undefined) {
    if (typeof raw.tier !== 'string' || !TIERS.includes(raw.tier as ModelPricing['tier'])) {
      throw new PricingOverlayError(
        `"models.${id}.tier" must be one of ${TIERS.join(', ')}`,
        source,
      );
    }
    model.tier = raw.tier as ModelPricing['tier'];
  }
  if (raw.notes !== undefined) {
    if (typeof raw.notes !== 'string') {
      throw new PricingOverlayError(`"models.${id}.notes" must be a string`, source);
    }
    model.notes = raw.notes;
  }
  if (raw.promo !== undefined) {
    // `null` is how you cancel a bundled promotion that has been withdrawn.
    model.promo = raw.promo === null ? undefined : parsePromo(raw.promo, `models.${id}.promo`, source);
  }
  if (raw.multipliers !== undefined) {
    model.multipliers = parseMultipliers(raw.multipliers, `models.${id}.multipliers`, source);
  }

  return model;
}

/** Validates an overlay document. Every failure throws, with the source named. */
export function parsePricingOverlay(raw: string, source = 'pricing overlay'): PricingOverlay {
  let document: unknown;
  try {
    document = JSON.parse(raw);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new PricingOverlayError(`not valid JSON — ${detail}`, source);
  }

  if (!isPlainObject(document)) {
    throw new PricingOverlayError('the top level must be an object', source);
  }
  rejectUnknownKeys(document, PRICING_OVERLAY_KEYS, source, '');

  if (typeof document.lastReviewed !== 'string' || !ISO_DATE.test(document.lastReviewed)) {
    throw new PricingOverlayError(
      '"lastReviewed" is required and must be a date like 2026-06-24. ' +
        'An overlay of unknown age is worse than the bundled catalogue, whose age is printed.',
      source,
    );
  }
  if (!isPlainObject(document.models) || Object.keys(document.models).length === 0) {
    throw new PricingOverlayError('"models" must be a non-empty object keyed by model id', source);
  }

  const models: Record<string, Partial<Omit<ModelPricing, 'id'>>> = {};
  for (const [id, value] of Object.entries(document.models)) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id)) {
      throw new PricingOverlayError(`"${id}" is not a plausible model id`, source);
    }
    models[id] = parseModel(value, id, source);
  }

  return { lastReviewed: document.lastReviewed, models };
}

/**
 * A new catalogue with the overlay applied. Neither argument is modified.
 *
 * **A model the bundled catalogue does not have must be complete.** Overriding
 * one field of a known model is the common case and needs no more than that
 * field; inventing a model needs every field, because a half-defined model would
 * price at zero somewhere and report a saving that does not exist.
 *
 * `lastReviewed` becomes the *overlay's* date, and the report shows it — a
 * catalogue is only as current as its most recently touched half, and claiming
 * the bundled date over corrected prices would be a lie about provenance.
 */
export function applyPricingOverlay(
  base: PricingCatalogue,
  overlay: PricingOverlay,
  source = 'pricing overlay',
): PricingCatalogue {
  const overridden: string[] = [];
  const added: string[] = [];

  const models = base.models.map((model) => {
    const patch = overlay.models[model.id];
    if (!patch) return model;
    overridden.push(model.id);
    // `promo` is spread explicitly: a patch that sets it to undefined must remove
    // a withdrawn promotion rather than be ignored as a missing key.
    const merged: ModelPricing = { ...model, ...patch };
    if ('promo' in patch && patch.promo === undefined) delete merged.promo;
    return merged;
  });

  /**
   * Membership by **id**, never through the alias index.
   *
   * `base.byId` holds declared aliases beside ids since 1.77.0, so asking
   * it whether an overlay's id already exists answered yes for an id that
   * is only somebody's alias — and the entry was then neither patched nor
   * added: an operator declared a price and nothing happened, silently.
   * An explicit declaration outranks a convenience alias, so it is added
   * here and `indexModels` writes ids last, which makes it win the lookup.
   */
  const realIds = new Set(base.models.map((m) => m.id));
  for (const [id, patch] of Object.entries(overlay.models)) {
    if (realIds.has(id)) continue;

    // `capability` joins the list: it is a required field of `ModelPricing`, and
    // an added model without one produced an object the type says cannot exist —
    // the cast below was hiding it.
    //
    // `cacheMinTokens` is checked for `undefined` and not for falsiness, so an
    // explicit `null` counts as supplied. That is the point of it: saying "not
    // known" is an answer, leaving it out is not.
    const missing = (['displayName', 'inputPerMTok', 'outputPerMTok', 'contextWindow', 'cacheMinTokens', 'tier', 'capability'] as const).filter(
      (key) => patch[key] === undefined,
    );
    if (missing.length > 0) {
      throw new PricingOverlayError(
        `"models.${id}" is not in the bundled catalogue, so it has to be complete. Missing: ${missing.join(', ')}`,
        source,
      );
    }
    models.push({ id, ...patch } as ModelPricing);
    added.push(id);
  }

  return {
    models,
    byId: indexModels(models),
    lastReviewed: overlay.lastReviewed,
    overriddenModels: overridden.sort(),
    addedModels: added.sort(),
  };
}

/** Convenience: the bundled catalogue with an overlay document applied. */
export function catalogueFromOverlay(raw: string, source = 'pricing overlay'): PricingCatalogue {
  return applyPricingOverlay(BUNDLED_CATALOGUE, parsePricingOverlay(raw, source), source);
}
