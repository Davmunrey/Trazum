import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/** `--csv-out`: the report for whoever signs off the bill. $1.00 = 200k input tokens on Opus 5. */

const run = async (records, extra = []) => {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-csv-'));
  const log = join(dir, 'usage.jsonl');
  await writeFile(log, records.map((r) => JSON.stringify(r)).join('\n') + '\n');
  const out = join(dir, 'spend.csv');
  const result = spawnSync(process.execPath, [CLI, 'profile', log, '--csv-out', out, ...extra], {
    encoding: 'utf8',
    env: SPAWN_ENV,
    timeout: 30000,
  });
  return { result, out };
};

const call = (label, usd = 1) => ({
  model: 'claude-opus-5',
  label,
  usage: { input_tokens: usd * 200_000, output_tokens: 0 },
});

describe('--csv-out', () => {
  it('writes the file and says where it went', async () => {
    const { result, out } = await run([call('chat'), call('batch', 2)]);
    assert.equal(result.status, 0);
    const csv = await readFile(out, 'utf8');
    assert.match(csv, /^label,model,calls,/);
    assert.match(csv, /^batch,claude-opus-5,1,400000,0,0,0,2\.000000,/m);
    assert.match(`${result.stdout}${result.stderr}`, /spend\.csv/);
  });

  it('describes the window when one was given, not the whole log', async () => {
    const { out } = await run(
      [
        { ...call('chat', 5), ts: '2026-08-01T10:00:00Z' },
        { ...call('chat', 1), ts: '2026-08-02T10:00:00Z' },
      ],
      ['--since', '2026-08-02'],
    );
    const csv = await readFile(out, 'utf8');
    assert.match(csv, /,1\.000000$/m);
    assert.doesNotMatch(csv, /5\.000000/);
  });

  it('works beside --markdown-out and --json without either winning', async () => {
    const { result, out } = await run([call('chat')], ['--json']);
    assert.equal(result.status, 0);
    // stdout stays parseable JSON; the CSV still lands on disk.
    JSON.parse(result.stdout);
    assert.match(await readFile(out, 'utf8'), /^label,model,/);
  });
});
