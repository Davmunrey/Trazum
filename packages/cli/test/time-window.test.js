import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/**
 * `--since` / `--until` — the drill-down in time, on the command line.
 *
 * Every dollar is hand arithmetic: 200k input tokens on Claude Opus 5 at
 * $5/MTok are $1.00. The window's honesty rules — clockless calls counted out
 * loud, an empty window an error rather than a passing $0 gate — are what
 * these tests pin.
 */

const write = async (name, lines) => {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-window-'));
  const path = join(dir, name);
  await writeFile(path, lines.map((r) => JSON.stringify(r)).join('\n') + '\n');
  return path;
};

const run = (argv) =>
  spawnSync(process.execPath, [CLI, 'profile', ...argv], {
    encoding: 'utf8',
    env: SPAWN_ENV,
    timeout: 30000,
  });

const flat = (result) => `${result.stdout}${result.stderr}`.replace(/\s+/g, ' ');

/** One call costing exactly $1.00, on the given UTC day. */
const call = (day, over = {}) => ({
  model: 'claude-opus-5',
  ...(day === null ? {} : { ts: `${day}T10:00:00Z` }),
  usage: { input_tokens: 200_000, output_tokens: 0 },
  ...over,
});

describe('the window filters and says so', () => {
  it('profiles one day out of three, with the window stated before the figures', async () => {
    const log = await write('usage.jsonl', [
      call('2026-08-01'),
      call('2026-08-02'),
      call('2026-08-03'),
    ]);
    const result = run([log, '--since', '2026-08-02', '--until', '2026-08-02']);
    assert.equal(result.status, 0);
    const text = flat(result);
    assert.match(text, /\$1\.00/);
    assert.match(text, /Filtered to --since 2026-08-02 --until 2026-08-02/);
    // A bare --until date includes that whole day, the way humans read dates.
    assert.doesNotMatch(text, /\$2\.00/);
  });

  it('gates the window, not the log: --max-usd over one day of three', async () => {
    const log = await write('usage.jsonl', [
      call('2026-08-01'),
      call('2026-08-02'),
      call('2026-08-03'),
    ]);
    // The whole log is $3.00 and would fail; the one-day window is $1.00.
    const pass = run([log, '--since', '2026-08-02', '--until', '2026-08-02', '--max-usd', '1.50']);
    assert.equal(pass.status, 0);
    const fail = run([log, '--max-usd', '1.50']);
    assert.equal(fail.status, 1);
  });

  it('counts clockless calls out loud instead of dropping them silently', async () => {
    const log = await write('usage.jsonl', [call('2026-08-01'), call(null), call(null)]);
    const result = run([log, '--since', '2026-08-01']);
    assert.equal(result.status, 0);
    const text = flat(result);
    assert.match(text, /2 calls carry no timestamp/);
    assert.match(text, /floor on the period/);
    assert.match(text, /\$1\.00/);
  });

  it('carries the window into --json as timeWindow', async () => {
    const log = await write('usage.jsonl', [call('2026-08-01'), call(null)]);
    const result = run([log, '--since', '2026-08-01', '--json']);
    assert.equal(result.status, 0);
    const report = JSON.parse(result.stdout);
    assert.equal(report.timeWindow.undatedExcluded, 1);
    assert.equal(report.timeWindow.sinceMs, Date.parse('2026-08-01T00:00:00Z'));
    assert.equal(report.total.calls, 1);
  });

  it('applies the same window to both sides of --against', async () => {
    const log = await write('usage.jsonl', [call('2026-08-01'), call('2026-08-02')]);
    const previous = await write('previous.jsonl', [
      call('2026-08-01'),
      call('2026-08-02'),
      call('2026-08-02'),
    ]);
    // Windowed to day 2: $1.00 now against $2.00 before — the bill shrank.
    const result = run([
      log,
      '--since',
      '2026-08-02',
      '--until',
      '2026-08-02',
      '--against',
      previous,
      '--json',
    ]);
    assert.equal(result.status, 0);
    const report = JSON.parse(result.stdout);
    assert.ok(Math.abs(report.against.previousTotalUsd - 2.0) < 1e-9);
    assert.ok(Math.abs(report.against.deltaUsd - -1.0) < 1e-9);
  });
});

describe('what the window refuses', () => {
  it('a window matching nothing, naming what the log does cover', async () => {
    const log = await write('usage.jsonl', [call('2026-08-01'), call('2026-08-03')]);
    const result = run([log, '--since', '2026-09-01']);
    assert.equal(result.status, 1);
    const text = flat(result);
    assert.match(text, /No record falls inside this window/);
    assert.match(text, /2026-08-01 → 2026-08-03/);
  });

  it('a window over a log with no clock at all', async () => {
    const log = await write('usage.jsonl', [call(null), call(null)]);
    const result = run([log, '--since', '2026-08-01']);
    assert.equal(result.status, 1);
    assert.match(flat(result), /No record in this log carries a timestamp/);
  });

  it('a since at or after until', async () => {
    const log = await write('usage.jsonl', [call('2026-08-01')]);
    const result = run([log, '--since', '2026-08-03', '--until', '2026-08-02']);
    assert.equal(result.status, 1);
    assert.match(flat(result), /window contains no time at all/);
  });

  it('a date it cannot read, naming the accepted forms', async () => {
    const log = await write('usage.jsonl', [call('2026-08-01')]);
    const result = run([log, '--since', 'yesterday']);
    assert.equal(result.status, 1);
    assert.match(flat(result), /--since could not read "yesterday"/);
  });

  it('in Spanish too, because a gate speaks the reader’s language', async () => {
    const log = await write('usage.jsonl', [call('2026-08-01')]);
    const result = spawnSync(
      process.execPath,
      [CLI, 'profile', log, '--since', '2026-09-01', '--locale', 'es'],
      { encoding: 'utf8', env: SPAWN_ENV, timeout: 30000 },
    );
    assert.equal(result.status, 1);
    assert.match(flat(result), /Ningún registro cae dentro de esta ventana/);
  });
});
