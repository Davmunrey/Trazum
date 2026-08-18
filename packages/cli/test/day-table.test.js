import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/**
 * The spend-per-day table in the markdown rendering — the series the peak
 * sentence summarises, with truncation counted out loud. $1.00 = 200k input
 * tokens on Claude Opus 5, as everywhere.
 */

const call = (day, over = {}) => ({
  model: 'claude-opus-5',
  ts: `${day}T10:00:00Z`,
  usage: { input_tokens: 200_000, output_tokens: 0 },
  ...over,
});

const render = async (records) => {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-daytable-'));
  const log = join(dir, 'usage.jsonl');
  await writeFile(log, records.map((r) => JSON.stringify(r)).join('\n') + '\n');
  const out = join(dir, 'report.md');
  const result = spawnSync(process.execPath, [CLI, 'profile', log, '--markdown-out', out], {
    encoding: 'utf8',
    env: SPAWN_ENV,
    timeout: 30000,
  });
  assert.equal(result.status, 0);
  return readFile(out, 'utf8');
};

describe('the day table in markdown', () => {
  it('renders each day with its exact spend and its biggest label', async () => {
    const markdown = await render([
      call('2026-08-01', { label: 'chat' }),
      call('2026-08-02', { label: 'chat' }),
      call('2026-08-02', { label: 'batch', usage: { input_tokens: 400_000, output_tokens: 0 } }),
    ]);
    assert.match(markdown, /\| Day \(UTC\) \| USD \| calls \| biggest that day \|/);
    assert.match(markdown, /\| 2026-08-01 \| \$1\.00 \| 1 \| chat \|/);
    // Day 2 is $3.00 across 2 calls, and batch ($2.00) outspends chat there.
    assert.match(markdown, /\| 2026-08-02 \| \$3\.00 \| 2 \| batch \|/);
  });

  it('caps at 14 days and counts the earlier ones out loud', async () => {
    const days = Array.from({ length: 16 }, (_, i) =>
      call(`2026-08-${String(i + 1).padStart(2, '0')}`),
    );
    const markdown = await render(days);
    // The oldest two days fall off the table, and the table says so.
    assert.doesNotMatch(markdown, /\| 2026-08-01 \|/);
    assert.doesNotMatch(markdown, /\| 2026-08-02 \|/);
    assert.match(markdown, /\| 2026-08-03 \|/);
    assert.match(markdown, /\| 2026-08-16 \|/);
    assert.match(markdown, /and 2 earlier days not shown here/);
  });

  it('renders no table for a single day — one row is the total again', async () => {
    const markdown = await render([call('2026-08-01'), call('2026-08-01')]);
    assert.doesNotMatch(markdown, /\| Day \(UTC\) \|/);
  });
});
