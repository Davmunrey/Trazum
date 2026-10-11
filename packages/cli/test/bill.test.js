import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { gzipSync } from 'node:zlib';
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

/**
 * The glob and the extension, which once made one directory two bills.
 *
 * `trazum bill logs/*.jsonl` is what a person types, and the shell turns it into
 * every file. Reading the first and dropping the rest priced $0.01 of a $7.51
 * bill with no gap; skipping `.log` priced $7.51 of what `profile` called
 * $15.01. Both understated, both quietly, so both are pinned on totals.
 */
describe('trazum bill reads every path it is given', () => {
  const small = '{"model":"claude-opus-5","ts":"2026-09-01T10:00:00Z","usage":{"input_tokens":1000,"output_tokens":200}}\n';
  const big = '{"model":"claude-opus-5","ts":"2026-09-02T10:00:00Z","usage":{"input_tokens":1000000,"output_tokens":100000}}\n';
  const totalOf = (result) => JSON.parse(result.stdout).total;

  it('prices every file a shell glob expands to, not the first', () => {
    const dir = mkdtempSync(join(tmpdir(), 'trazum-bill-glob-'));
    writeFileSync(join(dir, 'a.jsonl'), small);
    writeFileSync(join(dir, 'b.jsonl'), big);
    const result = run(['bill', join(dir, 'a.jsonl'), join(dir, 'b.jsonl')]);
    assert.equal(result.status, 0, result.stderr);
    const total = totalOf(result);
    assert.equal(total.calls, 2);
    assert.ok(Math.abs(total.usd - 7.51) < 1e-9, `usd ${total.usd}`);
  });

  it('reads a file once when it is named twice', () => {
    const dir = mkdtempSync(join(tmpdir(), 'trazum-bill-twice-'));
    writeFileSync(join(dir, 'a.jsonl'), small);
    writeFileSync(join(dir, 'b.jsonl'), big);
    const result = run(['bill', dir, join(dir, 'b.jsonl')]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(totalOf(result).calls, 2);
  });

  it('reads the same files profile reads, .log and .gz included', () => {
    const dir = mkdtempSync(join(tmpdir(), 'trazum-bill-ext-'));
    writeFileSync(join(dir, 'a.jsonl'), small);
    writeFileSync(join(dir, 'b.ndjson'), big);
    writeFileSync(join(dir, 'c.log'), big);
    writeFileSync(join(dir, 'd.jsonl.gz'), gzipSync(small));
    const bill = run(['bill', dir]);
    assert.equal(bill.status, 0, bill.stderr);
    const profile = run(['profile', dir, '--json']);
    assert.equal(profile.status, 0, profile.stderr);
    assert.equal(totalOf(bill).calls, 4);
    assert.equal(totalOf(bill).calls, JSON.parse(profile.stdout).total.calls);
  });

  it('a one-path command refuses the paths it would ignore, naming the first', () => {
    const dir = mkdtempSync(join(tmpdir(), 'trazum-one-path-'));
    writeFileSync(join(dir, 'a.jsonl'), small);
    writeFileSync(join(dir, 'b.jsonl'), big);
    const result = run(['receipt', join(dir, 'a.jsonl'), join(dir, 'b.jsonl')]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /receipt reads one path and was given 2/);
    assert.match(result.stderr, /b\.jsonl/);
  });
});
