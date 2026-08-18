import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/**
 * Which workloads pay for truncated answers, and at what rate.
 *
 * The rate's denominator is the calls that recorded a stop reason — never
 * every call — because a workload logging the field half the time is not a
 * workload whose other half completed. Output on Claude Opus 5 is $25/MTok,
 * so 40k output tokens are $1.00.
 */

const call = (label, over = {}) => ({
  model: 'claude-opus-5',
  label,
  usage: { input_tokens: 1_000, output_tokens: 40_000 },
  ...over,
});

const run = async (records, extra = []) => {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-trunc-'));
  const log = join(dir, 'usage.jsonl');
  await writeFile(log, records.map((r) => JSON.stringify(r)).join('\n') + '\n');
  return spawnSync(process.execPath, [CLI, 'profile', log, ...extra], {
    encoding: 'utf8',
    env: SPAWN_ENV,
    timeout: 30000,
  });
};

const flat = (result) => `${result.stdout}${result.stderr}`.replace(/\s+/g, ' ');

describe('truncation, with suspects', () => {
  it('names the workload paying for it and its rate over measured calls', async () => {
    const result = await run([
      call('chat', { stop_reason: 'max_tokens' }),
      call('chat', { stop_reason: 'end_turn' }),
      call('batch', { stop_reason: 'end_turn' }),
      call('batch', { stop_reason: 'end_turn' }),
    ]);
    assert.equal(result.status, 0);
    const text = flat(result);
    // One of chat's two measured calls was cut off: 50%, $1.00 of output.
    assert.match(text, /chat: 1 of 2 calls that recorded a stop reason were cut off \(50\.0%\), \$1\.00/);
    // batch truncated nothing, so it is not named.
    assert.doesNotMatch(text, /batch: \d+ of/);
  });

  it('counts only measured calls in the denominator', async () => {
    const result = await run([
      call('chat', { stop_reason: 'max_tokens' }),
      // No stop_reason at all: not measured, so not in the denominator.
      call('chat'),
      call('chat'),
      // A second workload, so the suspects list is worth printing at all.
      call('batch', { stop_reason: 'end_turn' }),
    ]);
    // 1 of 1 measured, not 1 of 3.
    assert.match(flat(result), /chat: 1 of 1 calls that recorded a stop reason were cut off \(100\.0%\)/);
  });

  it('says nothing about suspects when one label is the whole log', async () => {
    const result = await run([call('only', { stop_reason: 'max_tokens' })]);
    const text = flat(result);
    assert.match(text, /hit the max_tokens ceiling|cut off mid-generation/);
    // Naming the single label would restate the total.
    assert.doesNotMatch(text, /only: 1 of/);
  });

  it('carries the suspects into the markdown rendering', async () => {
    const { readFile } = await import('node:fs/promises');
    const dir = await mkdtemp(join(tmpdir(), 'trazum-trunc-md-'));
    const log = join(dir, 'usage.jsonl');
    await writeFile(
      log,
      [
        call('chat', { stop_reason: 'max_tokens' }),
        call('chat', { stop_reason: 'end_turn' }),
        call('batch', { stop_reason: 'end_turn' }),
      ]
        .map((r) => JSON.stringify(r))
        .join('\n') + '\n',
    );
    const out = join(dir, 'report.md');
    const result = spawnSync(process.execPath, [CLI, 'profile', log, '--markdown-out', out], {
      encoding: 'utf8',
      env: SPAWN_ENV,
      timeout: 30000,
    });
    assert.equal(result.status, 0);
    const markdown = await readFile(out, 'utf8');
    assert.match(markdown, /- chat: 1 of 2 calls that recorded a stop reason/);
  });

  it('speaks Spanish', async () => {
    const result = await run(
      [call('chat', { stop_reason: 'max_tokens' }), call('batch', { stop_reason: 'end_turn' })],
      ['--locale', 'es'],
    );
    assert.match(flat(result), /llamadas que registraron motivo de parada quedaron cortadas/);
  });
});
