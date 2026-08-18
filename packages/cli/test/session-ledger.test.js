import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/**
 * Cache writes by conversations that never came back, rendered.
 *
 * The rule under test is the two-sentence honesty split: the same tokens
 * print as a loud *fact* when the slice recorded zero cache reads (nothing
 * read those writes, anywhere), and as a quiet *ceiling* when reads exist —
 * because the provider's cache is keyed by prefix and the log cannot see
 * whose write a read hit. $6.25 = 1M 5-minute-write tokens on Claude Opus 5
 * ($5/MTok × 1.25), hand arithmetic as always.
 */

const write = async (name, records) => {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-ledger-'));
  const path = join(dir, name);
  await writeFile(path, records.map((r) => JSON.stringify(r)).join('\n') + '\n');
  return path;
};

const run = (argv, extra = []) =>
  spawnSync(process.execPath, [CLI, 'profile', ...argv, ...extra], {
    encoding: 'utf8',
    env: SPAWN_ENV,
    timeout: 30000,
  });

const flat = (result) => `${result.stdout}${result.stderr}`.replace(/\s+/g, ' ');

const driveBy = (session, writes = 1_000_000) => ({
  model: 'claude-opus-5',
  label: 'chat',
  session,
  usage: {
    input_tokens: 1_000,
    output_tokens: 100,
    cache_creation_input_tokens: writes,
    cache_creation: { ephemeral_5m_input_tokens: writes, ephemeral_1h_input_tokens: 0 },
  },
});

const reader = (session) => ({
  model: 'claude-opus-5',
  label: 'chat',
  session,
  usage: { input_tokens: 100, output_tokens: 10, cache_read_input_tokens: 400_000 },
});

describe('conversations that never came back, on screen', () => {
  it('states the fact loudly when nothing in the slice ever read the cache', async () => {
    const quiet = (session) => ({
      model: 'claude-opus-5',
      label: 'chat',
      session,
      usage: { input_tokens: 100, output_tokens: 10 },
    });
    const log = await write('usage.jsonl', [driveBy('a'), quiet('b'), quiet('b')]);
    const result = run([log]);
    assert.equal(result.status, 0);
    const text = flat(result);
    assert.match(text, /1 of 2 conversations ended after their first turn/);
    assert.match(text, /\$6\.25/);
    assert.match(text, /bought nothing/);
    assert.doesNotMatch(text, /ceiling on the waste/);
  });

  it('states the ceiling as a ceiling when the slice has reads', async () => {
    const log = await write('usage.jsonl', [driveBy('a'), reader('b'), reader('b')]);
    const result = run([log]);
    assert.equal(result.status, 0);
    const text = flat(result);
    assert.match(text, /\$6\.25/);
    assert.match(text, /ceiling on the waste, not a bill/);
    assert.doesNotMatch(text, /bought nothing/);
  });

  it('never prints the session key', async () => {
    const log = await write('usage.jsonl', [driveBy('secret-user-42@corp')]);
    const result = run([log]);
    assert.ok(!`${result.stdout}${result.stderr}`.includes('secret-user-42'));
  });

  it('carries the rows into --json', async () => {
    const log = await write('usage.jsonl', [driveBy('a'), reader('b'), reader('b')]);
    const result = run([log, '--json']);
    const report = JSON.parse(result.stdout);
    assert.equal(report.singleTurnCacheWrites.length, 1);
    assert.ok(Math.abs(report.singleTurnCacheWrites[0].singleTurnWriteUsd - 6.25) < 1e-9);
    assert.equal(report.singleTurnCacheWrites[0].singleTurnSessions, 1);
  });

  it('speaks Spanish', async () => {
    const log = await write('usage.jsonl', [driveBy('a')]);
    const result = run([log], ['--locale', 'es']);
    assert.match(flat(result), /terminaron tras su primer turno|terminó tras su primer turno|conversaciones terminaron/);
    assert.match(flat(result), /no compraron nada/);
  });
});
