import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

/**
 * `bill --since/--until`: a period's bill.
 *
 * A Claude Code folder holds every session since the tool was installed, and
 * `bill` with no window answers "what has this ever cost", which is rarely the
 * question. The window is `profile`'s, read the same way: a bare day is the
 * whole of that UTC day, and the window is half-open, so two adjacent periods
 * share no call and add up to the whole.
 *
 * The log: one Sonnet 5.5 call of 1,000,000 input tokens on each of 2026-09-30
 * and 2026-10-01 ($2.00 each at $2 per million), and one more on 2026-10-31 at
 * 23:59:59. A fourth line with no timestamp is added where the test needs it.
 */

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

const call = (ts) =>
  JSON.stringify({ ...(ts ? { ts } : {}), model: 'claude-sonnet-5-5', usage: { input_tokens: 1_000_000, output_tokens: 0 } });
const DATED = [call('2026-09-30T12:00:00Z'), call('2026-10-01T00:00:00Z'), call('2026-10-31T23:59:59Z')];

const run = (args) =>
  spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    env: { ...SPAWN_ENV, TRAZUM_LOCALE: 'en' },
    timeout: 60000,
    maxBuffer: 8 * 1024 * 1024,
  });

async function scratch(lines) {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-bill-window-'));
  const path = join(dir, 'usage.jsonl');
  await writeFile(path, lines.join('\n'));
  return { dir, path };
}

const receipt = (args) => {
  const result = run([...args, '--receipt']);
  assert.equal(result.status, 0, result.stderr);
  return { document: JSON.parse(result.stdout), stderr: result.stderr };
};
const flat = (text) => text.replace(/\s+/g, ' ');

describe('a bill for a period', () => {
  it('holds the calls in the period and no others', async () => {
    const { path } = await scratch(DATED);
    const { document } = receipt(['bill', path, '--since', '2026-10-01']);
    assert.equal(document.total.calls, 2, 'a call from September was billed in October');
    assert.ok(Math.abs(document.total.usd - 4) < 1e-9, `total ${document.total.usd}`);
    assert.deepEqual(document.gaps, [], 'a clean window reported a gap');
  });

  it('reads a bare --until as the whole of that day', async () => {
    const { path } = await scratch(DATED);
    const { document } = receipt(['bill', path, '--since', '2026-10-01', '--until', '2026-10-31']);
    assert.equal(document.total.calls, 2, 'the call at 23:59:59 on the named day was left out');
  });

  it('splits into adjacent periods that share no call and add up to the whole', async () => {
    const { path } = await scratch(DATED);
    const whole = receipt(['bill', path]).document.total;
    const september = receipt(['bill', path, '--until', '2026-09-30']).document.total;
    const october = receipt(['bill', path, '--since', '2026-10-01']).document.total;
    assert.equal(september.calls + october.calls, whole.calls, 'a call was counted twice or lost');
    assert.ok(Math.abs(september.usd + october.usd - whole.usd) < 1e-9);
  });

  it('names a call it cannot place, on the receipt as a gap and on the statement', async () => {
    const { path } = await scratch([...DATED, call(null)]);
    const { document, stderr } = receipt(['bill', path, '--since', '2026-10-01']);
    assert.deepEqual(document.gaps, [{ kind: 'undated-excluded', calls: 1 }]);
    assert.match(flat(stderr), /1 call carries no timestamp and cannot be placed in this period/);

    const statement = run(['bill', path, '--table', '--since', '2026-10-01']);
    assert.equal(statement.status, 0, statement.stderr);
    const said = flat(statement.stdout);
    assert.match(said, /Filtered to --since 2026-10-01 --until —/, 'the statement does not say which period it is');
    assert.match(said, /the total is a floor on the period/);
  });

  it('carries no such gap without a window, where the undated call is simply billed', async () => {
    const { path } = await scratch([...DATED, call(null)]);
    const { document } = receipt(['bill', path]);
    assert.equal(document.total.calls, 4);
    assert.ok(!document.gaps.some((gap) => gap.kind === 'undated-excluded'));
  });

  it('puts the period in the documents for whoever pays', async () => {
    const { dir, path } = await scratch(DATED);
    const html = join(dir, 'bill.html');
    const markdown = join(dir, 'bill.md');
    const result = run(['bill', path, '--receipt', '--since', '2026-10-01', '--html-out', html, '--markdown-out', markdown]);
    assert.equal(result.status, 0, result.stderr);
    for (const [what, text] of [
      ['HTML', (await readFile(html, 'utf8')).replace(/<[^>]+>/g, ' ')],
      ['Markdown', await readFile(markdown, 'utf8')],
    ]) {
      assert.match(flat(text), /--since 2026-10-01/, `the ${what} does not say which period it bills`);
    }
  });
});

describe('a period that cannot be billed is refused, never billed at $0', () => {
  it('a period the log does not reach names what the log covers', async () => {
    const { path } = await scratch(DATED);
    const result = run(['bill', path, '--since', '2026-11-01']);
    assert.equal(result.status, 1, 'an empty period printed as a bill');
    assert.match(flat(result.stderr), /No call falls inside this period\. What was read covers 2026-09-30 → 2026-10-31/);
    assert.doesNotMatch(result.stdout, /"usd"/, 'a receipt was written for a period with nothing in it');
  });

  it('a log with no clock says a window has nothing to filter by', async () => {
    const { path } = await scratch([call(null), call(null)]);
    const result = run(['bill', path, '--since', '2026-10-01']);
    assert.equal(result.status, 1);
    assert.match(flat(result.stderr), /No record in this log carries a timestamp/);
  });

  it('an unreadable date and a window with no time in it are refused before anything is read', async () => {
    const missing = join(tmpdir(), 'trazum-no-such-log.jsonl');
    const bad = run(['bill', missing, '--since', 'yesterday']);
    assert.equal(bad.status, 1);
    assert.match(flat(bad.stderr), /--since could not read "yesterday"\. It takes a UTC day .* a relative window \(7d, 24h\) or "now"/);
    const inverted = run(['bill', missing, '--since', '2026-10-05', '--until', '2026-10-01']);
    assert.equal(inverted.status, 1);
    assert.match(flat(inverted.stderr), /--since is at or after --until/);
  });
});

describe('a bill that spans months says which month cost what', () => {
  const statement = async (lines) => {
    const { path } = await scratch(lines);
    const result = run(['bill', path, '--table']);
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  };
  const monthRow = (text, month) => new RegExp(`^\\s*${month}\\s+(\\d+)\\s+\\$(\\d+\\.\\d{2})`, 'm').exec(text);

  it('a month per row, the newest month offered on its own', async () => {
    const out = await statement(DATED);
    assert.deepEqual(monthRow(out, '2026-09')?.slice(1), ['1', '2.00']);
    assert.deepEqual(monthRow(out, '2026-10')?.slice(1), ['2', '4.00']);
    assert.match(flat(out), /One month on its own: --since 2026-10-01 --until 2026-10-31\./);
  });

  it('says what sits in no month rather than letting the rows fall short of the total', async () => {
    const out = await statement([...DATED, call(null)]);
    assert.match(flat(out), /\$2\.00 from 1 call\(s\) with no timestamp is in the total and in no month\./);
  });

  it('keeps the newest twelve and counts the rest', async () => {
    const lines = Array.from({ length: 14 }, (_, i) =>
      call(new Date(Date.UTC(2025, 8 + i, 15)).toISOString()),
    );
    const out = await statement(lines);
    assert.match(flat(out), /… and 2 earlier month\(s\)/);
    assert.equal(monthRow(out, '2025-09'), null, 'the oldest month was kept over a recent one');
    assert.ok(monthRow(out, '2026-10'), 'the newest month was dropped');
  });

  it('prints no month table for a bill inside one month', async () => {
    const out = await statement(DATED.slice(1));
    assert.doesNotMatch(out, /^\s*month\s+calls/m);
  });

  /** The text a PDF viewer would show: every string drawn with Tj, unescaped. */
  const shown = (pdf) =>
    [...pdf.matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)]
      .map(([, raw]) => raw.replace(/\\([0-7]{3})/g, (_, octal) => String.fromCharCode(parseInt(octal, 8))).replace(/\\(.)/g, '$1'))
      .join(' ');

  it('puts the same months, every one, in the documents for whoever pays', async () => {
    const lines = [
      ...Array.from({ length: 14 }, (_, i) => call(new Date(Date.UTC(2025, 8 + i, 15)).toISOString())),
      call(null),
    ];
    const { dir, path } = await scratch(lines);
    const html = join(dir, 'bill.html');
    const markdown = join(dir, 'bill.md');
    const pdf = join(dir, 'bill.pdf');
    const result = run(['bill', path, '--receipt', '--html-out', html, '--markdown-out', markdown, '--pdf-out', pdf]);
    assert.equal(result.status, 0, result.stderr);
    for (const [what, text] of [
      ['HTML', flat((await readFile(html, 'utf8')).replace(/<[^>]+>/g, ' '))],
      ['Markdown', flat(await readFile(markdown, 'utf8'))],
      ['PDF', flat(shown(await readFile(pdf, 'latin1')))],
    ]) {
      assert.match(text, /By month/, `the ${what} has no month table`);
      // A page has room for every month: the oldest is there, not counted out.
      for (const month of ['2025-09', '2025-10', '2026-10']) {
        assert.ok(text.includes(month), `the ${what} lost ${month}`);
      }
      assert.match(text, /\$2\.00 from 1 call\(s\) with no timestamp is in the total and in no month\./, `the ${what} lets the months add up short in silence`);
    }
  });

  it('puts no month table in a document for one month', async () => {
    const { dir, path } = await scratch(DATED.slice(1));
    const html = join(dir, 'bill.html');
    const result = run(['bill', path, '--receipt', '--html-out', html]);
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(await readFile(html, 'utf8'), /By month/);
  });
});

describe('trazum receipt takes the same period', () => {
  it('the same calls, the same gap, the same refusal', async () => {
    const { path } = await scratch([...DATED, call(null)]);
    const result = run(['receipt', path, '--since', '2026-10-01']);
    assert.equal(result.status, 0, result.stderr);
    const document = JSON.parse(result.stdout);
    const billed = receipt(['bill', path, '--since', '2026-10-01']).document;
    assert.deepEqual(document.total, billed.total, 'receipt and bill disagree on one period');
    assert.deepEqual(document.gaps, [{ kind: 'undated-excluded', calls: 1 }]);

    const empty = run(['receipt', path, '--since', '2026-11-01']);
    assert.equal(empty.status, 1, 'an empty period became a receipt');
    assert.match(flat(empty.stderr), /No call falls inside this period/);
  });
});
