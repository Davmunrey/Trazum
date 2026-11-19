#!/usr/bin/env node
/**
 * The price catalogue as an open dataset: one JSON document per release,
 * written from `packages/core/src/pricing.ts` and never by hand (#784).
 *
 *   node scripts/pricing-dataset.mjs                    what the catalogue builds today: rows, models, bytes
 *   node scripts/pricing-dataset.mjs write [--version V] write V's document, the schema and the changelog
 *   node scripts/pricing-dataset.mjs check [--version V] exit 1 unless V's published document is what the catalogue builds
 *
 * The release carries the same file under its own name: `node
 * scripts/release-assets.mjs pricing` checks it the way `check` does and
 * copies it.
 *
 * `V` defaults to the version of `packages/core/package.json`, the package
 * the catalogue ships in. Every command reads the built `@trazum/core` (run
 * `npm run build` first) and the files already published; none reads a
 * network.
 *
 * ## What a document is
 *
 * The catalogue, serialised, and nothing added to it. One row per model and
 * rate: a model's input and output price, each conditional band, each
 * service tier, each period of its history, its promotion, the cache and
 * batch ratios it states, the geography multiplier and the web search fee.
 * Every row names its provider, its unit, the pages the provider's prices
 * were read from and the date they were read. Those two come from
 * `PROVIDER_SOURCES` and `PROVIDER_REVIEWED`, which are per provider: the
 * catalogue records no source for a single model, so none is given one.
 * What a model is besides its prices (its name, aliases, context window,
 * cache minimum, retirement, notes) is in `models`, copied as the catalogue
 * holds it.
 *
 * ## What it refuses
 *
 * A row is a figure the catalogue states. A ratio a model does not state is
 * not filled in with the default the catalogue would apply: the default is
 * published once, in `defaults`, and the rule for applying it is in
 * `docs/pricing-dataset.md`. A model the catalogue does not price has no row,
 * never a row of zero. The build stops, naming the model, on a price that is
 * zero, below zero or not a number, on an empty value anywhere but a batch
 * ratio (which the catalogue writes as `null` for "this provider has no batch
 * API"), on a provider with no date or no page, and on any field of the
 * catalogue it does not know how to write, so a field added to `ModelPricing`
 * cannot be left out of the dataset in silence.
 *
 * ## Versions
 *
 * A document is written once, for a release, by `scripts/prepare-release.mjs`,
 * and never rewritten: `write` refuses a version whose published file says
 * something else. Its `changes` say what moved since the newest version
 * published before it, computed from that published file, and
 * `changelog.json` lists every version with those changes and the file's
 * digest. Its `catalogue.sha256` is the digest of `pricing.ts` it was built
 * from, which is how `test/pricing-dataset.test.mjs` knows whether the
 * catalogue has moved since: while it has not, the published document has
 * to be exactly what this script builds.
 *
 * No dependencies, like everything else here.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { REPOSITORY_URL, assetNames, assetUrl } from './install-snippets.mjs';
import { recordedVersion } from './npm-channel.mjs';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const DATASET = 'trazum-pricing';
/** The shape of the document. A change a reader's code would notice is a new number and a new schema file. */
export const FORMAT = 1;
/** Where the site serves the documents from: `apps/web/public` is the site's root. */
export const DIRECTORY = 'apps/web/public/datasets/pricing';
export const SITE_PATH = '/datasets/pricing';
export const SCHEMA_FILE = `schema-${FORMAT}.json`;
export const CHANGELOG_FILE = 'changelog.json';
export const CATALOGUE = 'packages/core/src/pricing.ts';

const VERSION = /^(\d+)\.(\d+)\.(\d+)$/;
const DATE = '^\\d{4}-\\d{2}-\\d{2}$';
const INSTANT = '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?Z$';

/**
 * Every pattern the schema uses, compiled once from a literal. The validator
 * reads `pattern` only through this table and refuses any other: a regular
 * expression built from a document it is checking is one that document could
 * choose, and the schema has no need of one it does not already name.
 */
const PATTERNS = new Map([
  ['^https://', /^https:\/\//],
  ['^\\d+\\.\\d+\\.\\d+$', /^\d+\.\d+\.\d+$/],
  ['^[0-9a-f]{64}$', /^[0-9a-f]{64}$/],
  [DATE, /^\d{4}-\d{2}-\d{2}$/],
  [INSTANT, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/],
]);

/** Each rate a row can carry, and the unit its value is in. */
export const UNITS = Object.freeze({
  input: 'usd-per-million-tokens',
  output: 'usd-per-million-tokens',
  'cache-read': 'multiple-of-input-rate',
  'cache-write': 'multiple-of-input-rate',
  'cache-write-long': 'multiple-of-input-rate',
  batch: 'multiple-of-standard-rates',
  'batch-cache-read': 'multiple-of-batch-input-rate',
  'inference-geo': 'multiple-of-every-rate',
  'web-search': 'usd-per-thousand-searches',
});

/** The catalogue's names for the cache and batch ratios, and the rate each becomes. */
export const MULTIPLIER_RATES = Object.freeze({
  cacheRead: 'cache-read',
  cacheWrite5m: 'cache-write',
  cacheWrite1h: 'cache-write-long',
  batch: 'batch',
  batchCacheRead: 'batch-cache-read',
});

/** What a model is besides its prices: copied into `models` as the catalogue holds it, in this order. */
export const MODEL_FIELDS = Object.freeze([
  'id', 'displayName', 'provider', 'aliases', 'capability', 'contextWindow', 'cacheMinTokens', 'caching', 'cacheTtl',
  'recommendable', 'retired', 'notes',
]);

/** What a model costs: written as rows. */
export const PRICE_FIELDS = Object.freeze([
  'inputPerMTok', 'outputPerMTok', 'tiers', 'multipliers', 'promo', 'history', 'serviceTiers',
  'inferenceGeoMultipliers', 'webSearchPerThousandUsd',
]);

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const clone = (value) => JSON.parse(JSON.stringify(value));

/** The digest of the catalogue's source, line endings made `\n` so a Windows checkout reads the same. */
export const catalogueDigest = (text) => createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex');

/** The site address of a file of the dataset. */
export const siteUrl = (homepage, name) => `${homepage}${SITE_PATH}/${name}`;

/* ------------------------------------------------------------------ */
/* Reading the catalogue                                               */
/* ------------------------------------------------------------------ */

/**
 * Everything a document is made of, from the built core of `root` and the
 * manifest of the package the catalogue ships in. Throws when core is not
 * built: a dataset made from nothing would be a dataset of nothing.
 */
export async function loadCatalogue(root = ROOT) {
  const built = join(root, 'packages/core/dist/pricing.js');
  if (!existsSync(built)) throw new Error('packages/core is not built: run npm run build first');
  const core = await import(pathToFileURL(built).href);
  const manifest = readJson(join(root, 'packages/core/package.json'));
  return {
    models: core.MODELS,
    reviewed: core.PROVIDER_REVIEWED,
    sources: core.PROVIDER_SOURCES,
    lastReviewed: core.PRICING_LAST_REVIEWED,
    defaults: core.COST_MULTIPLIERS,
    sha256: catalogueDigest(readFileSync(join(root, CATALOGUE), 'utf8')),
    // A next's tree has no dataset of its own: it reads as the release on latest (npm-channel.mjs).
    version: recordedVersion(manifest.version, root),
    homepage: manifest.homepage,
    licence: manifest.license,
  };
}

/* ------------------------------------------------------------------ */
/* Rows                                                                 */
/* ------------------------------------------------------------------ */

/** A row's identity: the model, the rate and every qualifier it has, in one string. */
export function rowId(row) {
  const parts = [row.model, row.rate];
  if (row.serviceTier !== undefined) parts.push(`tier=${row.serviceTier}`);
  if (row.band !== undefined) parts.push(`band=${row.band.id}`);
  if (row.until !== undefined) parts.push(`until=${row.until}`);
  if (row.promo !== undefined) parts.push('promo');
  if (row.geo !== undefined) parts.push(`geo=${row.geo}`);
  return parts.join(':');
}

function onlyKnown(value, known, where) {
  for (const key of Object.keys(value)) {
    if (!known.includes(key)) throw new Error(`${where} has "${key}", which the dataset does not know how to write: add it to scripts/pricing-dataset.mjs, or the dataset leaves it out in silence`);
  }
}

/** The rows of one model, in the catalogue's order. */
function rowsOf(model, { reviewed, sources }) {
  const where = `model ${model.id}`;
  onlyKnown(model, [...MODEL_FIELDS, ...PRICE_FIELDS], where);
  const provider = model.provider;
  if (typeof provider !== 'string' || provider === '') throw new Error(`${where} names no provider, so no page and no date can be given for its prices`);
  const date = reviewed[provider];
  const pages = sources[provider];
  if (typeof date !== 'string' || !compiledPattern(DATE).test(date)) throw new Error(`${where}: provider ${provider} has no review date in PROVIDER_REVIEWED`);
  if (!Array.isArray(pages) || pages.length === 0) throw new Error(`${where}: provider ${provider} has no page in PROVIDER_SOURCES`);

  const rows = [];
  const push = (rate, value, qualifiers = {}) => {
    if (value === null) {
      if (rate !== 'batch') throw new Error(`${where}: ${rate} is empty, and only a batch ratio may be (it means the provider has no batch API)`);
    } else if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      throw new Error(`${where}: ${rate} is ${JSON.stringify(value)}; a price of zero, below zero or not a number is not published`);
    }
    const row = { model: model.id, provider, rate, unit: UNITS[rate], value, ...clone(qualifiers), sources: [...pages], reviewed: date };
    rows.push({ id: rowId(row), ...row });
  };
  const rates = (holder, qualifiers, label) => {
    push('input', holder.inputPerMTok, qualifiers);
    push('output', holder.outputPerMTok, qualifiers);
    for (const tier of holder.tiers ?? []) {
      onlyKnown(tier, ['id', 'when', 'inputPerMTok', 'outputPerMTok'], `${label} band ${tier.id}`);
      const band = { band: { id: tier.id, when: tier.when } };
      push('input', tier.inputPerMTok, { ...qualifiers, ...band });
      push('output', tier.outputPerMTok, { ...qualifiers, ...band });
    }
  };
  const ratios = (multipliers, qualifiers, label) => {
    for (const [key, value] of Object.entries(multipliers ?? {})) {
      const rate = MULTIPLIER_RATES[key];
      if (rate === undefined) throw new Error(`${label} has the multiplier "${key}", which the dataset does not know how to write`);
      push(rate, value, qualifiers);
    }
  };

  rates(model, {}, where);
  ratios(model.multipliers, {}, where);
  if (model.promo !== undefined) {
    onlyKnown(model.promo, ['inputPerMTok', 'outputPerMTok', 'until', 'confirmedOn'], `${where} promotion`);
    const promo = { promo: { until: model.promo.until, ...(model.promo.confirmedOn === undefined ? {} : { confirmedOn: model.promo.confirmedOn }) } };
    push('input', model.promo.inputPerMTok, promo);
    push('output', model.promo.outputPerMTok, promo);
  }
  for (const period of model.history ?? []) {
    const label = `${where} period until ${period.until}`;
    onlyKnown(period, ['until', 'inputPerMTok', 'outputPerMTok', 'tiers', 'multipliers'], label);
    rates(period, { until: period.until }, label);
    ratios(period.multipliers, { until: period.until }, label);
  }
  for (const [tier, sheet] of Object.entries(model.serviceTiers ?? {})) {
    const label = `${where} service tier ${tier}`;
    onlyKnown(sheet, ['inputPerMTok', 'outputPerMTok', 'tiers'], label);
    rates(sheet, { serviceTier: tier }, label);
  }
  for (const [geo, value] of Object.entries(model.inferenceGeoMultipliers ?? {})) push('inference-geo', value, { geo });
  if (model.webSearchPerThousandUsd !== undefined) push('web-search', model.webSearchPerThousandUsd);
  return rows;
}

/** The part of a model that is not a price, as the catalogue holds it. */
function modelEntry(model) {
  const entry = {};
  for (const key of MODEL_FIELDS) if (model[key] !== undefined) entry[key] = clone(model[key]);
  return entry;
}

/* ------------------------------------------------------------------ */
/* Changes between versions                                            */
/* ------------------------------------------------------------------ */

/** What was added, removed and changed between two lists of records with an `id`. */
function diff(before, after) {
  const was = new Map(before.map((entry) => [entry.id, entry]));
  const now = new Map(after.map((entry) => [entry.id, entry]));
  const changed = [];
  for (const [id, entry] of now) {
    const old = was.get(id);
    if (old === undefined) continue;
    const fields = {};
    for (const key of [...new Set([...Object.keys(old), ...Object.keys(entry)])].sort()) {
      if (JSON.stringify(old[key]) === JSON.stringify(entry[key])) continue;
      fields[key] = { ...(key in old ? { from: old[key] } : {}), ...(key in entry ? { to: entry[key] } : {}) };
    }
    if (Object.keys(fields).length > 0) changed.push({ id, fields });
  }
  return {
    added: [...now.keys()].filter((id) => !was.has(id)),
    removed: [...was.keys()].filter((id) => !now.has(id)),
    changed,
  };
}

/**
 * What moved between a published document and the next one. `null` for the
 * first: there is nothing it could be compared with, so nothing is listed,
 * rather than every row listed as added.
 */
export function changesBetween(previous, next) {
  if (previous === null) return { since: null, rows: { added: [], removed: [], changed: [] }, models: { added: [], removed: [], changed: [] } };
  return { since: previous.version, rows: diff(previous.rows, next.rows), models: diff(previous.models, next.models) };
}

/* ------------------------------------------------------------------ */
/* The document                                                         */
/* ------------------------------------------------------------------ */

/**
 * The document for `version`, from a loaded catalogue, compared with the
 * newest document published before it (`previous`, or `null`). Pure: reads
 * nothing and writes nothing.
 */
export function buildDocument(catalogue, { version = catalogue.version, previous = null } = {}) {
  if (!VERSION.test(version)) throw new Error(`"${version}" is not a version`);
  const rows = catalogue.models.flatMap((model) => rowsOf(model, catalogue));
  const seen = new Set();
  for (const row of rows) {
    if (seen.has(row.id)) throw new Error(`two rows are ${row.id}`);
    seen.add(row.id);
  }
  const defaults = {};
  for (const [key, rate] of Object.entries(MULTIPLIER_RATES)) if (catalogue.defaults[key] !== undefined) defaults[rate] = catalogue.defaults[key];
  const document = {
    $schema: siteUrl(catalogue.homepage, SCHEMA_FILE),
    dataset: DATASET,
    format: FORMAT,
    version,
    currency: 'USD',
    licence: { spdx: catalogue.licence, url: `${REPOSITORY_URL}/blob/v${version}/LICENSE` },
    catalogue: { path: CATALOGUE, sha256: catalogue.sha256, reviewed: catalogue.lastReviewed },
    sourcesArePer: 'provider',
    defaults,
    models: catalogue.models.map(modelEntry),
    rows,
  };
  document.changes = changesBetween(previous, document);
  const found = problems(document, catalogue.homepage);
  if (found.length > 0) throw new Error(`the document is not one this script publishes:\n  ${found.join('\n  ')}`);
  return document;
}

/**
 * The document as text: two-space JSON, with one model and one row to a line
 * so that a diff between two versions reads as a list of the rows that moved.
 */
export function serialise(document) {
  const entries = Object.entries(document);
  const lines = ['{'];
  entries.forEach(([key, value], at) => {
    const comma = at < entries.length - 1 ? ',' : '';
    if (key === 'rows' || key === 'models') {
      lines.push(`  ${JSON.stringify(key)}: [`);
      for (const [index, item] of value.entries()) lines.push(`    ${JSON.stringify(item)}${index < value.length - 1 ? ',' : ''}`);
      lines.push(`  ]${comma}`);
    } else {
      lines.push(`  ${JSON.stringify(key)}: ${JSON.stringify(value, null, 2).replace(/\n/g, '\n  ')}${comma}`);
    }
  });
  lines.push('}');
  return `${lines.join('\n')}\n`;
}

/* ------------------------------------------------------------------ */
/* The schema, and the reading of it                                   */
/* ------------------------------------------------------------------ */

const condition = {
  type: 'object',
  description: 'When a band applies, as the catalogue states it: a prompt above or at least a number of input tokens, a call inside UTC hours (each hour a window starts at), or a call at a speed the response names.',
  additionalProperties: false,
  required: ['kind'],
  properties: {
    kind: { enum: ['input-tokens-above', 'input-tokens-at-least', 'utc-hours', 'speed'] },
    tokens: { type: 'integer', exclusiveMinimum: 0 },
    hours: { type: 'array', items: { type: 'integer', minimum: 0, maximum: 23 } },
    weekdaysOnly: { type: 'boolean' },
    speed: { enum: ['fast'] },
  },
};

const changeList = {
  type: 'object',
  additionalProperties: false,
  required: ['added', 'removed', 'changed'],
  properties: {
    added: { type: 'array', items: { type: 'string' } },
    removed: { type: 'array', items: { type: 'string' } },
    changed: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'fields'],
        properties: { id: { type: 'string' }, fields: { type: 'object', description: 'Each field that differs, with its value before (`from`) and after (`to`); a side is absent when the field was.' } },
      },
    },
  },
};

/** The JSON Schema every document of this format satisfies. Written to `schema-<format>.json`. */
export function schema(homepage) {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: siteUrl(homepage, SCHEMA_FILE),
    title: 'Trazum pricing dataset',
    description:
      "Trazum's price catalogue (packages/core/src/pricing.ts), serialised: one row per model and rate. Sources and review dates are per provider, because the catalogue records them per provider; no model has a source of its own. A rate the catalogue does not state has no row, and a model it does not price has none at all: nothing here is estimated, and no unknown is written as zero.",
    type: 'object',
    additionalProperties: false,
    required: ['$schema', 'dataset', 'format', 'version', 'currency', 'licence', 'catalogue', 'sourcesArePer', 'defaults', 'models', 'rows', 'changes'],
    properties: {
      $schema: { type: 'string', pattern: '^https://' },
      dataset: { const: DATASET },
      format: { const: FORMAT },
      version: { type: 'string', pattern: '^\\d+\\.\\d+\\.\\d+$', description: 'The Trazum release this document was published with.' },
      currency: { const: 'USD' },
      licence: {
        type: 'object',
        additionalProperties: false,
        required: ['spdx', 'url'],
        properties: { spdx: { type: 'string', minLength: 1 }, url: { type: 'string', pattern: '^https://' } },
      },
      catalogue: {
        type: 'object',
        description: 'The file this was built from, the SHA-256 of its text, and the oldest provider review date in it.',
        additionalProperties: false,
        required: ['path', 'sha256', 'reviewed'],
        properties: { path: { type: 'string' }, sha256: { type: 'string', pattern: '^[0-9a-f]{64}$' }, reviewed: { type: 'string', pattern: DATE } },
      },
      sourcesArePer: { const: 'provider', description: "Every row's sources and date are its provider's: the pages that provider's prices were read from, and the day." },
      defaults: {
        type: 'object',
        description: 'The ratio the catalogue applies when a model states none: a model with no row for one of these rates takes this value. A period of a model\'s history with no row for a ratio takes the model\'s own row first.',
        additionalProperties: false,
        required: ['cache-read', 'cache-write', 'cache-write-long', 'batch'],
        properties: Object.fromEntries(['cache-read', 'cache-write', 'cache-write-long', 'batch'].map((rate) => [rate, { type: 'number', exclusiveMinimum: 0 }])),
      },
      models: { type: 'array', minItems: 1, items: { $ref: '#/$defs/model' } },
      rows: { type: 'array', minItems: 1, items: { $ref: '#/$defs/row' } },
      changes: {
        type: 'object',
        description: 'What moved since the newest version published before this one; `since` is null for the first.',
        additionalProperties: false,
        required: ['since', 'rows', 'models'],
        properties: { since: { type: ['string', 'null'] }, rows: { $ref: '#/$defs/changeList' }, models: { $ref: '#/$defs/changeList' } },
      },
    },
    $defs: {
      model: {
        type: 'object',
        description: 'A model as the catalogue holds it, without its prices.',
        additionalProperties: false,
        required: ['id', 'displayName', 'provider', 'capability', 'contextWindow', 'cacheMinTokens'],
        properties: {
          id: { type: 'string', minLength: 1 },
          displayName: { type: 'string', minLength: 1 },
          provider: { type: 'string', minLength: 1 },
          aliases: { type: 'array', items: { type: 'string', minLength: 1 }, description: 'Other ids that bill at exactly this rate.' },
          capability: { enum: ['small', 'mid', 'large', 'frontier', 'unknown'] },
          contextWindow: { type: 'integer', exclusiveMinimum: 0 },
          cacheMinTokens: { type: ['integer', 'null'], minimum: 0, description: 'Not a price. Null when the catalogue does not know.' },
          caching: { enum: ['explicit', 'automatic', 'none', 'unknown'] },
          cacheTtl: {
            type: 'object',
            additionalProperties: false,
            required: ['writeMs', 'longerMs'],
            properties: { writeMs: { type: 'integer', exclusiveMinimum: 0 }, longerMs: { type: ['integer', 'null'], exclusiveMinimum: 0 } },
          },
          recommendable: { type: 'boolean' },
          retired: {
            type: 'object',
            additionalProperties: false,
            required: ['on', 'because'],
            properties: { on: { type: 'string', pattern: DATE }, because: { type: 'string', minLength: 1 } },
          },
          notes: { type: 'string' },
        },
      },
      row: {
        type: 'object',
        description: 'One rate of one model. Without `serviceTier`, `band`, `until`, `promo` or `geo` it is the standard rate today.',
        additionalProperties: false,
        required: ['id', 'model', 'provider', 'rate', 'unit', 'value', 'sources', 'reviewed'],
        properties: {
          id: { type: 'string', minLength: 1 },
          model: { type: 'string', minLength: 1 },
          provider: { type: 'string', minLength: 1 },
          rate: { enum: Object.keys(UNITS) },
          unit: { enum: [...new Set(Object.values(UNITS))] },
          value: {
            type: ['number', 'null'],
            exclusiveMinimum: 0,
            description: 'Never zero. Null only for a batch ratio, where it means the provider has no batch API.',
          },
          serviceTier: { enum: ['flex', 'fast', 'ultrafast'], description: 'A service tier other than the standard one, which replaces the standard rates and bands whole.' },
          band: {
            type: 'object',
            description: 'A conditional rate, which applies when `when` holds.',
            additionalProperties: false,
            required: ['id', 'when'],
            properties: { id: { type: 'string', minLength: 1 }, when: { $ref: '#/$defs/condition' } },
          },
          until: { type: 'string', pattern: INSTANT, description: 'A rate of a past period: it applied to a call before this instant (exclusive) and after the previous period ended.' },
          promo: {
            type: 'object',
            description: 'A promotional rate, until a date (inclusive), with the date the page was last read still stating it.',
            additionalProperties: false,
            required: ['until'],
            properties: { until: { type: 'string', pattern: DATE }, confirmedOn: { type: 'string', pattern: DATE } },
          },
          geo: { enum: ['us'] },
          sources: { type: 'array', minItems: 1, items: { type: 'string', pattern: '^https://' } },
          reviewed: { type: 'string', pattern: DATE },
        },
      },
      condition,
      changeList,
    },
  };
}

const KEYWORDS = new Set([
  '$schema', '$id', '$defs', '$ref', 'title', 'description', 'type', 'properties', 'required', 'additionalProperties', 'items',
  'enum', 'const', 'pattern', 'minLength', 'minItems', 'minimum', 'maximum', 'exclusiveMinimum',
]);

const typeOf = (value) => (value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value);

/**
 * Every place `value` breaks `schema`, as `path: reason`. Reads the keywords
 * the schema above uses and throws on any other, so the schema cannot grow a
 * rule nothing here checks.
 */

function compiledPattern(pattern) {
  const compiled = PATTERNS.get(pattern);
  if (compiled === undefined) throw new Error(`the validator has no compiled pattern for ${JSON.stringify(pattern)}; add it to PATTERNS`);
  return compiled;
}

export function validate(schema, value, { root = schema, at = '$' } = {}) {
  for (const key of Object.keys(schema)) if (!KEYWORDS.has(key)) throw new Error(`the schema uses "${key}", which validate() does not read`);
  if (schema.$ref !== undefined) {
    const name = /^#\/\$defs\/([A-Za-z]+)$/.exec(schema.$ref)?.[1];
    if (name === undefined || root.$defs?.[name] === undefined) throw new Error(`${at}: cannot resolve ${schema.$ref}`);
    return validate(root.$defs[name], value, { root, at });
  }
  const errors = [];
  const actual = typeOf(value);
  if (schema.type !== undefined) {
    const allowed = Array.isArray(schema.type) ? schema.type : [schema.type];
    const fits = allowed.some((type) => type === actual || (type === 'integer' && Number.isInteger(value)));
    if (!fits) return [`${at}: is ${actual}, not ${allowed.join(' or ')}`];
  }
  if (schema.const !== undefined && value !== schema.const) errors.push(`${at}: is ${JSON.stringify(value)}, not ${JSON.stringify(schema.const)}`);
  if (schema.enum !== undefined && !schema.enum.includes(value)) errors.push(`${at}: ${JSON.stringify(value)} is not one of ${schema.enum.join(', ')}`);
  if (actual === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${at}: ${value} is below ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${at}: ${value} is above ${schema.maximum}`);
    if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) errors.push(`${at}: ${value} is not above ${schema.exclusiveMinimum}`);
  }
  if (actual === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${at}: is shorter than ${schema.minLength}`);
    if (schema.pattern !== undefined && !compiledPattern(schema.pattern).test(value)) errors.push(`${at}: ${JSON.stringify(value)} does not match ${schema.pattern}`);
  }
  if (actual === 'array') {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${at}: has fewer than ${schema.minItems} items`);
    if (schema.items !== undefined) for (const [index, item] of value.entries()) errors.push(...validate(schema.items, item, { root, at: `${at}[${index}]` }));
  }
  if (actual === 'object') {
    for (const key of schema.required ?? []) if (!(key in value)) errors.push(`${at}: has no "${key}"`);
    for (const [key, item] of Object.entries(value)) {
      const rule = schema.properties?.[key];
      if (rule !== undefined) errors.push(...validate(rule, item, { root, at: `${at}.${key}` }));
      else if (schema.additionalProperties === false) errors.push(`${at}: has "${key}", which the schema does not allow`);
    }
  }
  return errors;
}

/**
 * Everything wrong with a document: the schema first, then what a schema
 * cannot say. Each row's id is the one its fields make, its unit is its
 * rate's, an empty value is a batch ratio's, it names a model the document
 * lists, under that model's provider, and no id appears twice.
 */
export function problems(document, homepage) {
  const found = validate(schema(homepage), document);
  if (found.length > 0) return found;
  const models = new Map();
  for (const model of document.models) {
    if (models.has(model.id)) found.push(`models: ${model.id} is listed twice`);
    models.set(model.id, model);
  }
  const ids = new Set();
  for (const row of document.rows) {
    if (ids.has(row.id)) found.push(`rows: ${row.id} appears twice`);
    ids.add(row.id);
    if (row.id !== rowId(row)) found.push(`rows: ${row.id} is not the id its fields make (${rowId(row)})`);
    if (row.unit !== UNITS[row.rate]) found.push(`rows: ${row.id} is in ${row.unit}, and a ${row.rate} rate is in ${UNITS[row.rate]}`);
    if (row.value === null && row.rate !== 'batch') found.push(`rows: ${row.id} is empty, and only a batch ratio may be`);
    const model = models.get(row.model);
    if (model === undefined) found.push(`rows: ${row.id} prices a model the document does not list`);
    else if (model.provider !== row.provider) found.push(`rows: ${row.id} says ${row.provider}, and the model is ${model.provider}'s`);
  }
  return found;
}

/* ------------------------------------------------------------------ */
/* Published files                                                      */
/* ------------------------------------------------------------------ */

const versionKey = (version) => VERSION.exec(version).slice(1).map(Number);
const older = (a, b) => {
  const [x, y] = [versionKey(a), versionKey(b)];
  for (let at = 0; at < 3; at += 1) if (x[at] !== y[at]) return x[at] < y[at];
  return false;
};

/** The versions published in `root`'s dataset folder, oldest first. */
export function publishedVersions(root = ROOT) {
  const directory = join(root, DIRECTORY);
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .map((name) => /^(\d+\.\d+\.\d+)\.json$/.exec(name)?.[1])
    .filter((version) => version !== undefined)
    .sort((a, b) => (older(a, b) ? -1 : older(b, a) ? 1 : 0));
}

/** The newest document published before `version`, parsed, or `null`. */
export function previousOf(version, root = ROOT) {
  const before = publishedVersions(root).filter((candidate) => older(candidate, version));
  if (before.length === 0) return null;
  return readJson(join(root, DIRECTORY, `${before.at(-1)}.json`));
}

/**
 * Versions whose document was written after the release was cut, so the
 * release does not carry it and `changelog.json` names no release asset for
 * it. 3.0.1 is the first document: it was written from a catalogue whose
 * prices are 3.0.1's (pricing.ts gained only `PROVIDER_SOURCES` since that
 * tag) and is on the site. If the file is attached to that release by hand,
 * its version comes out of this list.
 */
export const WRITTEN_AFTER_RELEASE = Object.freeze(['3.0.1']);

/**
 * `changelog.json`: every published version, newest first, with its two
 * addresses, the SHA-256 of its file and what changed since the one before.
 * Read from the published files, so nothing in it is typed.
 */
export function buildChangelog(texts, homepage) {
  const versions = Object.keys(texts).sort((a, b) => (older(a, b) ? 1 : older(b, a) ? -1 : 0));
  return {
    dataset: DATASET,
    format: FORMAT,
    schema: siteUrl(homepage, SCHEMA_FILE),
    versions: versions.map((version) => {
      const document = JSON.parse(texts[version]);
      return {
        version,
        url: siteUrl(homepage, `${version}.json`),
        releaseAsset: WRITTEN_AFTER_RELEASE.includes(version) ? null : assetUrl(version, assetNames(version).pricing),
        sha256: createHash('sha256').update(texts[version]).digest('hex'),
        models: document.models.length,
        rows: document.rows.length,
        changes: document.changes,
      };
    }),
  };
}

const jsonText = (value) => `${JSON.stringify(value, null, 2)}\n`;

/**
 * The files a release adds or rewrites, `{ path: text }`, for `version`: its
 * document, the schema and the changelog. Published documents are read from
 * `root`; the catalogue is the one `catalogue` was loaded from. Refuses to
 * rewrite a published version with anything else.
 */
export function datasetFiles(catalogue, { version = catalogue.version, root = ROOT } = {}) {
  const document = buildDocument(catalogue, { version, previous: previousOf(version, root) });
  const text = serialise(document);
  const path = join(DIRECTORY, `${version}.json`);
  if (existsSync(join(root, path)) && readFileSync(join(root, path), 'utf8') !== text) {
    throw new Error(`${path} is published and says something else. A published version is never rewritten: the next release's file is written by scripts/prepare-release.mjs.`);
  }
  const texts = {};
  for (const published of publishedVersions(root)) texts[published] = readFileSync(join(root, DIRECTORY, `${published}.json`), 'utf8');
  texts[version] = text;
  return {
    [path]: text,
    [join(DIRECTORY, SCHEMA_FILE)]: jsonText(schema(catalogue.homepage)),
    [join(DIRECTORY, CHANGELOG_FILE)]: jsonText(buildChangelog(texts, catalogue.homepage)),
  };
}

/**
 * Whether the published document of `version` is what the catalogue builds,
 * byte for byte: `{ ok, path, reason }`.
 */
export function checkPublished(catalogue, { version = catalogue.version, root = ROOT } = {}) {
  const path = join(DIRECTORY, `${version}.json`);
  if (!existsSync(join(root, path))) return { ok: false, path, reason: `${path} does not exist: no document was published for ${version}` };
  const built = serialise(buildDocument(catalogue, { version, previous: previousOf(version, root) }));
  if (readFileSync(join(root, path), 'utf8') !== built) return { ok: false, path, reason: `${path} is not what the catalogue at this commit builds: node scripts/pricing-dataset.mjs shows what it builds` };
  return { ok: true, path, reason: '' };
}

/* ------------------------------------------------------------------ */
/* The commands                                                         */
/* ------------------------------------------------------------------ */

async function main() {
  const [command = 'summary', ...rest] = process.argv.slice(2);
  const option = (name) => {
    const at = rest.indexOf(name);
    return at === -1 ? undefined : rest[at + 1];
  };
  const catalogue = await loadCatalogue(ROOT);
  const version = option('--version') ?? catalogue.version;

  if (command === 'summary') {
    const document = buildDocument(catalogue, { version, previous: previousOf(version) });
    const text = serialise(document);
    console.log(`${DATASET} ${version}: ${document.rows.length} rows for ${document.models.length} models from ${Object.keys(catalogue.reviewed).length} providers, ${Buffer.byteLength(text)} bytes; changes since ${document.changes.since ?? 'nothing (the first)'}: ${document.changes.rows.added.length} added, ${document.changes.rows.removed.length} removed, ${document.changes.rows.changed.length} changed`);
    return;
  }
  if (command === 'write') {
    for (const [path, text] of Object.entries(datasetFiles(catalogue, { version }))) {
      mkdirSync(dirname(join(ROOT, path)), { recursive: true });
      writeFileSync(join(ROOT, path), text);
      console.log(`wrote ${path}`);
    }
    return;
  }
  if (command === 'check') {
    const result = checkPublished(catalogue, { version });
    if (!result.ok) {
      console.error(`pricing dataset: ${result.reason}`);
      process.exit(1);
    }
    console.log(`${result.path} is what the catalogue builds`);
    return;
  }
  console.error('usage: node scripts/pricing-dataset.mjs [summary | write | check] [--version V]');
  process.exit(2);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`pricing dataset: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
