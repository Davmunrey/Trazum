import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

/**
 * `trazum position`, run rather than read: the division line prints WITH its
 * denominator or not at all, the refusal teaches the invocation, and the
 * JSON door survives a pipe through `conform` — which is the whole claim.
 */

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

const run = (args, cwd) =>
  spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env: SPAWN_ENV, timeout: 30000, cwd });

/** Eight measured days this month at $5 each, labelled. */
const workspace = async () => {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-position-'));
  const now = new Date();
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const lines = [1, 2, 3, 4, 5, 6, 7, 8].map((day) =>
    JSON.stringify({
      model: 'claude-opus-5',
      label: 'chat',
      ts: `${month}-${String(day).padStart(2, '0')}T10:00:00Z`,
      usage: { input_tokens: 1_000_000, output_tokens: 0 },
    }),
  );
  await writeFile(join(dir, 'usage.jsonl'), `${lines.join('\n')}\n`);
  await writeFile(
    join(dir, 'trazum.config.json'),
    JSON.stringify({ spend: { monthlyUsd: 100 }, limits: { sessionUsd: 2, byLabel: { chat: 60 } } }),
  );
  return dir;
};

describe('trazum position', () => {
  it('prints the division with its denominator, and the month is in the heading', async () => {
    const dir = await workspace();
    const result = run(['position', 'usage.jsonl'], dir);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Where \d{4}-\d{2} stands, measured/);
    assert.match(result.stdout, /over 8 measured days/);
    assert.match(result.stdout, /division on the past, not a forecast/);
    // The deliberate refusal, stated on the page rather than implied.
    assert.match(result.stdout, /does not answer/);
    assert.match(result.stdout, /sessionUsd/);
  });

  it('survives a pipe through conform, which is the whole claim', async () => {
    const dir = await workspace();
    const emitted = run(['position', 'usage.jsonl', '--json'], dir);
    assert.equal(emitted.status, 0, emitted.stderr);
    const checked = spawnSync(process.execPath, [CLI, 'conform', '-', '--json'], {
      encoding: 'utf8',
      env: SPAWN_ENV,
      timeout: 30000,
      input: emitted.stdout,
    });
    assert.equal(checked.status, 0, checked.stderr);
    const report = JSON.parse(checked.stdout);
    assert.equal(report.contract, 'position', 'conform did not detect the position document bare');
  });

  it('refuses without a log, teaching the invocation, in both locales', async () => {
    const dir = await workspace();
    for (const locale of ['en', 'es']) {
      const result = run(['position', '--locale', locale], dir);
      assert.equal(result.status, 1);
      assert.ok(result.stderr.includes('trazum position'), `${locale}: the refusal does not teach the invocation`);
    }
  });
});
