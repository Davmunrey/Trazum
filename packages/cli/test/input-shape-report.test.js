import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/**
 * "How big these calls are" on screen.
 *
 * The measurement is tested against hand arithmetic in the core suite; this
 * pins the two sentences it can produce and the refusal between them. Both are
 * findings — an even slice and a skewed one want opposite responses — so the
 * one thing that must never happen is the section printing the same advice for
 * both.
 */

const call = (inputTokens, over = {}) => ({
  model: 'claude-opus-5',
  label: 'rag',
  usage: { input_tokens: inputTokens, output_tokens: 0 },
  ...over,
});

const many = (count, inputTokens, over = {}) =>
  Array.from({ length: count }, () => call(inputTokens, over));

const run = async (records, argv = []) => {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-inputshape-'));
  const log = join(dir, 'usage.jsonl');
  await writeFile(log, records.map((r) => JSON.stringify(r)).join('\n') + '\n');
  return spawnSync(process.execPath, [CLI, 'profile', log, ...argv], {
    encoding: 'utf8',
    env: SPAWN_ENV,
    timeout: 30000,
  });
};

const flat = (result) => `${result.stdout}${result.stderr}`.replace(/\s+/g, ' ');

describe('the input shape on screen', () => {
  it('names a skew and points at a limit, not a rewrite', async () => {
    const out = flat(await run([...many(40, 1_000), ...many(5, 100_000)]));
    assert.match(out, /How big these calls are/);
    assert.match(out, /rag on Claude Opus 5 is uneven/);
    assert.match(out, /half its calls fit within 1,024 input tokens and 95% within 106,496/);
    assert.match(out, /The fix is a limit on the large calls, not a rewrite/);
  });

  it('names an even slice and points at the prompt instead', async () => {
    const out = flat(await run(many(40, 50_000)));
    assert.match(out, /rag on Claude Opus 5 is even/);
    assert.match(out, /there is no tail to cap/);
    assert.doesNotMatch(out, /is uneven/);
  });

  it('says when the size is mostly cache reads, and when it is not', async () => {
    const cached = flat(
      await run(
        many(40, 0, { usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 200_000 } }),
      ),
    );
    assert.match(cached, /100\.0% of those tokens were cache reads, billed at a tenth of the input rate/);

    const fresh = flat(await run(many(40, 200_000)));
    assert.match(fresh, /Almost none of that was a cache read/);
  });

  it('says nothing at all when no slice has enough calls to measure', async () => {
    // Nineteen calls: a p95 there is the largest of nineteen wearing a
    // percentile's name, and no sentence is better than a precise-looking one.
    const out = flat(await run(many(19, 200_000)));
    assert.doesNotMatch(out, /How big these calls are/);
  });

  it('carries the shapes into --json', async () => {
    const result = await run([...many(40, 1_000), ...many(5, 100_000)], ['--json']);
    assert.equal(result.status, 0, result.stderr);
    const { inputShapes } = JSON.parse(result.stdout);
    assert.equal(inputShapes.length, 1);
    assert.equal(inputShapes[0].medianWithinTokens, 1_024);
    assert.equal(inputShapes[0].p95WithinTokens, 106_496);
  });
});
