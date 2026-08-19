import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/**
 * "Approaching the context window" on every surface.
 *
 * The arithmetic is tested in the core suite; these pin the volume levels —
 * loud from 85%, quiet from 50%, silent below — and that the section refuses
 * to predict when the ceiling is crossed. Claude Haiku 4.5's window is
 * 200,000 tokens, so the shares below are checkable by eye.
 */

const call = (inputTokens, over = {}) => ({
  model: 'claude-haiku-4-5',
  label: 'chat',
  usage: { input_tokens: inputTokens, output_tokens: 0 },
  ...over,
});

const run = async (records, argv = []) => {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-pressure-'));
  const log = join(dir, 'usage.jsonl');
  await writeFile(log, records.map((r) => JSON.stringify(r)).join('\n') + '\n');
  const result = spawnSync(process.execPath, [CLI, 'profile', log, ...argv], {
    encoding: 'utf8',
    env: SPAWN_ENV,
    timeout: 30000,
  });
  return { result, dir };
};

const flat = ({ result }) => `${result.stdout}${result.stderr}`.replace(/\s+/g, ' ');

describe('the context window on screen', () => {
  it('is loud at 95% and names the numbers, not a date', async () => {
    const out = flat(await run([call(190_000)]));
    assert.match(out, /Approaching the context window/);
    assert.match(out, /chat on Claude Haiku 4\.5: the largest call carried 190,000 input tokens against a 200,000-token window — 95\.0% of the ceiling/);
    assert.match(out, /At 100% the call fails outright/);
    // The refusal, pinned: no prediction of when.
    assert.match(out, /When it crosses is not predicted here|the trajectory is yours to know/);
  });

  it('is quiet at 60% — visible, not alarming', async () => {
    const out = flat(await run([call(120_000)]));
    assert.match(out, /60\.0% of the ceiling/);
    assert.doesNotMatch(out, /At 100% the call fails outright/);
  });

  it('is silent below half the window', async () => {
    const out = flat(await run([call(90_000)]));
    assert.doesNotMatch(out, /Approaching the context window/);
  });

  it('carries the rows into --json', async () => {
    const { result } = await run([call(190_000)], ['--json']);
    assert.equal(result.status, 0, result.stderr);
    const { contextPressure } = JSON.parse(result.stdout);
    assert.equal(contextPressure.length, 1);
    assert.equal(contextPressure[0].maxCallInputTokens, 190_000);
    assert.equal(contextPressure[0].contextWindow, 200_000);
    assert.ok(Math.abs(contextPressure[0].share - 0.95) < 1e-9);
  });

  it('reaches the CI summary, loud with the advice attached', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'trazum-pressure-md-'));
    const out = join(dir, 'bill.md');
    const { result } = await run([call(190_000)], ['--markdown-out', out]);
    assert.equal(result.status, 0, result.stderr);
    const md = await readFile(out, 'utf8');
    assert.match(md, /⚠️ .*95\.0% of the ceiling/);
    assert.match(md, /At 100% the call fails outright/);
  });
});
