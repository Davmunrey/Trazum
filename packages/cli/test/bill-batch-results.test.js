import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

/**
 * `trazum bill` on a Batch API results file, which it read as nothing before:
 * the model and usage sit inside each line's result, not at its top.
 */

const cli = new URL('../dist/index.js', import.meta.url).pathname;
const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', env: SPAWN_ENV });

const succeeded = (n) => JSON.stringify({
  custom_id: `request-${n}`,
  result: {
    type: 'succeeded',
    message: {
      id: `msg_${n}`, type: 'message', role: 'assistant', model: 'claude-opus-5',
      content: [{ type: 'text', text: 'SYNTHETIC_REPLY' }], stop_reason: 'end_turn',
      usage: { input_tokens: 1_000_000, output_tokens: 1_000_000, service_tier: 'batch' },
    },
  },
});

it('bill reads an Anthropic results file at the batch rate, and leaves the unbilled results out', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'trazum-batch-results-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'results.jsonl');
  writeFileSync(path, [succeeded(1), succeeded(2), JSON.stringify({ custom_id: 'request-3', result: { type: 'expired' } })].join('\n'));

  const billed = run('bill', path);
  assert.equal(billed.status, 0, billed.stderr);
  assert.match(billed.stderr, /batch-results/, 'the file was not recognised as batch results');
  assert.doesNotMatch(billed.stderr, /ambiguous/i);
  const receipt = JSON.parse(billed.stdout);
  assert.equal(receipt.total.calls, 2, 'an expired request was billed, or a succeeded one was not');
  // Two Opus 5 batch calls of 1M in and 1M out: $2.50 + $12.50 each.
  assert.ok(Math.abs(receipt.total.usd - 30) < 1e-9, `billed ${receipt.total.usd}, expected 30`);
  assert.ok(!(billed.stdout + billed.stderr).includes('SYNTHETIC_REPLY'), 'generated text reached the output');
});
