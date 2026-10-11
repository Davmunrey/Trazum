import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';
import { formatUsd } from '../../core/dist/index.js';

/**
 * The PDF door, and the bill's other envelopes.
 *
 * The PDF is the file most likely to be read by somebody who never saw the
 * terminal, so it is held to the HTML door's rules: its figures are the
 * document's own, the caveats sit ahead of the tables, an unpriced model is a
 * dash and never `$0`, and a label from somebody's log is text. Then `bill`,
 * which until now could only print a receipt for a machine, is held to
 * writing the same four files `profile` writes, from the same report.
 */

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

const LOG = [
  '{"timestamp":"2026-08-01T09:14:22Z","model":"claude-opus-5","label":"support-rag","session":"c1","usage":{"input_tokens":1840,"output_tokens":412,"cache_read_input_tokens":18600,"cache_creation_input_tokens":600}}',
  '{"timestamp":"2026-08-01T10:00:00Z","model":"claude-sonnet-5-5","label":"(evil) label\\\\","usage":{"input_tokens":900,"output_tokens":100}}',
  '{"timestamp":"2026-08-02T09:14:22Z","model":"unknown-model-x","label":"classify","usage":{"input_tokens":500,"output_tokens":50}}',
  'not json at all',
].join('\n');

const run = (args) =>
  spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env: SPAWN_ENV, timeout: 60000, maxBuffer: 8 * 1024 * 1024 });

/** The text a viewer would show: every string drawn with Tj, unescaped. */
function shown(pdf) {
  const strings = [];
  for (const [, raw] of pdf.matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)) {
    strings.push(
      raw
        .replace(/\\([0-7]{3})/g, (_, octal) => String.fromCharCode(parseInt(octal, 8)))
        .replace(/\\(.)/g, '$1'),
    );
  }
  return strings;
}

async function scratch(log = LOG) {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-pdf-'));
  const path = join(dir, 'usage.jsonl');
  await writeFile(path, log);
  return { dir, path };
}

describe('profile --pdf-out', () => {
  it('writes a PDF whose figures are the document’s own', async () => {
    const { dir, path } = await scratch();
    const out = join(dir, 'report.pdf');
    const result = run(['profile', path, '--pdf-out', out, '--json']);
    assert.equal(result.status, 0, result.stderr);
    const document = JSON.parse(result.stdout);
    const pdf = await readFile(out, 'latin1');
    assert.ok(pdf.startsWith('%PDF-1.4\n') && pdf.endsWith('%%EOF\n'));
    const text = shown(pdf);
    const all = text.join('\n');
    assert.ok(all.includes(formatUsd(document.total.totalUsd)), 'the headline is missing');
    for (const row of document.byModel) {
      if (document.unpricedModels.includes(row.model)) continue;
      assert.ok(all.includes(formatUsd(row.breakdown.totalUsd)), `${row.model} is missing its dollars`);
    }
    // Under --json the notice goes to stderr, so stdout stays one document.
    assert.match(result.stderr, /PDF report written to/);
  });

  it('puts the caveats ahead of the tables and names what they are about', async () => {
    const { dir, path } = await scratch();
    const out = join(dir, 'report.pdf');
    assert.equal(run(['profile', path, '--pdf-out', out]).status, 0);
    const text = shown(await readFile(out, 'latin1'));
    const caveats = text.indexOf('What this report cannot say');
    const firstTable = text.indexOf('By workload');
    assert.ok(caveats > 0 && caveats < firstTable, 'the caveat block is not ahead of the tables');
    assert.ok(text.some((line) => line.includes('unknown-model-x')), 'the unpriced model is not named');
  });

  it('shows an unpriced model as a dash, never as $0', async () => {
    const { dir, path } = await scratch();
    const out = join(dir, 'report.pdf');
    assert.equal(run(['profile', path, '--pdf-out', out]).status, 0);
    const text = shown(await readFile(out, 'latin1'));
    const row = text.indexOf('unknown-model-x', text.indexOf('By model'));
    assert.ok(row > 0);
    // name, calls, input, cache reads, cache writes, output, USD, %
    assert.equal(text[row + 6], '\x97', 'the unpriced model’s dollars are not a dash');
    assert.equal(text[row + 7], '\x97');
  });

  it('keeps a hostile label as text: parentheses and backslashes cannot end the string', async () => {
    const { dir, path } = await scratch();
    const out = join(dir, 'report.pdf');
    assert.equal(run(['profile', path, '--pdf-out', out]).status, 0);
    const pdf = await readFile(out, 'latin1');
    assert.ok(pdf.includes('(\\(evil\\) label\\\\) Tj'), 'the label was not escaped');
    assert.ok(shown(pdf).includes('(evil) label\\'));
  });

  it('speaks Spanish from the same catalogue, accents included', async () => {
    const { dir, path } = await scratch();
    const out = join(dir, 'informe.pdf');
    assert.equal(run(['profile', path, '--pdf-out', out, '--locale', 'es']).status, 0);
    const text = shown(await readFile(out, 'latin1'));
    assert.ok(text.includes('Adónde fue el dinero'), 'the Spanish title is missing');
    assert.ok(text.some((line) => /p\xe1gina 1 de 1/.test(line)));
  });

  it('breaks a long bill across pages, numbering each and repeating the table header', async () => {
    const rows = [];
    for (let i = 0; i < 90; i += 1) {
      rows.push(JSON.stringify({ model: 'claude-opus-5', label: `workload-${String(i).padStart(2, '0')}`, usage: { input_tokens: 1000 + i, output_tokens: 100 } }));
    }
    const { dir, path } = await scratch(rows.join('\n'));
    const out = join(dir, 'long.pdf');
    assert.equal(run(['profile', path, '--pdf-out', out]).status, 0);
    const pdf = await readFile(out, 'latin1');
    const pages = Number(/\/Count (\d+)/.exec(pdf)[1]);
    assert.ok(pages >= 2, `a 90-row table fit on ${pages} page`);
    const text = shown(pdf);
    assert.ok(text.includes(`page ${pages} of ${pages}`));
    assert.ok(text.filter((line) => line === 'workload').length >= 2, 'the table header did not repeat');
    for (let i = 0; i < 90; i += 1) assert.ok(text.includes(`workload-${String(i).padStart(2, '0')}`), `row ${i} was lost`);
  });
});

describe('bill writes the envelopes profile writes', () => {
  it('PDF, HTML, Markdown and CSV, from the report it priced', async () => {
    const { dir, path } = await scratch();
    const files = {
      pdf: join(dir, 'bill.pdf'),
      html: join(dir, 'bill.html'),
      md: join(dir, 'bill.md'),
      csv: join(dir, 'bill.csv'),
    };
    const result = run([
      'bill', path,
      '--pdf-out', files.pdf, '--html-out', files.html, '--markdown-out', files.md, '--csv-out', files.csv,
    ]);
    assert.equal(result.status, 0, result.stderr);
    const receipt = JSON.parse(result.stdout);
    const total = receipt.lines.reduce((sum, line) => sum + line.usd, 0);

    const pdf = shown(await readFile(files.pdf, 'latin1')).join('\n');
    const html = await readFile(files.html, 'utf8');
    const md = await readFile(files.md, 'utf8');
    for (const [name, body] of [['pdf', pdf], ['html', html], ['md', md]]) {
      assert.ok(body.includes(formatUsd(total)), `${name} does not carry the receipt's total ${formatUsd(total)}`);
    }
    assert.match(await readFile(files.csv, 'utf8'), /^label,model,calls/);

    // Each file is announced as what it is.
    assert.match(result.stderr, /PDF report written to/);
    assert.match(result.stderr, /HTML report written to/);
    assert.equal((result.stderr.match(/Report written to/g) ?? []).length, 2);
    assert.doesNotMatch(result.stderr, /Optimised prompt/);
  });

  it('refuses a CSV shape it does not know, as profile does', async () => {
    const { dir, path } = await scratch();
    const result = run(['bill', path, '--csv-out', join(dir, 'x.csv'), '--csv-shape', 'weekly']);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /weekly/);
    // Refused before reading: no receipt printed for a run that then fails.
    assert.equal(result.stdout, '');
  });
});

describe('the HTML door shows an unpriced model the same way', () => {
  it('as a dash, never as $0', async () => {
    const { dir, path } = await scratch();
    const out = join(dir, 'report.html');
    assert.equal(run(['profile', path, '--html-out', out]).status, 0);
    const html = await readFile(out, 'utf8');
    const row = /<tr><td>unknown-model-x<\/td>(.*?)<\/tr>/.exec(html);
    assert.ok(row, 'the unpriced model has no row');
    assert.doesNotMatch(row[1], /\$0/);
    assert.match(row[1], /<td class="n">—<\/td><td class="n">—<\/td>$/);
  });
});
