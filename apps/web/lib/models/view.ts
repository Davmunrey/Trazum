import { MODELS, PRICING_LAST_REVIEWED, PROVIDER_REVIEWED, formatUsd, multipliersFor } from '@trazum/core';

import type { ModelsExtra } from '../history/types';

/**
 * `/models`: the catalogue, as the page draws it.
 *
 * ## The page is the catalogue
 *
 * Every figure here is a field of a row of `MODELS`, the table the product
 * prices with, formatted by `formatUsd`, the function every report prints
 * money with. Nothing is derived: no cache price is multiplied out, no
 * promotional or batch figure is computed, no rate is rounded. A rate that
 * `formatUsd` would round, which none is today, is written as the number the
 * catalogue holds. What the catalogue states as a ratio (a cache read at
 * 0.1x the input rate) is shown as that ratio.
 *
 * What the catalogue does not say, the page does not say. A model with no
 * finite rate is drawn as unpriced and never with a figure, and a field this
 * file does not know how to draw is left out rather than guessed at.
 *
 * Built from the module the product ships, when the site is built; the page
 * reads no file and makes no request.
 */

type Model = (typeof MODELS)[number];
type Tier = NonNullable<Model['tiers']>[number];

/** A rate pair, as text. */
export interface RateView {
  input: string;
  output: string;
}

/** The condition a band applies under, as the catalogue states it. */
export type WhenView =
  | { kind: 'speed'; speed: string }
  | { kind: 'above'; tokens: string }
  | { kind: 'at-least'; tokens: string }
  | { kind: 'hours'; hours: string[]; weekdaysOnly: boolean };

export interface BandView {
  /** The id the catalogue gives the band: short, stable, and printed. */
  id: string;
  when: WhenView;
  rates: RateView | null;
}

export interface ServiceTierView {
  name: string;
  rates: RateView | null;
  bands: BandView[];
}

export interface PeriodView {
  /** The instant the catalogue states, as written: the price held until then. */
  until: string;
  rates: RateView | null;
  bands: BandView[];
}

export interface CacheWriteView {
  multiplier: string;
  /** Minutes the entry lives, as the catalogue states it. */
  minutes: number;
}

export interface ModelView {
  id: string;
  name: string;
  provider: string;
  /** The row's own rates, or `null` when the catalogue has no finite price for it. */
  rates: RateView | null;
  context: string | null;
  retired: { on: string; because: string } | null;
  promo: { rates: RateView | null; until: string; confirmedOn: string | null } | null;
  /** The catalogue does not offer it as a cheaper alternative. */
  notOffered: boolean;
  caching: 'explicit' | 'automatic' | 'none' | 'unknown';
  cacheMinTokens: string | null;
  /** A cache read as a multiple of the input rate, or `null` where there is no caching to read. */
  cacheRead: string | null;
  cacheWrites: CacheWriteView[];
  /** Batch as a multiple of the rates, `'none'` where the provider has no batch API, `null` where not said. */
  batch: string | 'none' | null;
  bands: BandView[];
  serviceTiers: ServiceTierView[];
  /** What the rates were before the row's own, earliest first. */
  history: PeriodView[];
  geo: { name: string; multiplier: string }[];
  /** What one thousand web searches cost, as the catalogue states it. */
  webSearch: string | null;
  aliases: string[];
  notes: string | null;
}

export interface UnpricedView {
  provider: string;
  id: string;
  reason: string;
}

export interface ProviderView {
  id: string;
  name: string;
  /** The date this provider's prices were last read, or `null` when none is recorded. */
  reviewed: string | null;
  source: { url: string; label: string } | null;
  models: ModelView[];
  unpriced: UnpricedView[];
}

export interface CatalogueView {
  /** The oldest provider date: the catalogue's own. */
  reviewed: string;
  providers: ProviderView[];
  /**
   * Models with a row; of those, how many are retired, promotional or have no
   * finite rate; and the ids a provider lists that the catalogue has no row for.
   */
  counts: { models: number; retired: number; promotional: number; unpricedRows: number; unpricedListed: number };
}

/**
 * Provider names. A provider the catalogue gains that is not here is drawn
 * under its id, and `site-pages.test.mjs` fails until it has a name: the id is
 * the fallback for a page that must not break, not the intended text.
 */
export const PROVIDER_NAMES: Readonly<Record<string, string>> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google',
  moonshot: 'Moonshot AI',
  deepseek: 'DeepSeek',
  xai: 'xAI',
  mistral: 'Mistral AI',
};

/**
 * A rate as text. `formatUsd` is the formatter every report uses; where it
 * would not give back the number it was given, the number is written as it is
 * rather than rounded. `null` for anything that is not a rate.
 */
export function rateText(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  const formatted = formatUsd(value);
  return Number(formatted.replace(/[$,]/g, '')) === value ? formatted : `$${String(value)}`;
}

function rates(input: unknown, output: unknown): RateView | null {
  const i = rateText(input);
  const o = rateText(output);
  return i === null || o === null ? null : { input: i, output: o };
}

/** A whole number with thousands separators, the same in every language. */
function count(value: unknown): string | null {
  return typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('en-US') : null;
}

/** A multiplier as the catalogue states it: the shortest decimal, then `x`. */
function times(value: unknown): string | null {
  return typeof value === 'number' && Number.isFinite(value) ? `${value}x` : null;
}

function when(condition: Tier['when']): WhenView | null {
  switch (condition.kind) {
    case 'speed':
      return { kind: 'speed', speed: condition.speed };
    case 'input-tokens-above':
      return { kind: 'above', tokens: count(condition.tokens) ?? '' };
    case 'input-tokens-at-least':
      return { kind: 'at-least', tokens: count(condition.tokens) ?? '' };
    case 'utc-hours':
      return { kind: 'hours', hours: condition.hours.map((hour) => String(hour).padStart(2, '0')), weekdaysOnly: condition.weekdaysOnly };
    default:
      // A condition this page was not written for is left out, not guessed at.
      return null;
  }
}

function bands(list: readonly Tier[] | undefined): BandView[] {
  const out: BandView[] = [];
  for (const tier of list ?? []) {
    const condition = when(tier.when);
    if (condition !== null) out.push({ id: tier.id, when: condition, rates: rates(tier.inputPerMTok, tier.outputPerMTok) });
  }
  return out;
}

/** One catalogue row as the page draws it. */
export function modelView(model: Model): ModelView {
  const mode = model.caching ?? 'explicit';
  const m = multipliersFor(model);
  const caches = mode === 'explicit' || mode === 'automatic';
  const writes: CacheWriteView[] = [];
  if (caches) {
    const short = times(m.cacheWrite5m);
    if (short !== null) writes.push({ multiplier: short, minutes: (model.cacheTtl?.writeMs ?? 300_000) / 60_000 });
    const longer = times(m.cacheWrite1h);
    const longerMs = model.cacheTtl === undefined ? 3_600_000 : model.cacheTtl.longerMs;
    if (longer !== null && longerMs !== null) writes.push({ multiplier: longer, minutes: longerMs / 60_000 });
  }
  return {
    id: model.id,
    name: model.displayName,
    provider: model.provider ?? '',
    rates: rates(model.inputPerMTok, model.outputPerMTok),
    context: count(model.contextWindow),
    retired: model.retired === undefined ? null : { on: model.retired.on, because: model.retired.because },
    promo:
      model.promo === undefined
        ? null
        : { rates: rates(model.promo.inputPerMTok, model.promo.outputPerMTok), until: model.promo.until, confirmedOn: model.promo.confirmedOn ?? null },
    notOffered: model.recommendable === false,
    caching: mode,
    cacheMinTokens: caches ? count(model.cacheMinTokens) : null,
    cacheRead: caches ? times(m.cacheRead) : null,
    cacheWrites: writes,
    batch: m.batch === null ? 'none' : times(m.batch),
    bands: bands(model.tiers),
    serviceTiers: Object.entries(model.serviceTiers ?? {}).map(([name, sheet]) => ({
      name,
      rates: rates(sheet?.inputPerMTok, sheet?.outputPerMTok),
      bands: bands(sheet?.tiers),
    })),
    history: (model.history ?? []).map((period) => ({
      until: period.until,
      rates: rates(period.inputPerMTok, period.outputPerMTok),
      bands: bands(period.tiers),
    })),
    geo: Object.entries(model.inferenceGeoMultipliers ?? {}).flatMap(([name, value]) => {
      const multiplier = times(value);
      return multiplier === null ? [] : [{ name, multiplier }];
    }),
    webSearch: model.webSearchPerThousandUsd === undefined ? null : rateText(model.webSearchPerThousandUsd),
    aliases: [...(model.aliases ?? [])],
    notes: model.notes ?? null,
  };
}

/**
 * The whole catalogue, grouped by provider in the order the catalogue lists
 * them, each provider's models in the catalogue's order.
 *
 * The three arguments default to the product's own catalogue; a test hands in
 * a catalogue it made, and nothing else is read.
 */
export function catalogueView(
  extra: ModelsExtra,
  models: readonly Model[] = MODELS,
  reviewed: Readonly<Record<string, string>> = PROVIDER_REVIEWED,
  oldest: string = PRICING_LAST_REVIEWED,
): CatalogueView {
  const order: string[] = [];
  const grouped = new Map<string, ModelView[]>();
  for (const model of models) {
    const provider = model.provider ?? '';
    if (!grouped.has(provider)) {
      grouped.set(provider, []);
      order.push(provider);
    }
    grouped.get(provider)?.push(modelView(model));
  }
  // A provider that has only unpriced models is still a provider.
  for (const entry of extra.unpriced) {
    if (!grouped.has(entry.provider)) {
      grouped.set(entry.provider, []);
      order.push(entry.provider);
    }
  }
  const providers = order.map((id): ProviderView => ({
    id,
    name: PROVIDER_NAMES[id] ?? id,
    reviewed: reviewed[id] ?? null,
    source: Object.hasOwn(extra.sources, id) ? extra.sources[id] : null,
    models: grouped.get(id) ?? [],
    unpriced: extra.unpriced.filter((entry) => entry.provider === id),
  }));
  const all = providers.flatMap((provider) => provider.models);
  return {
    reviewed: oldest,
    providers,
    counts: {
      models: all.length,
      retired: all.filter((model) => model.retired !== null).length,
      promotional: all.filter((model) => model.promo !== null).length,
      unpricedRows: all.filter((model) => model.rates === null).length,
      unpricedListed: extra.unpriced.length,
    },
  };
}
