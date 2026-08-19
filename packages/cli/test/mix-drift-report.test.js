import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/**
 * "The mix moved inside this log" on screen.
 *
 * The halves and shares are tested in the core suite; these pin the
 * fifteen-point speaking threshold, the refusal to forecast, and the silence
 * on a stable mix — which is what most logs look like, and a section firing
 * there would be noise on every bill.
 */

const on = (day, model) => ({
  model,
  label: 'chat',
  ts: `2026-08-${String(day).padStart(2, '0')}T10:00:00Z`,
  usage: { input_tokens: 200_000, output_tokens: 0 },
});

const run = async (records, argv = []) => {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-drift-'));
  const log = join(dir, 'usage.jsonl');
  await writeFile(log, records.map((r) => JSON.stringify(r)).join('\n') + '\n');
  return spawnSync(process.execPath, [CLI, 'profile', log, ...argv], {
    encoding: 'utf8',
    env: SPAWN_ENV,
    timeout: 30000,
  });
};

const flat = (result) => `${result.stdout}${result.stderr}`.replace(/\s+/g, ' ');

const MIGRATION = [
  on(1, 'claude-haiku-4-5'),
  on(2, 'claude-haiku-4-5'),
  on(3, 'claude-opus-5'),
  on(4, 'claude-opus-5'),
];

describe('the mix drift on screen', () => {
  it('names the migration with its halves, its shares and its money', async () => {
    const out = flat(await run(MIGRATION));
    assert.match(out, /The mix moved inside this log/);
    assert.match(out, /claude-opus-5 went from 0\.0% of the spend in the first 2 days to 100\.0% in the last 2/);
    assert.match(out, /Where the mix goes next is not in this log, so it is not said here/);
  });

  it('stays silent on a stable mix — most logs look like this', async () => {
    const out = flat(await run([1, 2, 3, 4].map((d) => on(d, 'claude-opus-5'))));
    assert.doesNotMatch(out, /The mix moved/);
  });

  it('stays silent under four dated days', async () => {
    const out = flat(await run(MIGRATION.slice(0, 3)));
    assert.doesNotMatch(out, /The mix moved/);
  });

  it('carries the exact shares into --json even when the terminal is silent', async () => {
    // A 100%-stable mix says nothing on screen, but the data is not a
    // verdict: the JSON states the shares and a dashboard draws its own line.
    const result = await run([1, 2, 3, 4].map((d) => on(d, 'claude-opus-5')), ['--json']);
    assert.equal(result.status, 0, result.stderr);
    const { modelMixDrift } = JSON.parse(result.stdout);
    assert.equal(modelMixDrift.models.length, 1);
    assert.equal(modelMixDrift.models[0].firstShare, 1);
    assert.equal(modelMixDrift.models[0].lastShare, 1);
  });

  it('reaches the CI summary with the same threshold', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'trazum-drift-md-'));
    const out = join(dir, 'bill.md');
    const log = join(dir, 'usage.jsonl');
    await writeFile(log, MIGRATION.map((r) => JSON.stringify(r)).join('\n') + '\n');
    const result = spawnSync(process.execPath, [CLI, 'profile', log, '--markdown-out', out], {
      encoding: 'utf8',
      env: SPAWN_ENV,
      timeout: 30000,
    });
    assert.equal(result.status, 0, result.stderr);
    const md = await readFile(out, 'utf8');
    assert.match(md, /⚠️ .*claude-opus-5 went from 0\.0%/);
  });
});
