import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

/**
 * `trazum bill` on calls that searched the web, which it billed as if they
 * had searched for nothing: Anthropic charges $10 per 1,000 searches on top
 * of the tokens, and every response counts them.
 */

const cli = new URL('../dist/index.js', import.meta.url).pathname;
const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', env: SPAWN_ENV });

const call = (searches) => JSON.stringify({
  model: 'claude-opus-5',
  ts: '2026-11-01T10:00:00Z',
  usage: { input_tokens: 200_000, output_tokens: 0, server_tool_use: { web_search_requests: searches } },
});

it('bill puts web searches in the total and says how many there were', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'trazum-web-search-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'usage.jsonl');
  // 400k Opus 5 input is $2.00; 300 searches at $10 per 1,000 are $3.00.
  writeFileSync(path, [call(100), call(200)].join('\n'));

  const billed = run('bill', path, '--locale', 'en');
  assert.equal(billed.status, 0, billed.stderr);
  const receipt = JSON.parse(billed.stdout);
  assert.ok(Math.abs(receipt.total.usd - 5) < 1e-9, `billed ${receipt.total.usd}, expected 5`);
  const [line] = receipt.lines;
  assert.equal(line.webSearchRequests, 300);
  assert.ok(Math.abs(line.money.webSearchUsd - 3) < 1e-9, `searches ${line.money.webSearchUsd}`);
  assert.match(billed.stderr, /300 web searches, billed per search on top of the tokens: \$3\.00 of the total/);
});

it('bill names searches on a model with no per-search fee, and leaves them out', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'trazum-web-search-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'usage.jsonl');
  writeFileSync(path, JSON.stringify({
    model: 'gpt-6-astra',
    ts: '2026-11-01T10:00:00Z',
    usage: { input_tokens: 100_000, output_tokens: 0, server_tool_use: { web_search_requests: 7 } },
  }));

  const billed = run('bill', path, '--locale', 'en');
  assert.equal(billed.status, 0, billed.stderr);
  const receipt = JSON.parse(billed.stdout);
  assert.deepEqual(receipt.gaps.find((gap) => gap.kind === 'unpriced-web-search'), {
    kind: 'unpriced-web-search', requests: 7, models: ['gpt-6-astra'],
  });
  assert.match(billed.stderr, /7 web searches on gpt-6-astra, whose price list publishes no per-search fee/);
});
