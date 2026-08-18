import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;
const DOC = new URL('../../../docs/json-output.md', import.meta.url).pathname;

/**
 * The machine-readable report is a contract, and this is what makes it one.
 *
 * Enforced in **both** directions: a documented field that vanishes fails, and
 * a field added without a line in the doc fails too. A dashboard built on this
 * output cannot tell "old Trazum" from "no data", so the shape has to be
 * something the repository is held to rather than something it happens to
 * emit today.
 */

const report = async (extra = []) => {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-contract-'));
  const log = join(dir, 'usage.jsonl');
  const previous = join(dir, 'previous.jsonl');
  const record = (usd) =>
    JSON.stringify({
      model: 'claude-opus-5',
      label: 'chat',
      session: 's1',
      ts: '2026-08-01T10:00:00Z',
      stop_reason: 'end_turn',
      usage: { input_tokens: usd * 200_000, output_tokens: 100 },
    });
  await writeFile(log, `${record(1)}\n`);
  await writeFile(previous, `${record(2)}\n`);
  const result = spawnSync(
    process.execPath,
    [CLI, 'profile', log, '--json', ...extra.map((flag) => (flag === '<previous>' ? previous : flag))],
    { encoding: 'utf8', env: SPAWN_ENV, timeout: 30000 },
  );
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
};

/** The field names the doc's table promises. */
const documented = async () => {
  const doc = await readFile(DOC, 'utf8');
  return new Set([...doc.matchAll(/^\| `([a-zA-Z]+)` \|/gm)].map((match) => match[1]));
};

describe('the --json contract', () => {
  it('emits a schema version to branch on', async () => {
    assert.equal((await report()).schemaVersion, 1);
  });

  it('documents every field it emits', async () => {
    const emitted = Object.keys(await report(['--against', '<previous>']));
    const promised = await documented();
    const undocumented = emitted.filter((key) => !promised.has(key));
    assert.deepEqual(undocumented, [], `fields emitted with no line in docs/json-output.md`);
  });

  it('emits every field it documents', async () => {
    const emitted = new Set(Object.keys(await report(['--against', '<previous>'])));
    const missing = [...(await documented())].filter((key) => !emitted.has(key));
    assert.deepEqual(missing, [], 'fields promised by docs/json-output.md and not emitted');
  });

  it('keeps absence distinguishable from zero', async () => {
    // A log with no clock: the period is null and the series empty, never a
    // zero that would read as "measured, and it was nothing".
    const dir = await mkdtemp(join(tmpdir(), 'trazum-contract-'));
    const log = join(dir, 'usage.jsonl');
    await writeFile(
      log,
      `${JSON.stringify({ model: 'claude-opus-5', usage: { input_tokens: 200_000, output_tokens: 0 } })}\n`,
    );
    const result = spawnSync(process.execPath, [CLI, 'profile', log, '--json'], {
      encoding: 'utf8',
      env: SPAWN_ENV,
      timeout: 30000,
    });
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.span, null);
    assert.deepEqual(parsed.spendByDay, []);
    assert.deepEqual(parsed.spendByHour, []);
    assert.equal(parsed.timeWindow, null);
    assert.equal(parsed.hasSessions, false);
  });

  it('carries no session key anywhere in the document', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'trazum-contract-'));
    const log = join(dir, 'usage.jsonl');
    await writeFile(
      log,
      `${JSON.stringify({ model: 'claude-opus-5', session: 'user-42@corp.example', usage: { input_tokens: 200_000, output_tokens: 0 } })}\n`,
    );
    const result = spawnSync(process.execPath, [CLI, 'profile', log, '--json'], {
      encoding: 'utf8',
      env: SPAWN_ENV,
      timeout: 30000,
    });
    assert.ok(!result.stdout.includes('user-42@corp.example'));
    // And the field that says a session was seen is still true: grouped by,
    // never shown.
    assert.equal(JSON.parse(result.stdout).hasSessions, true);
  });
});
