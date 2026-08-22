import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/**
 * `trazum pulse` — did the things that are supposed to run, run?
 *
 * The command exists because nothing could answer it: `watch --once` writes a
 * state file that exactly one thing reads, and that thing is the next cycle.
 * A dead cron produces silence, and so does a watcher with nothing to report.
 */

const cli = (args, cwd) =>
  spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    env: SPAWN_ENV,
    timeout: 30000,
    cwd,
  });

const hoursAgo = (n) => Date.now() - n * 3_600_000;

/** A workspace with a watch state and one stored record, at chosen ages. */
const workspace = async ({ watchHours, pulledHours, coveredHours } = {}) => {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-pulse-'));
  if (watchHours !== undefined) {
    await mkdir(join(dir, '.trazum'), { recursive: true });
    await writeFile(
      join(dir, '.trazum', 'watch.json'),
      JSON.stringify({ v: 1, lastCycleMs: hoursAgo(watchHours), lastCoveredToMs: null, fired: {} }),
    );
  }
  if (pulledHours !== undefined) {
    await mkdir(join(dir, '.trazum', 'store', 'anthropic'), { recursive: true });
    await writeFile(
      join(dir, '.trazum', 'store', 'anthropic', '2026-08.jsonl'),
      `${JSON.stringify({
        v: 1,
        provider: 'anthropic',
        fromMs: hoursAgo((coveredHours ?? 2) + 24),
        toMs: hoursAgo(coveredHours ?? 2),
        model: 'claude-opus-5',
        calls: 10,
        input: 1000,
        cacheRead: 0,
        write5m: 0,
        write1h: 0,
        ttlKnown: true,
        output: 100,
        group: {},
        pulledAtMs: hoursAgo(pulledHours),
      })}\n`,
    );
  }
  return dir;
};

describe('trazum pulse', () => {
  it('says nothing has ever run here, and does not gate on it', async () => {
    const dir = await workspace();
    const result = cli(['pulse', '--max-stale-hours', '1'], dir);
    // A gate that fired on "you have not adopted this feature" would be a tool
    // nagging rather than measuring.
    assert.equal(result.status, 0, result.stdout);
    assert.match(result.stdout, /never here/);
    assert.doesNotMatch(result.stdout, /has not run in over/);
  });

  it('judges nothing without a threshold, and says so out loud', async () => {
    const dir = await workspace({ watchHours: 500, pulledHours: 500 });
    const result = cli(['pulse'], dir);
    assert.equal(result.status, 0);
    // Five hundred hours, and still no verdict: how stale is too stale is a
    // policy. Said out loud, because a screen with no threshold behind it is
    // the shape somebody reads as "checked".
    assert.match(result.stdout, /Nothing was judged/);
  });

  it('exits 1 when a run that has happened before is past the threshold', async () => {
    const dir = await workspace({ watchHours: 50, pulledHours: 2 });
    const result = cli(['pulse', '--max-stale-hours', '36'], dir);
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stdout, /has not run in over/);

    const generous = cli(['pulse', '--max-stale-hours', '72'], dir);
    assert.equal(generous.status, 0, generous.stdout);
  });

  it('never judges how far the measurements reach', async () => {
    /**
     * A store pulled two hours ago whose newest record stops two days back is
     * a healthy cron in front of a provider that reports late. Gating on it
     * would produce a red build for somebody else's latency.
     */
    const dir = await workspace({ watchHours: 1, pulledHours: 1, coveredHours: 400 });
    const result = cli(['pulse', '--max-stale-hours', '6', '--json'], dir);
    assert.equal(result.status, 0, result.stdout);
    const report = JSON.parse(result.stdout);
    const coverage = report.beats.find((beat) => beat.kind === 'store-coverage');
    assert.ok(coverage.ageHours >= 300, `ageHours was ${coverage.ageHours}`);
    assert.equal(coverage.verdict, 'not-judged');
    assert.equal(report.stale, false);
  });

  it('emits one JSON document and gates under --json too', async () => {
    const dir = await workspace({ watchHours: 50, pulledHours: 2 });
    const result = cli(['pulse', '--max-stale-hours', '36', '--json'], dir);
    assert.equal(result.status, 1);
    const report = JSON.parse(result.stdout);
    assert.equal(report.schemaVersion, 1);
    assert.equal(report.maxStaleHours, 36);
    assert.equal(report.stale, true);
  });
});

describe('every flag that carries a value is parsed as one', () => {
  /**
   * `--max-stale-hours 36` shipped, built, ran, printed a full report and
   * gated on nothing: the flag was not in `VALUE_FLAGS`, so it parsed as a
   * boolean and `36` became a positional argument. Nothing failed. The
   * command's own tests would have passed if they had only checked that it
   * printed.
   *
   * The rule is derivable, so it is derived: anything read with `stringFlag`
   * or `numberFlag` takes a value by definition.
   */
  const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');

  const valueFlags = () => {
    const block = source.slice(
      source.indexOf('const VALUE_FLAGS = new Set(['),
      source.indexOf(']);', source.indexOf('const VALUE_FLAGS = new Set([')),
    );
    return new Set([...block.matchAll(/'([^']+)'/g)].map((match) => match[1]));
  };

  const readWithAValue = (text) => [
    ...new Set(
      [...text.matchAll(/\b(?:stringFlag|numberFlag)\(\s*args\s*,\s*'([^']+)'/g)].map((m) => m[1]),
    ),
  ];

  it('every flag read for its value is declared as taking one', () => {
    const declared = valueFlags();
    const read = readWithAValue(source);
    assert.ok(read.length > 20, `only ${read.length} value-taking flags found — has the shape changed?`);
    const missing = read.filter((name) => !declared.has(name));
    assert.deepEqual(
      missing,
      [],
      `these are read for a value and parse as booleans, so the value becomes a positional: ${missing.join(', ')}`,
    );
  });

  it('and the detector is not one that can never fire', () => {
    // Handed the exact line that shipped.
    assert.deepEqual(
      readWithAValue("  const maxStaleHours = numberFlag(args, 'max-stale-hours', Number.NaN, t);"),
      ['max-stale-hours'],
    );
  });
});
