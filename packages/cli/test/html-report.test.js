import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

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
 * The full both-directions parity walk is the arc's chapter four; what is
 * asserted here already refuses the failures chapter one can produce.
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
    const usd = (value) => {
      const s = `$${value.toFixed(4)}`;
      return s.endsWith('00') ? `$${value.toFixed(2)}` : s;
    };
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
