import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

/**
 * Anthropic's usage report in fast mode, through the two doors that read it.
 *
 * The report says which speed ran once it is grouped by `speed`, and the
 * converter ignored it, so a row of Opus 5 fast mode ($10/$50) was billed at
 * $5/$25. A fast row on a model with a fast rate is now priced from it; one on
 * a model with none is left out and named.
 */

const cli = new URL('../dist/index.js', import.meta.url).pathname;
const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', env: SPAWN_ENV });

const row = (model, over = {}) => ({
  uncached_input_tokens: 1500,
  cache_read_input_tokens: 200,
  cache_creation: { ephemeral_5m_input_tokens: 500, ephemeral_1h_input_tokens: 0 },
  output_tokens: 500,
  server_tool_use: { web_search_requests: 0 },
  model,
  service_tier: 'standard',
  context_window: '0-200k',
  workspace_id: null,
  api_key_id: null,
  ...over,
});

const report = (results) =>
  JSON.stringify({
    data: [{ starting_at: '2026-11-01T00:00:00Z', ending_at: '2026-11-02T00:00:00Z', results }],
    has_more: false,
    next_page: null,
  });

it('from-anthropic prices a fast row, names a fast row it cannot price, and a US-only floor', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'trazum-anthropic-speed-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'usage.json');
  writeFileSync(
    path,
    report([
      row('claude-opus-5', { speed: 'fast', inference_geo: 'us' }),
      row('claude-sonnet-4-6', { speed: 'fast' }),
      row('claude-opus-5', { speed: 'standard' }),
    ]),
  );

  const converted = run('from-anthropic', path, '--label', 'billing', '--locale', 'en');
  assert.equal(converted.status, 0, converted.stderr);
  const records = converted.stdout.trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(records.length, 2, 'a fast row on a model with no fast rate was priced anyway');
  assert.deepEqual(records.map((record) => record.usage.speed), ['fast', undefined]);
  assert.match(converted.stderr, /1 row\(s\) ran in fast mode and are priced from the model's own fast rate/);
  assert.match(converted.stderr, /1 row\(s\) ran in fast mode on a model Trazum has no fast rate for \(claude-sonnet-4-6\)/);
  assert.match(converted.stderr, /1 row\(s\) ran with inference_geo "us"/);
  assert.doesNotMatch(converted.stderr, /never named a speed/);
});

it('from-anthropic says when a model with a fast mode was never asked its speed', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'trazum-anthropic-speed-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'usage.json');
  writeFileSync(path, report([row('claude-opus-5')]));
  const converted = run('from-anthropic', path, '--locale', 'en');
  assert.equal(converted.status, 0, converted.stderr);
  assert.match(converted.stderr, /The report never named a speed, and 1 row\(s\) are on a model with a fast mode/);
});

it('bill prices a fast row above the same row at standard speed', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'trazum-anthropic-speed-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const fast = join(dir, 'fast.json');
  const standard = join(dir, 'standard.json');
  writeFileSync(fast, report([row('claude-opus-5', { speed: 'fast' })]));
  writeFileSync(standard, report([row('claude-opus-5', { speed: 'standard' })]));

  const billed = (path) => {
    const result = run('bill', path);
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout).total;
  };
  const atFast = billed(fast);
  const atStandard = billed(standard);
  assert.equal(atFast.calls, atStandard.calls);
  assert.ok(atFast.usd > atStandard.usd, `fast ${atFast.usd} is not above standard ${atStandard.usd}`);
  /* Fast mode doubles every Opus 5 rate, cache included, so the bill doubles. */
  assert.ok(Math.abs(atFast.usd - 2 * atStandard.usd) < 1e-6, `fast ${atFast.usd} is not twice ${atStandard.usd}`);
});
