import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/**
 * The retry bill on screen. The pairing is tested in core; these pin that
 * the line lands inside the truncation section with both dollar figures and
 * the denominator, that the hedge survives, and that --json carries it.
 * $2.00 per call: 200k in + 40k out on Claude Opus 5.
 */

const turn = (seconds, over = {}) => ({
  model: 'claude-opus-5',
  label: 'chat',
  session: 's1',
  ts: new Date(Date.UTC(2026, 7, 1, 10, 0, seconds)).toISOString(),
  stop_reason: 'end_turn',
  usage: { input_tokens: 200_000, output_tokens: 40_000 },
  ...over,
});
const cut = (seconds, over = {}) => turn(seconds, { stop_reason: 'max_tokens', ...over });
const PAIRS = [cut(0), turn(30), cut(120), turn(150)];

const run = async (records, argv = []) => {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-truncretry-'));
  const log = join(dir, 'usage.jsonl');
  await writeFile(log, records.map((r) => JSON.stringify(r)).join('\n') + '\n');
  return { dir, result: spawnSync(process.execPath, [CLI, 'profile', log, ...argv], {
    encoding: 'utf8', env: SPAWN_ENV, timeout: 30000,
  }) };
};
const flat = ({ result }) => `${result.stdout}${result.stderr}`.replace(/\s+/g, ' ');

describe('the retry bill on screen', () => {
  it('prices both sides and carries the denominator', async () => {
    const out = flat(await run(PAIRS));
    assert.match(out, /2 of 2 truncated answers were followed within 120 seconds/);
    assert.match(out, /\$4\.00 spent on the cut attempts, plus \$4\.00 on the follow-ups/);
  });

  it('keeps the hedge: the pair is a shape, not a certainty', async () => {
    const out = flat(await run(PAIRS));
    assert.match(out, /the log cannot see content, so whether each was one is yours to know/);
    assert.match(out, /a max_tokens the answers actually fit in/);
  });

  it('says nothing when the follow-ups came much later', async () => {
    const out = flat(await run([cut(0), turn(600), cut(1200), turn(1800)]));
    assert.doesNotMatch(out, /followed within/);
  });

  it('carries the rows into --json', async () => {
    const { result } = await run(PAIRS, ['--json']);
    assert.equal(result.status, 0, result.stderr);
    const { truncationRetries } = JSON.parse(result.stdout);
    assert.equal(truncationRetries.length, 1);
    assert.equal(truncationRetries[0].retried, 2);
    assert.ok(Math.abs(truncationRetries[0].wastedUsd - 4) < 1e-9);
  });

  it('reaches the CI summary, loud', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'trazum-truncretry-md-'));
    const out = join(dir, 'bill.md');
    const log = join(dir, 'usage.jsonl');
    await writeFile(log, PAIRS.map((r) => JSON.stringify(r)).join('\n') + '\n');
    const result = spawnSync(process.execPath, [CLI, 'profile', log, '--markdown-out', out], {
      encoding: 'utf8', env: SPAWN_ENV, timeout: 30000,
    });
    assert.equal(result.status, 0, result.stderr);
    const md = await readFile(out, 'utf8');
    assert.match(md, /⚠️ .*2 of 2 truncated answers/);
  });
});
