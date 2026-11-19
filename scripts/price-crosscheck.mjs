#!/usr/bin/env node
/**
 * The providers `price-drift.mjs` cannot read, against LiteLLM's model list.
 *
 *   node scripts/price-crosscheck.mjs                      # read LiteLLM; exit 1 on a differing rate or an unread file
 *   node scripts/price-crosscheck.mjs --report             # the same report, always exit 0
 *   node scripts/price-crosscheck.mjs --litellm-file m.json  # offline, from a copy saved earlier
 *
 * ## Why this exists
 *
 * `price-drift.mjs` reads Anthropic's and OpenAI's pricing pages. Google,
 * DeepSeek, Moonshot, xAI and Mistral publish no table a script can read, so
 * nothing but `freshness.mjs` (how long ago) watched them (#820). LiteLLM
 * keeps a public JSON list of models and their rates,
 * `model_prices_and_context_window.json`, edited by many people within days of
 * a provider's change. This reads it for those five providers and says where
 * it and the catalogue disagree.
 *
 * ## LiteLLM is a signal, not a source
 *
 * Nothing it holds is copied. A finding says which provider page to re-read
 * (the page and the date from `PROVIDER_SOURCES` and `PROVIDER_REVIEWED`,
 * printed beside it), and a person reads that page and changes
 * `packages/core/src/pricing.ts` by hand, as every other price here was. A
 * figure from a third party's list that went into the catalogue is a figure
 * nobody read at the provider. LiteLLM can be wrong, late or a different
 * price (a promotion, a long-prompt band, another region), which is why a
 * disagreement is a reason to look and never a verdict.
 *
 * ## What it reports
 *
 * - **missing**: a LiteLLM chat model of one of the five providers whose id
 *   the catalogue does not price. Reported, never a failure: LiteLLM lists
 *   retired, experimental, speech and free models the catalogue leaves out on
 *   purpose, so a failure on it would stay red and be ignored;
 * - **differs**: an input or output rate, or a cache-read rate when both
 *   state one, that differs from the catalogue's rate in force today, its
 *   base row and every tier it holds (a rate that matches a tier is a note
 *   naming the tier). A row retired in the catalogue is a note, not compared. A failure, unless a person confirmed the catalogue right
 *   (`CONFIRMED_DIFFERENCES`);
 * - **unread**: LiteLLM could not be fetched, or holds no model of a provider
 *   this expects. A check that passes because it read nothing is worse than
 *   none;
 * - **note**: a catalogue model of those providers LiteLLM does not list.
 *
 * ## How names are matched
 *
 * Exactly. LiteLLM's key, with the provider prefix LiteLLM puts on it
 * (`gemini/`, `xai/`, `mistral/`, `moonshot/`, `deepseek/`) taken off, must
 * equal a catalogue id. No fuzzy matching, no aliases, no stripping of dates or
 * suffixes: a name that does not match is listed as missing, and a catalogue
 * id nothing matched is listed as a note, never paired by guess.
 *
 * ## What it never does
 *
 * It never writes a price, a file or anything else: the report is printed to
 * the CI log, which is where it is read. It only reads `pricing.ts` through
 * the built `@trazum/core` (run `npm run build` first). On a pull request the
 * workflow runs it with `--report`; only the weekly schedule can fail.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { PAGES } from './price-drift.mjs';

// `PROVIDER_SOURCES` is exported by the module, not by the package index.
const PRICING_URL = pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), '..', 'packages/core/dist/pricing.js')).href;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** LiteLLM's public price list. A third party's file, read as a signal. */
export const LITELLM_URL = 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';

/**
 * Each provider this checks, and the name LiteLLM gives it in
 * `litellm_provider`, which is also the prefix of its keys. The set is the
 * catalogue's providers `price-drift.mjs` does not read (`PAGES`); a test holds
 * the two together, so a provider moving between them is noticed.
 */
export const LITELLM_PROVIDERS = {
  google: 'gemini',
  deepseek: 'deepseek',
  moonshot: 'moonshot',
  xai: 'xai',
  mistral: 'mistral',
};

/**
 * Rows where a person re-read the provider's page, found the catalogue right
 * and LiteLLM different, so the difference stops failing the weekly run.
 *
 * Each entry is `provider: { id: 'what was read, the page and the date' }` and
 * is reported as a note on every run so it stays visible, the way
 * `DELIBERATELY_UNPRICED` does in `price-drift.mjs`. Empty: nothing has been
 * confirmed this way yet. An entry is a decision, never a way to quiet a run.
 */
export const CONFIRMED_DIFFERENCES = {};

/** Only these LiteLLM modes are priced per token as a chat model is. */
const CHAT_MODES = new Set(['chat', 'completion', 'responses']);

/** Rates are compared as dollars per million tokens, to 9 significant digits, so 1e-07 and 0.0000001 are one number. */
const perMTok = (perToken) => Number((perToken * 1e6).toPrecision(9));

/**
 * A cache-read rate is the row's input rate times a ratio the row states, and
 * a provider prints the result to the digits it chooses ($0.022 where 0.66 *
 * 0.0333 is 0.021978), so two cache-read rates within 1% are one rate. Input and
 * output are exact.
 */
const sameCache = (a, b) => Math.abs(a - b) <= Math.abs(b) * 0.01;

const isRate = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;

/**
 * LiteLLM's list as `{ provider: Map<id, rates> }` for the providers checked.
 *
 * `sample_spec` and anything that is not an object are skipped, as is any
 * entry with no per-token input and output rate (an image, an embedding, a
 * model priced per second). The prefix stripped is the provider's own,
 * `<litellm_provider>/`; a key with no prefix (DeepSeek lists `deepseek-chat`
 * bare) is the id as it stands. When two keys give one id with different rates
 * both are kept, so the disagreement shows.
 */
export function readLiteLlm(json) {
  const byProvider = Object.fromEntries(Object.keys(LITELLM_PROVIDERS).map((provider) => [provider, new Map()]));
  const ours = new Map(Object.entries(LITELLM_PROVIDERS).map(([provider, theirs]) => [theirs, provider]));
  if (json === null || typeof json !== 'object') return byProvider;
  for (const [key, entry] of Object.entries(json)) {
    if (key === 'sample_spec' || entry === null || typeof entry !== 'object') continue;
    const provider = ours.get(entry.litellm_provider);
    if (provider === undefined || !CHAT_MODES.has(entry.mode)) continue;
    if (!isRate(entry.input_cost_per_token) || !isRate(entry.output_cost_per_token)) continue;
    const prefix = `${entry.litellm_provider}/`;
    const id = key.startsWith(prefix) ? key.slice(prefix.length) : key;
    const rates = {
      key,
      inputPerMTok: perMTok(entry.input_cost_per_token),
      outputPerMTok: perMTok(entry.output_cost_per_token),
      ...(isRate(entry.cache_read_input_token_cost) ? { cacheReadPerMTok: perMTok(entry.cache_read_input_token_cost) } : {}),
    };
    const seen = byProvider[provider].get(id) ?? [];
    if (!seen.some((r) => r.inputPerMTok === rates.inputPerMTok && r.outputPerMTok === rates.outputPerMTok && r.cacheReadPerMTok === rates.cacheReadPerMTok)) seen.push(rates);
    byProvider[provider].set(id, seen);
  }
  return byProvider;
}

const dollars = (value) => `$${value}`;

/** Where the catalogue's figure was read, to print beside a finding. */
function readFrom(provider, core, sources) {
  const pages = sources[provider] ?? [];
  return `catalogue read ${core.PROVIDER_REVIEWED[provider]} at ${pages.join(' and ')}`;
}

/**
 * LiteLLM against the catalogue, as findings.
 *
 * @param byProvider what `readLiteLlm` returned
 * @param core the built `@trazum/core`
 * @param sources `PROVIDER_SOURCES` from the built `pricing.js`
 * @param on the day the catalogue's rate in force is taken on
 */
export function compareLiteLlm(byProvider, core, sources, on = new Date()) {
  const findings = [];
  const compared = {};
  for (const provider of Object.keys(LITELLM_PROVIDERS)) {
    const theirs = byProvider[provider] ?? new Map();
    const ourModels = core.MODELS.filter((model) => model.provider === provider);
    const ours = new Map(ourModels.map((model) => [model.id, model]));
    const where = readFrom(provider, core, sources);
    if (theirs.size === 0) {
      findings.push({ provider, kind: 'unread', detail: `LiteLLM lists no chat model of provider "${LITELLM_PROVIDERS[provider]}", so nothing was compared; its file may have moved or changed shape` });
      continue;
    }
    let matched = 0;
    for (const [id, variants] of theirs) {
      const model = ours.get(id);
      if (model === undefined) {
        const first = variants[0];
        findings.push({
          provider,
          kind: 'missing',
          model: id,
          detail: `LiteLLM lists it (${first.key}, ${dollars(first.inputPerMTok)} in / ${dollars(first.outputPerMTok)} out per MTok) and the catalogue does not price it; ${where}`,
        });
        continue;
      }
      // A row the provider has retired is not compared: its page no longer
      // prices it, and LiteLLM keeps the figure it had.
      if (model.retired !== undefined && Date.parse(model.retired.on) <= on.getTime()) {
        findings.push({ provider, kind: 'note', model: id, detail: `retired in the catalogue on ${model.retired.on}, so its rates were not compared with LiteLLM's` });
        continue;
      }
      matched += 1;
      for (const theirRates of variants) {
        // Every rate the catalogue holds for this row that LiteLLM could be
        // quoting: the one in force on `on` (a promotion, a dated period), the
        // base, and each conditional tier (DeepSeek's peak hours, a long
        // prompt). Any one agreeing is agreement, and a tier says which.
        const force = core.effectivePricing(model, on);
        const candidates = [
          { label: undefined, input: force.inputPerMTok, output: force.outputPerMTok },
          { label: undefined, input: model.inputPerMTok, output: model.outputPerMTok },
          ...(model.tiers ?? []).map((tier) => ({ label: `the ${tier.id} tier`, input: tier.inputPerMTok, output: tier.outputPerMTok })),
        ];
        const ratio = core.multipliersFor(model, on).cacheRead;
        const cacheOf = (input) => perMTok((input * ratio) / 1e6);
        const via = new Set();
        const matches = (field, theirs) => {
          const hits = candidates.filter((candidate) => candidate[field] === theirs);
          if (hits.length === 0) return false;
          if (!hits.some((hit) => hit.label === undefined)) via.add(hits[0].label);
          return true;
        };
        const differences = [];
        if (!matches('input', theirRates.inputPerMTok)) differences.push(`input LiteLLM ${dollars(theirRates.inputPerMTok)}, catalogue ${dollars(force.inputPerMTok)}`);
        if (!matches('output', theirRates.outputPerMTok)) differences.push(`output LiteLLM ${dollars(theirRates.outputPerMTok)}, catalogue ${dollars(force.outputPerMTok)}`);
        // The catalogue states a cache-read ratio only on a row that sets one;
        // the default every row inherits is not a statement about this model.
        if (theirRates.cacheReadPerMTok !== undefined && model.multipliers?.cacheRead !== undefined) {
          const hit = candidates.find((candidate) => sameCache(theirRates.cacheReadPerMTok, cacheOf(candidate.input)));
          if (hit === undefined) differences.push(`cache read LiteLLM ${dollars(theirRates.cacheReadPerMTok)}, catalogue ${dollars(cacheOf(force.inputPerMTok))}`);
          else if (hit.label !== undefined && !candidates.some((c) => c.label === undefined && sameCache(theirRates.cacheReadPerMTok, cacheOf(c.input)))) via.add(hit.label);
        }
        if (differences.length === 0 && via.size > 0) {
          findings.push({ provider, kind: 'note', model: id, detail: `LiteLLM's rates (from ${theirRates.key}) match ${[...via].join(' and ')}, not the base row; ${where}` });
        }
        if (differences.length === 0) continue;
        const extras = [model.promo !== undefined && 'a promotion', model.history !== undefined && 'dated periods', model.tiers !== undefined && 'a long-prompt band'].filter(Boolean);
        const confirmed = CONFIRMED_DIFFERENCES[provider]?.[id];
        findings.push({
          provider,
          kind: confirmed === undefined ? 'differs' : 'note',
          model: id,
          detail: confirmed !== undefined ? `LiteLLM differs and the catalogue was confirmed right: ${confirmed}` : `${differences.join('; ')} (per MTok, from ${theirRates.key}); ${where}${extras.length > 0 ? `; the row also holds ${extras.join(', ')}, which LiteLLM may not` : ''}`,
        });
      }
    }
    compared[provider] = matched;
    for (const model of ourModels) {
      if (!theirs.has(model.id)) findings.push({ provider, kind: 'note', model: model.id, detail: 'in the catalogue and not listed by LiteLLM under this id, so not compared' });
    }
  }
  return { findings, compared };
}

/** The findings as the lines the terminal and the CI log show. */
export function render(findings, compared) {
  const order = { unread: 0, missing: 1, differs: 2, note: 3 };
  const label = { unread: 'UNREAD ', missing: 'MISSING', differs: 'DIFFERS', note: 'note   ' };
  const lines = [
    'LiteLLM is a signal, not a source: nothing below was copied, and each line says which page to re-read.',
    ...[...findings]
      .sort((a, b) => order[a.kind] - order[b.kind] || a.provider.localeCompare(b.provider) || (a.model ?? '').localeCompare(b.model ?? ''))
      .map((f) => `${label[f.kind]}  ${f.provider}${f.model ? ` ${f.model}` : ''}: ${f.detail}`),
  ];
  for (const [provider, count] of Object.entries(compared)) lines.push(`ok       ${provider}: ${count} catalogue model(s) matched by exact id`);
  lines.push(`note     not read here: ${Object.keys(PAGES).join(', ')} (price-drift.mjs reads their pages)`);
  return lines;
}

async function fetchList(url, attempts = 3) {
  let last;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(60_000) });
      if (response.ok) return await response.text();
      last = new Error(`HTTP ${response.status}`);
    } catch (error) {
      last = error;
    }
    if (attempt < attempts) await new Promise((done) => setTimeout(done, 2_000 * 2 ** (attempt - 1)));
  }
  throw last;
}

async function main(argv) {
  const reportOnly = argv.includes('--report');
  const index = argv.indexOf('--litellm-file');
  const file = index === -1 ? undefined : argv[index + 1];
  const core = await import(pathToFileURL(join(ROOT, 'packages/core/dist/index.js')).href);
  const { PROVIDER_SOURCES } = await import(PRICING_URL);
  let findings;
  let compared = {};
  try {
    const text = file === undefined ? await fetchList(LITELLM_URL) : readFileSync(file, 'utf8');
    ({ findings, compared } = compareLiteLlm(readLiteLlm(JSON.parse(text)), core, PROVIDER_SOURCES));
  } catch (error) {
    findings = [{ provider: 'litellm', kind: 'unread', detail: `${file ?? LITELLM_URL} could not be read: ${error.message}` }];
  }
  console.log(render(findings, compared).join('\n'));
  // Printed, never written: the report carries text read off a third party's file.
  const failing = findings.filter((f) => f.kind === 'unread' || f.kind === 'differs').length;
  if (failing > 0 && !reportOnly) {
    console.error(`\n${failing} finding(s). Re-read the provider's page named on each line and correct packages/core/src/pricing.ts by hand if it changed; this script never writes a price.`);
    process.exit(1);
  }
}

const invokedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedDirectly) await main(process.argv.slice(2));
