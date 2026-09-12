import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { SPAWN_ENV } from './env.mjs';

/**
 * One door, and what it refuses to open.
 *
 * `bill` composes the converters; what is tested here is not their
 * arithmetic, which each has its own file for, but the door's own promises:
 * every file is named with its shape, a file no shape claims is named and
 * not guessed, a provider's bill is pointed at `reconcile`, and the receipt
 * at the end is the same document `receipt` writes.
 */

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/* Under the pinned environment every spawn here uses, so the English these
   assertions read is the English the process writes, whatever the machine's
   own locale says. */
const run = (args) =>
  spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env: SPAWN_ENV, timeout: 60000 });

function mixed() {
  const dir = mkdtempSync(join(tmpdir(), 'trazum-bill-'));
  writeFileSync(
    join(dir, 'usage.jsonl'),
    '{"model":"claude-opus-5","ts":"2026-09-01T10:00:00Z","usage":{"input_tokens":1000,"output_tokens":200}}\n',
  );
  writeFileSync(
    join(dir, 'activity.json'),
    JSON.stringify({
      data: [
        {
          byok_usage_inference: 0,
          completion_tokens: 125,
          date: '2026-09-02',
          endpoint_id: '550e8400-e29b-41d4-a716-446655440000',
          model: 'openai/gpt-4.1',
          model_permaslug: 'openai/gpt-4.1-2025-04-14',
          prompt_tokens: 50,
          provider_name: 'OpenAI',
          reasoning_tokens: 25,
          requests: 5,
          usage: 0.015,
        },
      ],
    }),
  );
  writeFileSync(
    join(dir, 'cost.json'),
    JSON.stringify({
      data: [{ starting_at: '2026-09-01T00:00:00Z', ending_at: '2026-09-02T00:00:00Z', results: [{ amount: '400.00', currency: 'USD' }] }],
      has_more: false,
    }),
  );
  writeFileSync(join(dir, 'other.json'), '{"hello":"world"}\n');
  return dir;
}

describe('trazum bill reads a directory of whatever it finds', () => {
  it('names every file with its shape, and prices what it read', () => {
    const dir = mixed();
    const out = join(dir, 'receipt.json');
    const result = run(['bill', dir, '-o', out]);
    assert.equal(result.status, 0, result.stderr);

    assert.match(result.stderr, /usage\.jsonl: usage-log/);
    assert.match(result.stderr, /activity\.json: openrouter, 1 record/);
    /* A bill is not usage, and the door for it is named. */
    assert.match(result.stderr, /cost\.json: .*reconcile/);
    /* Not guessed at. */
    assert.match(result.stderr, /other\.json: no shape/);
    assert.match(result.stderr, /2 of 4 file\(s\) read as usage/);

    const receipt = JSON.parse(readFileSync(out, 'utf8'));
    assert.equal(receipt.total.calls, 1);
    assert.ok(receipt.total.usd > 0);
    /* The slug the bundled catalogue does not price is a named gap, not a
       zero: this is where --pricing-live earns its keep. */
    const unpriced = receipt.gaps.find((gap) => gap.kind === 'unpriced');
    assert.deepEqual(unpriced?.models, ['openai/gpt-4.1']);
    /* And the door says which flag prices a slug, derived from that gap. */
    assert.match(result.stderr, /--pricing-live/);
  });

  it('does not hint at --pricing-live when nothing unpriced is a slug', () => {
    const dir = mixed();
    const result = run(['bill', join(dir, 'usage.jsonl')]);
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stderr, /--pricing-live/);
  });

  it('writes the receipt to stdout when no file is asked for', () => {
    const dir = mixed();
    const result = run(['bill', join(dir, 'usage.jsonl')]);
    assert.equal(result.status, 0, result.stderr);
    const receipt = JSON.parse(result.stdout);
    assert.equal(receipt.total.calls, 1);
  });

  it('refuses a directory in which nothing is usage, by name', () => {
    const dir = mkdtempSync(join(tmpdir(), 'trazum-bill-empty-'));
    writeFileSync(join(dir, 'notes.json'), '{"a":1}\n');
    const result = run(['bill', dir]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /nothing to bill/);
  });

  it('needs a path, and says what to give it', () => {
    const result = run(['bill']);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /trazum bill/);
  });
});
