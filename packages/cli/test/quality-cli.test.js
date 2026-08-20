import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;
const flat = (text) => text.replace(/\s+/g, ' ');

/**
 * `trazum quality`, end to end.
 *
 * The command that fails a build for the failure that matters — and, mostly,
 * the command that refuses to. A gate that blames the prompt because the prompt
 * is the thing it can see gets switched off within a month, and a switched-off
 * gate catches nothing.
 */

const AT = '2026-08-05T00:00:00Z';

const run = (cwd, args) =>
  spawnSync(process.execPath, [CLI, 'quality', ...args], {
    cwd,
    encoding: 'utf8',
    env: SPAWN_ENV,
    timeout: 30000,
  });

const window = (day, successes, n, { model = 'claude-opus-5', tokens = 200_000, calls = n } = {}) => [
  ...Array.from({ length: successes }, () => ({
    model,
    label: 'support',
    outcome: 'resolved',
    timestamp: day,
    usage: { input_tokens: tokens, output_tokens: 0 },
  })),
  ...Array.from({ length: n - successes }, () => ({
    model,
    label: 'support',
    outcome: 'escalated',
    timestamp: day,
    usage: { input_tokens: tokens, output_tokens: 0 },
  })),
  // Calls with no outcome, to move coverage where a test wants it moved.
  ...Array.from({ length: calls - n }, () => ({
    model,
    label: 'support',
    timestamp: day,
    usage: { input_tokens: tokens, output_tokens: 0 },
  })),
];

const BEFORE = '2026-08-01T10:00:00Z';
const AFTER = '2026-08-10T10:00:00Z';

const workspace = async (records) => {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-quality-'));
  await writeFile(join(dir, 'usage.jsonl'), `${records.map((r) => JSON.stringify(r)).join('\n')}\n`);
  await writeFile(
    join(dir, 'trazum.config.json'),
    `${JSON.stringify({ outcomes: { values: ['resolved', 'escalated'], success: ['resolved'] } })}\n`,
  );
  return dir;
};

describe('trazum quality', () => {
  it('prints the sentence teams argue about, with both halves measured', async () => {
    const dir = await workspace([
      ...window(BEFORE, 5964, 8400, { tokens: 200_000 }),
      ...window(AFTER, 5376, 8400, { tokens: 100_000 }),
    ]);
    const { stdout } = run(dir, ['usage.jsonl', '--label', 'support', '--at', AT]);
    const text = flat(stdout);
    assert.match(text, /from 71\.0% to 64\.0% on 16,800 measured outcomes/);
    assert.match(text, /saves \$0\.5000 a call/);
    assert.match(text, /Both halves are measured; neither is an estimate/);
  });

  it('exits 1 on a measured drop and 2 on cannot-tell', async () => {
    // Three outcomes, never two: "cannot tell" holds the claim open rather
    // than exiting green, the posture verify --gate has had since 1.39.
    const dropped = await workspace([...window(BEFORE, 5964, 8400), ...window(AFTER, 5376, 8400)]);
    assert.equal(run(dropped, ['usage.jsonl', '--label', 'support', '--at', AT, '--gate']).status, 1);

    const thin = await workspace([...window(BEFORE, 30, 50), ...window(AFTER, 20, 50)]);
    assert.equal(run(thin, ['usage.jsonl', '--label', 'support', '--at', AT, '--gate']).status, 2);
  });

  it('refuses to blame the prompt when the model moved underneath', async () => {
    const dir = await workspace([
      ...window(BEFORE, 700, 1000),
      ...window(AFTER, 500, 1000, { model: 'claude-haiku-4-5' }),
    ]);
    const { stdout, status } = run(dir, ['usage.jsonl', '--label', 'support', '--at', AT, '--gate']);
    assert.equal(status, 2, 'not a failed build');
    const text = flat(stdout);
    assert.match(text, /The prompt is not the only thing that changed/);
    assert.match(text, /entirely somebody else's migration/);
  });

  it('refuses when the volume moved', async () => {
    const dir = await workspace([...window(BEFORE, 700, 1000), ...window(AFTER, 1500, 3000)]);
    const text = flat(run(dir, ['usage.jsonl', '--label', 'support', '--at', AT]).stdout);
    assert.match(text, /call volume moved/);
    assert.match(text, /a workload whose population changed/);
  });

  it('refuses when outcome coverage moved — the one nobody thinks of', async () => {
    const dir = await workspace([
      ...window(BEFORE, 700, 1000, { calls: 1000 }),
      ...window(AFTER, 500, 1000, { calls: 1400 }),
    ]);
    const text = flat(run(dir, ['usage.jsonl', '--label', 'support', '--at', AT]).stdout);
    assert.match(text, /Outcome coverage moved/);
    assert.match(text, /instrumenting its hard cases sees its measured rate fall/);
  });

  it('never calls "not measurably worse" a hold', async () => {
    const dir = await workspace([...window(BEFORE, 520, 1000), ...window(AFTER, 505, 1000)]);
    const text = flat(run(dir, ['usage.jsonl', '--label', 'support', '--at', AT]).stdout);
    assert.match(text, /NOT the same as "it held"/);
    assert.match(text, /lacked the power to see/);
  });

  it('says plainly what it cannot see', async () => {
    const dir = await workspace([...window(BEFORE, 5964, 8400), ...window(AFTER, 5376, 8400)]);
    const text = flat(run(dir, ['usage.jsonl', '--label', 'support', '--at', AT]).stdout);
    assert.match(text, /cannot see anything else you deployed that day/);
    assert.match(text, /smaller claim than "the prompt did it"/);
  });

  it('says it is not an experiment, before any number', async () => {
    const dir = await workspace([...window(BEFORE, 700, 1000), ...window(AFTER, 500, 1000)]);
    const { stdout } = run(dir, ['usage.jsonl', '--label', 'support', '--at', AT]);
    const caveat = stdout.indexOf('before-and-after, not an experiment');
    const numbers = stdout.indexOf('before 70.0%');
    assert.ok(caveat > 0 && numbers > caveat, 'the caveat comes before the figures');
  });
});

describe('the gate refuses what it cannot judge', () => {
  it('requires a label', async () => {
    const dir = await workspace(window(BEFORE, 5, 10));
    const { stderr, status } = run(dir, ['usage.jsonl', '--at', AT]);
    assert.equal(status, 1);
    assert.match(flat(stderr), /average a regression away/);
  });

  it('requires the moment the change landed', async () => {
    const dir = await workspace(window(BEFORE, 5, 10));
    const { stderr, status } = run(dir, ['usage.jsonl', '--label', 'support']);
    assert.equal(status, 1);
    assert.match(flat(stderr), /--at is required/);
    assert.match(flat(stderr), /choosing which change to blame/);
  });
});
