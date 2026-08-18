import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/**
 * The token budget against what the call actually carried.
 *
 * `budgets` gates a prompt file; the log records the whole call. When the gap
 * is wide the gate is real but tiny — and a green build says nothing about
 * the other ninety-six per cent.
 */

const project = async (config, records) => {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-budgetwire-'));
  await mkdir(join(dir, 'prompts'));
  await writeFile(join(dir, 'prompts', 'support.txt'), 'You are a support agent.\n');
  await writeFile(join(dir, 'trazum.config.json'), JSON.stringify(config, null, 2));
  const log = join(dir, 'usage.jsonl');
  await writeFile(log, records.map((r) => JSON.stringify(r)).join('\n') + '\n');
  return { dir, log };
};

const call = (inputTokens, label = 'support') => ({
  model: 'claude-opus-5',
  label,
  usage: { input_tokens: inputTokens, output_tokens: 100 },
});

const run = (dir, argv) =>
  spawnSync(process.execPath, [CLI, 'profile', ...argv], {
    cwd: dir,
    encoding: 'utf8',
    env: SPAWN_ENV,
    timeout: 30000,
  });

const flat = (result) => `${result.stdout}${result.stderr}`.replace(/\s+/g, ' ');

const wired = {
  labels: { support: 'prompts/support.txt' },
  budgets: { 'prompts/**': 2000 },
};

describe('the budget against the wire', () => {
  it('says what share of the call the gate can actually see', async () => {
    const { dir, log } = await project(wired, [call(50_000), call(50_000)]);
    const text = flat(run(dir, [log]));
    assert.match(text, /budget on prompts\/support\.txt is 2,000 tokens/);
    assert.match(text, /about 50,000 input tokens each/);
    assert.match(text, /roughly 4\.0% of what actually goes up the wire/);
    assert.match(text, /The budget is not wrong; it is just smaller than the bill/);
  });

  it('stays quiet when the budget covers most of the call', async () => {
    // A 2,000-token budget against 3,000-token calls: the gate sees two
    // thirds, which is a gate doing its job.
    const { dir, log } = await project(wired, [call(3_000)]);
    assert.doesNotMatch(flat(run(dir, [log])), /goes up the wire/);
  });

  it('counts cached tokens too — a cached token was still sent', async () => {
    const { dir, log } = await project(wired, [
      { model: 'claude-opus-5', label: 'support', usage: { input_tokens: 1_000, cache_read_input_tokens: 99_000, output_tokens: 10 } },
    ]);
    assert.match(flat(run(dir, [log])), /about 100,000 input tokens each/);
  });

  it('says nothing without the labels map', async () => {
    const { dir, log } = await project({ budgets: { 'prompts/**': 2000 } }, [call(50_000)]);
    assert.doesNotMatch(flat(run(dir, [log])), /goes up the wire/);
  });

  it('says nothing without a budget covering the file', async () => {
    const { dir, log } = await project({ labels: { support: 'prompts/support.txt' } }, [call(50_000)]);
    assert.doesNotMatch(flat(run(dir, [log])), /goes up the wire/);
  });

  it('speaks Spanish', async () => {
    const { dir, log } = await project(wired, [call(50_000)]);
    assert.match(flat(run(dir, [log, '--locale', 'es'])), /de lo que realmente sale por el cable/);
  });
});
