import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/**
 * A doubled bill.
 *
 * Directory mode made double-counting easy — an overlapping export, a copy
 * left in the folder — and the total then reads high with nothing else able
 * to see it. $1.00 = 200k input tokens on Claude Opus 5.
 */

const call = (over = {}) => ({
  model: 'claude-opus-5',
  label: 'chat',
  ts: '2026-08-01T10:00:00.000Z',
  usage: { input_tokens: 200_000, output_tokens: 0 },
  ...over,
});

const run = async (records, argv = []) => {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-dupes-'));
  const log = join(dir, 'usage.jsonl');
  await writeFile(log, records.map((r) => JSON.stringify(r)).join('\n') + '\n');
  return spawnSync(process.execPath, [CLI, 'profile', log, ...argv], {
    encoding: 'utf8',
    env: SPAWN_ENV,
    timeout: 30000,
  });
};

const flat = (result) => `${result.stdout}${result.stderr}`.replace(/\s+/g, ' ');

describe('lines that are duplicates of an earlier line', () => {
  it('counts them and prices what they added', async () => {
    const text = flat(await run([call(), call(), call()]));
    assert.match(text, /2 lines are exact duplicates of an earlier line/);
    assert.match(text, /they add \$2\.00 to the total above/);
    assert.match(text, /this bill is overstated by that much/);
  });

  it('says nothing when every line differs', async () => {
    const text = flat(
      await run([call(), call({ ts: '2026-08-01T10:00:01.000Z' }), call({ label: 'batch' })]),
    );
    assert.doesNotMatch(text, /duplicates of an earlier line/);
  });

  it('ignores clockless records, where identical lines are ordinary', async () => {
    const noClock = { model: 'claude-opus-5', usage: { input_tokens: 200_000, output_tokens: 0 } };
    const text = flat(await run([noClock, noClock, noClock]));
    assert.doesNotMatch(text, /duplicates of an earlier line/);
  });

  it('catches a directory holding the same log twice', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'trazum-dupes-dir-'));
    const logs = join(dir, 'logs');
    await mkdir(logs);
    const body = [call(), call({ ts: '2026-08-01T11:00:00.000Z' })]
      .map((r) => JSON.stringify(r))
      .join('\n') + '\n';
    await writeFile(join(logs, 'day.jsonl'), body);
    await writeFile(join(logs, 'day-copy.jsonl'), body);
    const result = spawnSync(process.execPath, [CLI, 'profile', logs], {
      encoding: 'utf8',
      env: SPAWN_ENV,
      timeout: 30000,
    });
    assert.equal(result.status, 0);
    const text = flat(result);
    assert.match(text, /2 lines are exact duplicates/);
    // The whole second file: $2.00 of the $4.00 total.
    assert.match(text, /add \$2\.00 to the total/);
  });

  it('rides --json', async () => {
    const result = await run([call(), call()], ['--json']);
    const report = JSON.parse(result.stdout);
    assert.equal(report.duplicateLines.count, 1);
    assert.ok(Math.abs(report.duplicateLines.usd - 1) < 1e-9);
  });

  it('speaks Spanish', async () => {
    const text = flat(await run([call(), call()], ['--locale', 'es']));
    assert.match(text, /duplicados exactos de una línea anterior/);
  });
});
