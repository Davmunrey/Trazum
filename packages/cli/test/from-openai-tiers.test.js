import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

/**
 * OpenAI's usage report at a service tier, through the two doors that read it.
 *
 * Until this, every row at a tier but `default` was left out of the bill, so
 * an organisation running on Flex saw none of it. A row whose model has that
 * tier's table is now carried with `service_tier` and priced from the table;
 * one whose model has none is still left out and named.
 */

const cli = new URL('../dist/index.js', import.meta.url).pathname;
const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', env: SPAWN_ENV });

const row = (model, tier) => ({
  object: 'organization.usage.completions.result',
  input_tokens: 900,
  input_cached_tokens: 400,
  input_cache_write_tokens: 0,
  input_uncached_tokens: 500,
  output_tokens: 500,
  input_text_tokens: 500,
  input_cached_text_tokens: 400,
  output_text_tokens: 500,
  num_model_requests: 1,
  project_id: null,
  user_id: null,
  api_key_id: null,
  model,
  batch: false,
  service_tier: tier,
});

const report = (results) =>
  JSON.stringify({
    object: 'page',
    data: [{ object: 'bucket', start_time: 1793491200, end_time: 1793577600, results }],
    has_more: false,
    next_page: null,
  });

it('from-openai carries a priced tier into the record and names a refused one', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'trazum-openai-tiers-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'usage.json');
  writeFileSync(path, report([row('gpt-5.4', 'flex'), row('gpt-4o-mini', 'flex'), row('gpt-5.4', 'default')]));

  const converted = run('from-openai', path, '--label', 'billing', '--locale', 'en');
  assert.equal(converted.status, 0, converted.stderr);
  const records = converted.stdout.trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(records.length, 2, 'GPT-4o mini has no Flex table, and its Flex row was priced anyway');
  assert.deepEqual(records.map((record) => record.service_tier), ['flex', undefined]);
  assert.match(converted.stderr, /1 row\(s\) ran at another service tier \(flex\) and are priced from that tier's own table/);
  assert.match(converted.stderr, /1 row\(s\) were at a service tier Trazum has no table for on that model \(flex\)/);
});

it('bill prices a Flex row below the same row at the default tier', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'trazum-openai-tiers-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const flex = join(dir, 'flex.json');
  const standard = join(dir, 'standard.json');
  writeFileSync(flex, report([row('gpt-5.4', 'flex')]));
  writeFileSync(standard, report([row('gpt-5.4', 'default')]));

  const billed = (path) => {
    const result = run('bill', path);
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout).total;
  };
  const atFlex = billed(flex);
  const atStandard = billed(standard);
  assert.equal(atFlex.calls, 1, 'the Flex row was left out of the bill');
  assert.ok(atFlex.usd > 0);
  assert.ok(atFlex.usd < atStandard.usd, `Flex ${atFlex.usd} is not below standard ${atStandard.usd}`);
});

it('bill prices a batch row at half the same row run synchronously', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'trazum-openai-tiers-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const batch = join(dir, 'batch.json');
  const standard = join(dir, 'standard.json');
  writeFileSync(batch, report([{ ...row('gpt-5.4', 'default'), batch: true }]));
  writeFileSync(standard, report([{ ...row('gpt-5.4', 'default'), batch: false }]));

  const billed = (path) => {
    const result = run('bill', path);
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout).total;
  };
  const atBatch = billed(batch);
  const atStandard = billed(standard);
  assert.equal(atBatch.calls, 1, 'the batch row was left out of the bill');
  assert.ok(Math.abs(atBatch.usd - atStandard.usd / 2) < 1e-9, `batch ${atBatch.usd} is not half of ${atStandard.usd}`);

  const converted = run('from-openai', batch, '--locale', 'en');
  assert.match(converted.stderr, /1 row\(s\) were batch jobs and are priced at the model's batch rate/);
});
