import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/**
 * What the log cannot answer yet.
 *
 * The counts are the point: twelve labelled records out of forty thousand is
 * not a labelled log, and a boolean would call it one.
 */

const run = async (records, extra = []) => {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-coverage-'));
  const log = join(dir, 'usage.jsonl');
  await writeFile(log, records.map((r) => JSON.stringify(r)).join('\n') + '\n');
  return spawnSync(process.execPath, [CLI, 'profile', log, ...extra], {
    encoding: 'utf8',
    env: SPAWN_ENV,
    timeout: 30000,
  });
};

const flat = (result) => `${result.stdout}${result.stderr}`.replace(/\s+/g, ' ');

const bare = { model: 'claude-opus-5', usage: { input_tokens: 200_000, output_tokens: 100 } };
const complete = {
  model: 'claude-opus-5',
  label: 'chat',
  session: 's1',
  ts: '2026-08-01T10:00:00Z',
  stop_reason: 'end_turn',
  usage: { input_tokens: 200_000, output_tokens: 100 },
};

describe('what this log cannot answer yet', () => {
  it('names every missing field with what it would unlock', async () => {
    const text = flat(await run([bare, bare]));
    assert.match(text, /What this log cannot answer yet/);
    assert.match(text, /"label" on 0\/2 records/);
    assert.match(text, /"session" on 0\/2 records/);
    assert.match(text, /"ts" on 0\/2 records/);
    assert.match(text, /"stop_reason".*on 0\/2 records/);
  });

  it('counts partial coverage rather than calling it present', async () => {
    const text = flat(await run([complete, bare, bare, bare]));
    // One record in four carries each field: a boolean would report the log
    // as labelled, timestamped and sessioned.
    assert.match(text, /"label" on 1\/4 records/);
    assert.match(text, /"ts" on 1\/4 records/);
  });

  it('says nothing at all when the log is complete', async () => {
    const text = flat(await run([complete, complete]));
    assert.doesNotMatch(text, /cannot answer yet/);
  });

  it('names the cache TTL only over records that wrote to the cache', async () => {
    const writer = {
      ...complete,
      usage: { ...complete.usage, cache_creation_input_tokens: 10_000 },
    };
    const text = flat(await run([writer, complete, complete]));
    // One of the three wrote to the cache, and it did not state its TTL.
    assert.match(text, /"cache_creation" object on 0\/1 of the records that wrote/);
  });

  it('rides --json as counts', async () => {
    const result = await run([complete, bare], ['--json']);
    const report = JSON.parse(result.stdout);
    assert.deepEqual(report.fieldCoverage, {
      label: 1,
      session: 1,
      ts: 1,
      stopReason: 1,
      cacheTtl: 0,
      cacheWrites: 0,
      parsed: 2,
    });
  });

  it('counts records the price catalogue could not price', async () => {
    // Whether a field is present is a property of the log, not of pricing.
    const result = await run(
      [{ model: 'ft:unknown', label: 'x', usage: { input_tokens: 10 } }, bare],
      ['--json'],
    );
    const report = JSON.parse(result.stdout);
    assert.equal(report.fieldCoverage.parsed, 2);
    assert.equal(report.fieldCoverage.label, 1);
  });

  it('speaks Spanish', async () => {
    const text = flat(await run([bare], ['--locale', 'es']));
    assert.match(text, /Lo que este registro todavía no puede responder/);
  });
});
