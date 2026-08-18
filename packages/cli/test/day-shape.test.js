import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/** The shape of the day, and the lever it points at without claiming it. */

const at = (hour, usd = 1) => ({
  model: 'claude-opus-5',
  ts: `2026-08-01T${String(hour).padStart(2, '0')}:30:00Z`,
  usage: { input_tokens: usd * 200_000, output_tokens: 0 },
});

const run = async (records, extra = []) => {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-hours-'));
  const log = join(dir, 'usage.jsonl');
  await writeFile(log, records.map((r) => JSON.stringify(r)).join('\n') + '\n');
  return spawnSync(process.execPath, [CLI, 'profile', log, ...extra], {
    encoding: 'utf8',
    env: SPAWN_ENV,
    timeout: 30000,
  });
};

const flat = (result) => `${result.stdout}${result.stderr}`.replace(/\s+/g, ' ');

describe('the shape of the day', () => {
  it('calls concentrated spend what it is, and names the hours', async () => {
    // $20 in two hours, $1 spread over four others: 80% needs two hours.
    const records = [at(9, 10), at(10, 10), at(2), at(4), at(6), at(20)];
    const text = flat(await run(records));
    assert.match(text, /80% of this spend lands in 2 hours of the UTC day \(09:00, 10:00\)/);
    assert.match(text, /Batch API's 24-hour turnaround does not fit/);
  });

  it('calls a flat day flat, and points at the lever without claiming the saving', async () => {
    const records = Array.from({ length: 24 }, (_, hour) => at(hour));
    const text = flat(await run(records));
    assert.match(text, /takes 20 hours of the UTC day to cover 80%/);
    assert.match(text, /Whether these calls can wait is yours to say/);
  });

  it('says nothing when the log has too few hours to have a shape', async () => {
    const text = flat(await run([at(9), at(10)]));
    assert.doesNotMatch(text, /of the UTC day/);
  });

  it('says nothing when the log carries no clock', async () => {
    const text = flat(
      await run([
        { model: 'claude-opus-5', usage: { input_tokens: 200_000, output_tokens: 0 } },
        { model: 'claude-opus-5', usage: { input_tokens: 200_000, output_tokens: 0 } },
      ]),
    );
    assert.doesNotMatch(text, /of the UTC day/);
  });

  it('speaks Spanish', async () => {
    const records = [at(9, 10), at(10, 10), at(2), at(4), at(6), at(20)];
    const text = flat(await run(records, ['--locale', 'es']));
    assert.match(text, /del día UTC/);
  });
});
