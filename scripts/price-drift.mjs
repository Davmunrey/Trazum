#!/usr/bin/env node
/**
 * Every price the catalogue holds, compared with the provider's own page, today.
 *
 *   node scripts/price-drift.mjs            # read the pages; exit 1 on any finding
 *   node scripts/price-drift.mjs --report   # the same report, always exit 0
 *   node scripts/price-drift.mjs --anthropic-file a.md --openai-file o.md
 *                                           # offline, from copies saved earlier
 *
 * ## Why this exists
 *
 * A price is read off a page on a date, and the page changes without telling
 * anyone. `scripts/freshness.mjs` measures how long ago each provider was read;
 * it cannot say whether anything changed since. Three of the corrections in
 * 2.7.1 were prices a provider had published weeks earlier: OpenAI's 12-hour
 * cache write, Anthropic's fast mode, and twenty models already on the pricing
 * pages. Each was found by a person re-reading, and until then every bill that
 * touched them was low.
 *
 * Anthropic and OpenAI publish their pricing pages as Markdown tables, which a
 * script can read as reliably as a person. This one reads both and reports:
 *
 * - **drift**: a figure on the page that the catalogue prices differently;
 * - **missing**: a model on the page the catalogue does not price at all, so
 *   every call to it reads as unpriced;
 * - **unread**: a page that could not be fetched, or whose tables are no longer
 *   where this script looks. A check that silently passes because it read
 *   nothing would be worse than no check, so this is a finding too;
 * - **note**: a catalogue model the page no longer lists, and a model the page
 *   lists that is deliberately left unpriced (`DELIBERATELY_UNPRICED`).
 *
 * ## What it never does
 *
 * It never writes a price. A finding is a reason for a person to re-read the
 * page and change `packages/core/src/pricing.ts` by hand, with the page quoted
 * in the row's comment, as every other price here was. A figure a script
 * copied into the catalogue is a figure nobody read.
 *
 * The other providers (Google, DeepSeek, Moonshot, xAI, Mistral) do not publish
 * tables a script can read reliably, so they stay with `freshness.mjs` and a
 * person; the report says so rather than implying they were checked.
 *
 * The weekly CI run calls it, so a change on a provider's page fails on main,
 * where GitHub notifies the owner, within a week instead of whenever somebody
 * next re-reads. Reads the built `@trazum/core` (run `npm run build` first).
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The pages, in the Markdown form each provider serves. */
export const PAGES = {
  anthropic: 'https://platform.claude.com/docs/en/about-claude/pricing.md',
  openai: 'https://developers.openai.com/api/docs/pricing.md',
};

/**
 * Models a page lists that the catalogue does not price, on purpose.
 *
 * Each entry is a decision with its reason, reported as a note on every run so
 * it stays visible. Without this, the only way to quiet a finding would be to
 * price something nobody can buy or to stop checking.
 */
export const DELIBERATELY_UNPRICED = {
  openai: {
    // Read 2026-11-05. Each is behind an approval programme and has no model
    // page (each returned 404), so there is no context window to give a row,
    // and a row without one would be a guess.
    'gpt-5.5-cyber': 'Daybreak programme only, and no model page to read a context window from',
    'gpt-6-rosalind': 'trusted-access programme only, and no model page to read a context window from',
    'gpt-rosalind-research': 'trusted-access programme only, and no model page to read a context window from',
    'gpt-rosalind-discovery': 'trusted-access programme only, and no model page to read a context window from',
    // On the "Specialized models" table; its model page returned 404 the same day.
    'gpt-5-search-api': 'no model page to read a context window from',
  },
  anthropic: {},
};

/**
 * Every Markdown table in a page, with the heading it sits under.
 *
 * A table is a header row, a `| --- |` separator and the rows after it. The
 * heading is the nearest line starting with `#` above it, which is how both
 * pages label what a table prices.
 */
export function markdownTables(markdown) {
  const lines = markdown.split(/\r?\n/);
  const tables = [];
  let heading = '';
  const cells = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^#{1,6}\s/.test(line)) {
      heading = line.replace(/^#+\s*/, '').trim();
      continue;
    }
    if (!line.trim().startsWith('|') || !/^\s*\|\s*:?-{3,}/.test(lines[i + 1] ?? '')) continue;
    const header = cells(line);
    const rows = [];
    let j = i + 2;
    for (; j < lines.length && lines[j].trim().startsWith('|'); j += 1) rows.push(cells(lines[j]));
    tables.push({ heading, header, rows });
    i = j - 1;
  }
  return tables;
}

/**
 * Markup out of a table cell: footnotes (`<sup>2</sup>`) with their text, any
 * other tag, and then any angle bracket left. Repeated until nothing changes,
 * because one pass over `<<b>sup>` leaves a tag behind; the text is printed and
 * never rendered, and a page is still not trusted to be well formed.
 */
function untag(cell) {
  let text = cell;
  let previous;
  do {
    previous = text;
    text = text.replace(/<sup>[^<]*<\/sup>/g, '').replace(/<[^<>]*>/g, '');
  } while (text !== previous);
  return text.replace(/[<>]/g, '');
}

/** `$0.20 / MTok<sup>2</sup>` → 0.2; `-` or anything without a dollar figure → undefined. */
export function dollars(cell) {
  const match = /\$\s*([\d,]*\.?\d+)/.exec(untag(cell));
  return match === null ? undefined : Number(match[1].replace(/,/g, ''));
}

/** A model cell as a person reads it: links to their text, footnotes and tags gone. */
export function plainName(cell) {
  return untag(cell)
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

const column = (header, ...names) => header.findIndex((cell) => names.some((name) => cell.toLowerCase() === name.toLowerCase()));

/**
 * Anthropic's pricing page as rows: one per model and band.
 *
 * The model table gives input, both cache writes, the cache hit and output;
 * the batch table gives batch input and output; the fast-mode table gives the
 * fast rates. Claude Haiku 5.5 appears twice in each, once per prompt-length
 * band, and is read as the base band and the long one.
 */
export function readAnthropic(markdown) {
  const rows = new Map();
  const row = (name, band) => {
    const key = `${name}\u0000${band}`;
    if (!rows.has(key)) rows.set(key, { name, band, rates: {} });
    return rows.get(key).rates;
  };
  const nameAndBand = (cell) => {
    const text = plainName(cell);
    const banded = /\(for prompts (up to|over) [\d,]+ tokens\)/i.exec(text);
    const name = text.replace(/\s*\(.*\)\s*$/, '').trim();
    return { name, band: banded === null ? 'base' : banded[1].toLowerCase() === 'over' ? 'long' : 'base' };
  };
  let sawModels = false;
  let sawBatch = false;
  let sawFast = false;
  for (const table of markdownTables(markdown)) {
    const { header } = table;
    const model = column(header, 'Model');
    if (model !== 0) continue;
    const input = column(header, 'Base input tokens');
    const output = column(header, 'Output tokens');
    if (input > 0 && output > 0 && !sawModels) {
      sawModels = true;
      const write5m = column(header, '5m cache writes');
      const write1h = column(header, '1h cache writes');
      const hit = column(header, 'Cache hits and refreshes');
      for (const cells of table.rows) {
        const { name, band } = nameAndBand(cells[model]);
        const rates = row(name, band);
        rates.input = dollars(cells[input]);
        rates.output = dollars(cells[output]);
        if (write5m > 0) rates.write5m = dollars(cells[write5m]);
        if (write1h > 0) rates.write1h = dollars(cells[write1h]);
        if (hit > 0) rates.hit = dollars(cells[hit]);
      }
      continue;
    }
    const batchInput = column(header, 'Batch input');
    const batchOutput = column(header, 'Batch output');
    if (batchInput > 0 && batchOutput > 0 && !sawBatch) {
      sawBatch = true;
      for (const cells of table.rows) {
        const { name, band } = nameAndBand(cells[model]);
        const rates = row(name, band);
        rates.batchInput = dollars(cells[batchInput]);
        rates.batchOutput = dollars(cells[batchOutput]);
      }
      continue;
    }
    if (/fast mode/i.test(table.heading) && header.length === 3 && !sawFast) {
      sawFast = true;
      const fastInput = column(header, 'Input');
      const fastOutput = column(header, 'Output');
      for (const cells of table.rows) {
        for (const name of plainName(cells[model]).split(' / ')) {
          const rates = row(name.trim(), 'fast');
          rates.input = dollars(cells[fastInput]);
          rates.output = dollars(cells[fastOutput]);
        }
      }
    }
  }
  const unread = [];
  if (!sawModels) unread.push('the model pricing table (a "Base input tokens" column) is not on the page');
  if (!sawBatch) unread.push('the batch table (a "Batch input" column) is not on the page');
  if (!sawFast) unread.push('the fast-mode table (under a "Fast mode" heading) is not on the page');
  return { rows: [...rows.values()], unread };
}

/**
 * OpenAI's pricing page as rows: one per model, short band and long.
 *
 * The text-token prices sit in tables under every "Standard pricing data"
 * heading (flagship models and each specialised family) and in the first
 * "Batch" section. A model cell can carry a note, as in
 * `gpt-5.5 (<272K context length)`; the id is the text before it.
 */
export function readOpenAi(markdown) {
  const rows = new Map();
  const row = (name) => {
    if (!rows.has(name)) rows.set(name, { name, band: 'base', rates: {} });
    return rows.get(name).rates;
  };
  const textTable = (header) => column(header, 'Model') === 0
    && (column(header, 'Short context input') > 0 || (column(header, 'Input') > 0 && column(header, 'Cached input') > 0));
  let standard = 0;
  let batch = 0;
  let specialized = false;
  for (const table of markdownTables(markdown)) {
    /*
     * "Specialized models": a Category column before Model, the Codex, ChatGPT
     * and search models among embeddings and moderation. The first such table
     * is the standard one (a "Fast" one with the same header follows). Rows
     * without an output price are not chat models and are skipped.
     */
    const specialModel = column(table.header, 'Model');
    if (!specialized && column(table.header, 'Category') === 0 && specialModel === 1
      && column(table.header, 'Input') > 1 && column(table.header, 'Cached input') > 1) {
      specialized = true;
      const at = { input: column(table.header, 'Input'), output: column(table.header, 'Output'), hit: column(table.header, 'Cached input') };
      for (const cells of table.rows) {
        const output = dollars(cells[at.output] ?? '');
        if (output === undefined) continue;
        standard += 1;
        Object.assign(row(plainName(cells[specialModel])), { input: dollars(cells[at.input]), output, hit: dollars(cells[at.hit]) });
      }
      continue;
    }
    const kind = /^standard pricing data$/i.test(table.heading) ? 'standard' : /^batch$/i.test(table.heading) ? 'batch' : undefined;
    if (kind === undefined || !textTable(table.header)) continue;
    const { header } = table;
    const pick = (...names) => column(header, ...names);
    const at = {
      input: pick('Short context input', 'Input'),
      output: pick('Short context output', 'Output'),
      hit: pick('Short context cached input', 'Cached input'),
      write5m: pick('Short context 30m write'),
      write1h: pick('Short context 12h write'),
      longInput: pick('Long context input'),
      longOutput: pick('Long context output'),
      longHit: pick('Long context cached input'),
    };
    for (const cells of table.rows) {
      const name = plainName(cells[0]).replace(/\s*\(.*\)\s*$/, '').trim();
      const rates = row(name);
      const read = (index) => (index > 0 ? dollars(cells[index]) : undefined);
      if (kind === 'standard') {
        standard += 1;
        Object.assign(rates, {
          input: read(at.input),
          output: read(at.output),
          hit: read(at.hit),
          write5m: read(at.write5m),
          write1h: read(at.write1h),
          longInput: read(at.longInput),
          longOutput: read(at.longOutput),
          longHit: read(at.longHit),
        });
      } else {
        batch += 1;
        Object.assign(rates, {
          batchInput: read(at.input),
          batchOutput: read(at.output),
          batchLongInput: read(at.longInput),
          batchLongOutput: read(at.longOutput),
        });
      }
    }
  }
  const unread = [];
  if (standard === 0) unread.push('no text-token table under a "Standard pricing data" heading');
  if (batch === 0) unread.push('no text-token table under a "Batch" heading');
  if (!specialized) unread.push('no "Specialized models" table (Category, Model, Input, Output, Cached input)');
  return { rows: [...rows.values()], unread };
}

const same = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
const money = (value) => `$${Number(value.toFixed(6))}`;

/** The prompt size that lands a request in a model's long band, if it has one. */
function longBand(model) {
  for (const tier of model.tiers ?? []) {
    if (tier.when.kind === 'input-tokens-above') return tier.when.tokens + 1;
    if (tier.when.kind === 'input-tokens-at-least') return tier.when.tokens;
  }
  return undefined;
}

/**
 * The page's rows against the catalogue: the findings, and how many catalogue
 * models the page priced.
 *
 * `core` is the built `@trazum/core`; `now` is the instant whose rates are
 * compared (a row's `history` can price an earlier day differently, and the
 * page is about today).
 */
export function compare(provider, page, core, now = new Date(), deliberately = DELIBERATELY_UNPRICED[provider] ?? {}) {
  const findings = page.unread.map((detail) => ({ provider, kind: 'unread', detail }));
  const models = core.MODELS.filter((model) => model.provider === provider);
  const find = (name) => (provider === 'openai'
    ? core.BUNDLED_CATALOGUE.byId.get(name)
    : models.find((model) => model.displayName.toLowerCase() === name.toLowerCase()));
  const seen = new Set();
  for (const { name, band, rates } of page.rows) {
    const model = find(name);
    if (model === undefined || model.provider !== provider) {
      if (band !== 'base') continue;
      if (name in deliberately) findings.push({ provider, kind: 'note', model: name, detail: `on the page, left unpriced on purpose: ${deliberately[name]}` });
      else findings.push({ provider, kind: 'missing', model: name, detail: `on the page at ${money(rates.input ?? 0)}/${money(rates.output ?? 0)} and not in the catalogue, so every call to it reads as unpriced` });
      continue;
    }
    seen.add(model.id);
    const m = core.multipliersFor(model, now);
    const check = (field, published, priced) => {
      if (published === undefined) return;
      if (priced === undefined) {
        findings.push({ provider, kind: 'drift', model: model.id, detail: `${field}: the page publishes ${money(published)}, the catalogue has no such rate` });
      } else if (!same(published, priced)) {
        findings.push({ provider, kind: 'drift', model: model.id, detail: `${field}: the page says ${money(published)}, the catalogue prices ${money(priced)}` });
      }
    };
    const cached = (input) => (model.caching === 'none' ? undefined : input * m.cacheRead);
    if (band === 'fast') {
      const fast = core.effectivePricing(model, now, { inputTokens: 1000, speed: 'fast' });
      const fastApplied = fast.tier?.applied === 'fast';
      check('fast input', rates.input, fastApplied ? fast.inputPerMTok : undefined);
      check('fast output', rates.output, fastApplied ? fast.outputPerMTok : undefined);
      continue;
    }
    const long = longBand(model);
    if (band === 'long') {
      const priced = long === undefined ? undefined : core.effectivePricing(model, now, { inputTokens: long });
      check('long-prompt input', rates.input, priced?.inputPerMTok);
      check('long-prompt output', rates.output, priced?.outputPerMTok);
      check('long-prompt 5-minute write', rates.write5m, priced && priced.inputPerMTok * m.cacheWrite5m);
      check('long-prompt 1-hour write', rates.write1h, priced && priced.inputPerMTok * m.cacheWrite1h);
      check('long-prompt cache hit', rates.hit, priced && cached(priced.inputPerMTok));
      check('long-prompt batch input', rates.batchInput, priced && priced.inputPerMTok * m.batch);
      check('long-prompt batch output', rates.batchOutput, priced && priced.outputPerMTok * m.batch);
      continue;
    }
    const base = core.effectivePricing(model, now, { inputTokens: 1000 });
    const writes = provider === 'openai' ? ['30-minute write', '12-hour write'] : ['5-minute write', '1-hour write'];
    check('input', rates.input, base.inputPerMTok);
    check('output', rates.output, base.outputPerMTok);
    check('cache hit', rates.hit, cached(base.inputPerMTok));
    check(writes[0], rates.write5m, base.inputPerMTok * m.cacheWrite5m);
    check(writes[1], rates.write1h, m.cacheWrite1h === null || m.cacheWrite1h === undefined ? undefined : base.inputPerMTok * m.cacheWrite1h);
    check('batch input', rates.batchInput, m.batch === null || m.batch === undefined ? undefined : base.inputPerMTok * m.batch);
    check('batch output', rates.batchOutput, m.batch === null || m.batch === undefined ? undefined : base.outputPerMTok * m.batch);
    if (rates.longInput !== undefined || rates.longOutput !== undefined) {
      const priced = long === undefined ? undefined : core.effectivePricing(model, now, { inputTokens: long });
      check('long-context input', rates.longInput, priced?.inputPerMTok);
      check('long-context output', rates.longOutput, priced?.outputPerMTok);
      check('long-context cache hit', rates.longHit, priced && cached(priced.inputPerMTok));
      check('long-context batch input', rates.batchLongInput, priced && m.batch != null ? priced.inputPerMTok * m.batch : undefined);
      check('long-context batch output', rates.batchLongOutput, priced && m.batch != null ? priced.outputPerMTok * m.batch : undefined);
    }
  }
  for (const model of models) {
    if (!seen.has(model.id)) findings.push({ provider, kind: 'note', model: model.id, detail: 'priced here and not listed on the page (retired, renamed or limited availability?)' });
  }
  return { findings, compared: seen.size };
}

/** The findings as the lines the terminal and the CI log show. */
export function render(findings, checked) {
  const order = { unread: 0, missing: 1, drift: 2, note: 3 };
  const label = { unread: 'UNREAD ', missing: 'MISSING', drift: 'DRIFT  ', note: 'note   ' };
  const lines = [...findings]
    .sort((a, b) => order[a.kind] - order[b.kind] || a.provider.localeCompare(b.provider) || (a.model ?? '').localeCompare(b.model ?? ''))
    .map((f) => `${label[f.kind]}  ${f.provider}${f.model ? ` ${f.model}` : ''}: ${f.detail}`);
  for (const [provider, count] of Object.entries(checked)) {
    lines.push(`ok       ${provider}: ${count} catalogue model(s) compared with the page`);
  }
  lines.push('note     google, deepseek, moonshot, xai, mistral: no machine-readable page; re-read by a person (see freshness.mjs)');
  return lines;
}

async function fetchPage(url, attempts = 3) {
  let last;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { accept: 'text/markdown, text/plain;q=0.9' }, signal: AbortSignal.timeout(30_000) });
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
  const fileFor = (flag) => {
    const index = argv.indexOf(flag);
    return index === -1 ? undefined : argv[index + 1];
  };
  const core = await import(pathToFileURL(join(ROOT, 'packages/core/dist/index.js')).href);
  const readers = { anthropic: readAnthropic, openai: readOpenAi };
  const findings = [];
  const checked = {};
  for (const [provider, url] of Object.entries(PAGES)) {
    let markdown;
    const file = fileFor(`--${provider}-file`);
    try {
      markdown = file === undefined ? await fetchPage(url) : readFileSync(file, 'utf8');
    } catch (error) {
      findings.push({ provider, kind: 'unread', detail: `${file ?? url} could not be read: ${error.message}` });
      continue;
    }
    const { findings: found, compared } = compare(provider, readers[provider](markdown), core);
    findings.push(...found);
    checked[provider] = compared;
  }
  const lines = render(findings, checked);
  const text = lines.join('\n');
  console.log(text);
  // Printed, never written to a file: the report carries text read off a web
  // page, and the CI log is where it is read.
  const failing = findings.filter((f) => f.kind !== 'note').length;
  if (failing > 0 && !reportOnly) {
    console.error(`\n${failing} finding(s). Re-read the page and correct packages/core/src/pricing.ts by hand; this script never writes a price.`);
    process.exit(1);
  }
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedDirectly) await main(process.argv.slice(2));
