import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/**
 * What the comparison stopped being able to see, rendered. $1.00 = 200k input
 * tokens on Claude Opus 5, as everywhere in this suite.
 */

const call = (day, hour, extra = {}) => ({
  model: 'claude-opus-5',
  label: 'chat',
  ts: `${day}T${String(hour).padStart(2, '0')}:00:00Z`,
  usage: { input_tokens: 200_000, output_tokens: 0 },
  ...extra,
});

const write = async (records) => {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-covdrift-'));
  const path = join(dir, 'usage.jsonl');
  await writeFile(path, records.map((r) => JSON.stringify(r)).join('\n') + '\n');
  return path;
};

const run = (argv) =>
  spawnSync(process.execPath, [CLI, 'profile', ...argv], {
    encoding: 'utf8',
    env: SPAWN_ENV,
    timeout: 30000,
  });

const flat = (result) => `${result.stdout}${result.stderr}`.replace(/\s+/g, ' ');

/** Four sessioned calls one week, four unsessioned the next: the same bill. */
const sessioned = () => [0, 1, 2, 3].map((i) => call('2026-08-01', 9 + i, { session: `s${i}` }));
const blind = () => [0, 1, 2, 3].map((i) => call('2026-08-08', 9 + i));

describe('coverage drift in --against', () => {
  it('names a field the log stopped recording, beside an unchanged bill', async () => {
    const previous = await write(sessioned());
    const current = await write(blind());
    const out = flat(run([current, '--against', previous]));

    // The dollars are identical on both sides — which is exactly why this
    // section has to exist: nothing else in the comparison would speak.
    assert.match(out, /\$4\.00 → \$4\.00/);
    assert.match(out, /Coverage moved: session was on 100\.0% of records and is now on 0\.0%/);
    assert.match(out, /is not a finding that got fixed/);
    // The session keys are grouped and never printed, here as everywhere.
    for (const key of ['"s0"', '"s1"']) assert.ok(!out.includes(key), `session key ${key} leaked`);
  });

  it('states a field that appeared, quietly — the report can see more, not less', async () => {
    const previous = await write(blind());
    const current = await write(sessioned());
    const out = flat(run([current, '--against', previous]));
    assert.match(out, /Coverage moved: session was on 0\.0% of records and is now on 100\.0%/);
    // The warning about silenced findings belongs to a collapse only.
    assert.doesNotMatch(out, /is not a finding that got fixed/);
  });

  it('stays silent when coverage held', async () => {
    const previous = await write(sessioned());
    const current = await write([0, 1, 2, 3].map((i) => call('2026-08-08', 9 + i, { session: `t${i}` })));
    assert.doesNotMatch(flat(run([current, '--against', previous])), /Coverage moved/);
  });

  it('speaks Spanish', async () => {
    const previous = await write(sessioned());
    const current = await write(blind());
    const result = spawnSync(process.execPath, [CLI, 'profile', current, '--against', previous, '--locale', 'es'], {
      encoding: 'utf8',
      env: SPAWN_ENV,
      timeout: 30000,
    });
    assert.match(flat(result), /La cobertura se movió: sesión estaba en el 100\.0%/);
  });
});
