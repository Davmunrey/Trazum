import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';
import { formatUsd } from '../../core/dist/index.js';

/**
 * The HTML door, driven end to end — chapters one and two of the 1.64 arc.
 *
 * The file is for the person who does not run CLIs, so what is held here is
 * what they would be misled by: a figure that disagrees with `--json` (the
 * renderer is a projection, never a second computation), a caveat that got
 * greyed into a footnote (the caveats are furniture), a label from somebody's
 * log arriving as live markup (a label is exactly where `<script>` arrives),
 * and an external asset (a mail client strips it, a reader mistrusts it).
 *
 * Chapters three and four live here too: the roll-up door is held to the
 * same discipline, and the parity guard below walks every rendered figure
 * back to the document in both directions — proved by forging a page before
 * it was trusted, because a guard born green has proved nothing yet.
 */

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

const LOG = [
  '{"timestamp":"2026-08-01T09:14:22Z","model":"claude-opus-5","label":"support-rag","session":"c1","usage":{"input_tokens":1840,"output_tokens":412,"cache_read_input_tokens":18600,"cache_creation_input_tokens":600}}',
  '{"timestamp":"2026-08-01T10:00:00Z","model":"claude-opus-5","label":"<img src=x onerror=alert(1)>","usage":{"input_tokens":900,"output_tokens":100}}',
  '{"timestamp":"2026-08-02T09:14:22Z","model":"unknown-model-x","label":"classify","usage":{"input_tokens":500,"output_tokens":50}}',
  'not json at all',
].join('\n');

const run = (args, cwd) =>
  spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env: SPAWN_ENV, cwd, timeout: 60000, maxBuffer: 8 * 1024 * 1024 });

async function render(locale) {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-html-'));
  const log = join(dir, 'usage.jsonl');
  await writeFile(log, LOG);
  const out = join(dir, 'report.html');
  const result = run(['profile', log, '--html-out', out, '--json', '--locale', locale]);
  assert.equal(result.status, 0, result.stderr);
  return { html: await readFile(out, 'utf8'), document: JSON.parse(result.stdout) };
}

describe('the profile leaves the terminal', () => {
  it('writes one self-contained file whose figures are the documents own', async () => {
    const { html, document } = await render('en');

    // Self-contained: no scripts, no external stylesheet, no remote asset. A
    // report that phones anywhere is a report a mail client breaks and this
    // product has no business writing.
    assert.doesNotMatch(html, /<script/i);
    assert.doesNotMatch(html, /src\s*=\s*["']https?:/i);
    assert.doesNotMatch(html, /href\s*=\s*["']https?:/i);
    assert.doesNotMatch(html, /@import|url\(/i);

    // The headline dollars and the per-model rows are the JSON document's own
    // figures, formatted — not recomputed. formatUsd keeps sub-cent totals
    // exact, so a plain substring match is a real check, not a rounding one.
    const usd = formatUsd;
    assert.ok(html.includes(usd(document.total.totalUsd)), `headline ${usd(document.total.totalUsd)} not in the HTML`);
    for (const row of document.byModel) {
      assert.ok(html.includes(usd(row.breakdown.totalUsd)), `${row.model}: ${usd(row.breakdown.totalUsd)} not in the HTML`);
    }
    assert.ok(html.includes(document.total.calls.toLocaleString('en-US')));
  });

  it('escapes a hostile label into text, in every place it appears', async () => {
    const { html } = await render('en');
    assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'), 'the hostile label is missing entirely');
    assert.doesNotMatch(html, /<img/i);
  });

  it('renders in both locales from the same catalogue the terminal uses', async () => {
    const en = await render('en');
    assert.match(en.html, /What this report cannot say/);
    assert.match(en.html, /lang="en"/);
    const es = await render('es');
    assert.match(es.html, /Lo que este informe no puede decir/);
    assert.match(es.html, /lang="es"/);
  });
});

/**
 * Chapter four: the parity guard, both directions.
 *
 * Direction one — nothing invented: every dollar figure anywhere in the HTML,
 * and every count in a numeric table cell, must be the formatting of a value
 * that exists in the document the page was rendered from. Direction two —
 * nothing dropped: the headline figures of the document must reach the page.
 * Both checkers are then handed the failure they exist for, because a parity
 * guard born green on a correct renderer has proved nothing yet.
 */
const numericLeaves = (node, out = []) => {
  if (typeof node === 'number' && Number.isFinite(node)) out.push(node);
  else if (Array.isArray(node)) for (const item of node) numericLeaves(item, out);
  else if (node !== null && typeof node === 'object') for (const value of Object.values(node)) numericLeaves(value, out);
  return out;
};

/** Every rendered figure the document cannot account for — empty on parity. */
function invented(html, document, numberLocale) {
  const leaves = numericLeaves(document);
  const dollars = new Set();
  const counts = new Set(['—']);
  for (const leaf of leaves) {
    dollars.add(formatUsd(leaf));
    dollars.add(formatUsd(-leaf));
    if (Number.isInteger(leaf)) {
      counts.add(leaf.toLocaleString(numberLocale));
      counts.add(Math.abs(leaf).toLocaleString(numberLocale));
    }
  }
  const out = [];
  for (const [token] of html.matchAll(/\$\d[\d,]*(?:\.\d+)?/g)) {
    if (!dollars.has(token)) out.push(token);
  }
  for (const [, cell] of html.matchAll(/<td class="n">([^<]+)<\/td>/g)) {
    if (cell.startsWith('$') || cell.endsWith('%')) continue;
    if (!counts.has(cell)) out.push(cell);
  }
  return out;
}

/** Headline figures of the document that never reached the page. */
function dropped(html, document, numberLocale) {
  const must = [formatUsd(document.total.totalUsd), document.total.calls.toLocaleString(numberLocale)];
  for (const row of document.byLabel ?? []) must.push(formatUsd(row.breakdown.totalUsd));
  for (const row of document.byModel ?? []) must.push(formatUsd(row.breakdown.totalUsd));
  return must.filter((token) => !html.includes(token));
}

describe('the parity guard walks every figure back to the document', () => {
  it('holds the profile page: nothing invented, nothing dropped', async () => {
    const { html, document } = await render('en');
    assert.deepEqual(invented(html, document, 'en-US'), [], 'figures in the HTML the document cannot account for');
    assert.deepEqual(dropped(html, document, 'en-US'), [], 'headline figures that never reached the HTML');
  });

  it('holds the roll-up page the same way', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'trazum-html-'));
    const log = join(dir, 'usage.jsonl');
    await writeFile(log, LOG);
    const profiled = run(['profile', log, '--json']);
    assert.equal(profiled.status, 0, profiled.stderr);
    const contribution = join(dir, 'team-a.json');
    await writeFile(contribution, profiled.stdout);
    const out = join(dir, 'rollup.html');
    const rolled = run(['rollup', contribution, '--html-out', out, '--json']);
    assert.equal(rolled.status, 0, rolled.stderr);
    const document = JSON.parse(rolled.stdout);
    const html = await readFile(out, 'utf8');
    assert.match(html, /class="caveats"/);
    assert.deepEqual(invented(html, document, 'en-US'), [], 'figures in the roll-up HTML its document cannot account for');
    assert.deepEqual(dropped(html, document, 'en-US'), [], 'headline figures that never reached the roll-up HTML');
  });

  it('and each direction is proved by the failure it exists for', async () => {
    const { html, document } = await render('en');
    // A renderer that invents a dollar: the checker names it.
    const legit = formatUsd(document.total.totalUsd);
    const forged = html.replace(legit, '$9,999.1234');
    assert.deepEqual(invented(forged, document, 'en-US'), ['$9,999.1234']);
    // A renderer that drops the headline everywhere: the checker names that
    // too. replaceAll, because the one priced model's row legitimately equals
    // the total — the first draft replaced one occurrence and called the
    // survivor a failure of the guard rather than a fact about the fixture.
    const gone = html.replaceAll(legit, '$9,999.1234');
    assert.ok(dropped(gone, document, 'en-US').includes(legit));
    // And an invented count in a table cell does not hide behind the dollars.
    const forgedCell = html.replace(/<td class="n">1<\/td>/, '<td class="n">777</td>');
    assert.ok(invented(forgedCell, document, 'en-US').includes('777'));
  });
});

describe('the caveats are furniture, not footnotes', () => {
  it('names the unpriced model and the unreadable line inside the caveat block', async () => {
    const { html, document } = await render('en');
    const block = /<div class="caveats">([\s\S]*?)<\/div>/.exec(html);
    assert.ok(block, 'the caveat block is missing');
    // The block carries the content, not just a heading somebody can restyle
    // away: the unpriced model by name, and the skipped line by number.
    assert.ok(block[1].includes('unknown-model-x'), 'the unpriced model is not named in the caveats');
    for (const line of document.skippedLines) {
      assert.ok(block[1].includes(String(line)), `skipped line ${line} is not named in the caveats`);
    }
  });

  it('renders the caveats before the detail tables, where a skimmer still is', async () => {
    const { html } = await render('en');
    const caveatAt = html.indexOf('class="caveats"');
    const firstTable = html.indexOf('<table');
    assert.ok(caveatAt !== -1 && firstTable !== -1);
    assert.ok(caveatAt < firstTable, 'the caveat block sits below the tables — a footnote by position');
  });

  it('and a clean fully-priced log earns a report with no caveat block', async () => {
    /**
     * The other direction: a block that always renders is furniture nobody
     * reads. On a log with prices for everything, timestamps, sessions and
     * no torn lines, there is nothing the report cannot say — and saying so
     * anyway would train readers to skip the box that matters.
     */
    const dir = await mkdtemp(join(tmpdir(), 'trazum-html-'));
    const log = join(dir, 'clean.jsonl');
    await writeFile(
      log,
      '{"timestamp":"2026-08-01T09:14:22Z","model":"claude-opus-5","label":"a","session":"c1","usage":{"input_tokens":100,"output_tokens":10}}\n',
    );
    // A freshly-reviewed pricing overlay, because the bundled table's age is
    // itself a truthful caveat — the first version of this test assumed a
    // clean log meant a clean run, and the report rightly disagreed.
    const pricing = join(dir, 'pricing.json');
    await writeFile(
      pricing,
      '{"lastReviewed":"2099-01-01","models":{"claude-opus-5":{"inputPerMTok":5,"outputPerMTok":25}}}',
    );
    const out = join(dir, 'report.html');
    const result = run(['profile', log, '--html-out', out, '--pricing', pricing]);
    assert.equal(result.status, 0, result.stderr);
    const html = await readFile(out, 'utf8');
    assert.doesNotMatch(html, /class="caveats"/);
  });
});
