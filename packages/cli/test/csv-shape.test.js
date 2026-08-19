import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/** `--csv-shape`: which table the spreadsheet gets. */

const at = (day, hour, usd) => ({
  model: 'claude-opus-5',
  label: 'chat',
  ts: `${day}T${String(hour).padStart(2, '0')}:30:00Z`,
  usage: { input_tokens: usd * 200_000, output_tokens: 0 },
});

const run = async (shape) => {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-csvshape-'));
  const log = join(dir, 'usage.jsonl');
  await writeFile(
    log,
    [at('2026-08-01', 9, 1), at('2026-08-02', 10, 2)].map((r) => JSON.stringify(r)).join('\n') + '\n',
  );
  const out = join(dir, 'out.csv');
  const argv = [CLI, 'profile', log, '--csv-out', out];
  if (shape !== undefined) argv.push('--csv-shape', shape);
  const result = spawnSync(process.execPath, argv, {
    encoding: 'utf8',
    env: SPAWN_ENV,
    timeout: 30000,
  });
  return { result, out };
};

describe('--csv-shape', () => {
  it('defaults to the label-and-model table', async () => {
    const { result, out } = await run(undefined);
    assert.equal(result.status, 0);
    assert.match(await readFile(out, 'utf8'), /^label,model,calls,/);
  });

  it('writes the per-day series on request', async () => {
    const { result, out } = await run('day');
    assert.equal(result.status, 0);
    const csv = await readFile(out, 'utf8');
    assert.match(csv, /^day,usd,calls,top_label,top_label_usd/);
    assert.match(csv, /^2026-08-02,2\.000000,1,chat,2\.000000$/m);
  });

  it('writes the per-hour series on request', async () => {
    const { result, out } = await run('hour');
    assert.equal(result.status, 0);
    const csv = await readFile(out, 'utf8');
    assert.match(csv, /^hour_utc,usd,calls/);
    assert.match(csv, /^10,2\.000000,1$/m);
  });

  it('writes the model-day series, one row per day and model', async () => {
    const { result, out } = await run('model-day');
    assert.equal(result.status, 0, result.stderr);
    const csv = await readFile(out, 'utf8');
    const rows = csv.trimEnd().split('\n');
    assert.equal(rows[0], 'day,model,usd,calls');
    assert.equal(rows[1], '2026-08-01,claude-opus-5,1.000000,1');
    assert.equal(rows[2], '2026-08-02,claude-opus-5,2.000000,1');
  });

  it('refuses a shape it does not know, naming the ones it does', async () => {
    const { result } = await run('weekly');
    assert.equal(result.status, 1);
    assert.match(`${result.stdout}${result.stderr}`, /--csv-shape does not know "weekly"/);
  });
});
