import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/**
 * The cache gate, and why it reads the worst case.
 *
 * Hand arithmetic on Claude Opus 5 ($5/MTok input): 1M cache-write tokens at
 * the 5-minute rate cost $6.25 against $5.00 as plain input — a +$1.25 loss
 * when nothing reads them. The same million with the TTL unstated is +$1.25
 * at the assumed rate and +$5.00 if the writes were 1-hour — and a gate
 * reading the flattering half would pass exactly the bills it exists to
 * catch.
 */

const write = async (name, records) => {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-cacheloss-'));
  const path = join(dir, name);
  await writeFile(path, records.map((r) => JSON.stringify(r)).join('\n') + '\n');
  return path;
};

const run = (argv) =>
  spawnSync(process.execPath, [CLI, 'profile', ...argv], {
    encoding: 'utf8',
    env: SPAWN_ENV,
    timeout: 30000,
  });

const flat = (result) => `${result.stdout}${result.stderr}`.replace(/\s+/g, ' ');

/** 1M writes with the TTL recorded as 5-minute. Loss: exactly +$1.25. */
const settledWrites = {
  model: 'claude-opus-5',
  usage: {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 1_000_000,
    cache_creation: { ephemeral_5m_input_tokens: 1_000_000, ephemeral_1h_input_tokens: 0 },
  },
};

/** The same million with the TTL unstated: +$1.25 assumed, +$5.00 worst case. */
const unstatedWrites = {
  model: 'claude-opus-5',
  usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 1_000_000 },
};

describe('--max-cache-loss-usd', () => {
  it('fails a settled loss over the limit, with the exact figure', async () => {
    const log = await write('usage.jsonl', [settledWrites]);
    const result = run([log, '--max-cache-loss-usd', '1']);
    assert.equal(result.status, 1);
    assert.match(flat(result), /FAILED — caching added \$1\.25 .*limit of \$1\.00/);
  });

  it('passes a settled loss under the limit, and says so', async () => {
    const log = await write('usage.jsonl', [settledWrites]);
    const result = run([log, '--max-cache-loss-usd', '1.50']);
    assert.equal(result.status, 0);
    assert.match(flat(result), /Cache within budget: caching cost at most \$1\.25/);
  });

  it('reads the worst case when the TTL is unstated, and says which claim fired', async () => {
    const log = await write('usage.jsonl', [unstatedWrites]);
    // The assumed loss ($1.25) is under the limit; the 1-hour worst case
    // ($5.00) is over it. The flattering half must not decide.
    const result = run([log, '--max-cache-loss-usd', '2']);
    assert.equal(result.status, 1);
    const text = flat(result);
    assert.match(text, /FAILED — 1 call did not record which cache-write TTL/);
    assert.match(text, /up to \$5\.00, over the --max-cache-loss-usd limit of \$2\.00/);
    assert.match(text, /worst case on purpose/);
  });

  it('passes when even the worst case fits', async () => {
    const log = await write('usage.jsonl', [unstatedWrites]);
    const result = run([log, '--max-cache-loss-usd', '6']);
    assert.equal(result.status, 0);
    assert.match(flat(result), /at most \$5\.00 against --max-cache-loss-usd \$6\.00/);
  });

  it('a cache that saved money passes a zero budget', async () => {
    const reads = {
      model: 'claude-opus-5',
      usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 10_000_000 },
    };
    const log = await write('usage.jsonl', [settledWrites, reads]);
    // Spent $6.25 + $5.00 in reads at 0.1x; the same tokens as plain input
    // are $55.00 — caching took $43.75 off the bill.
    const result = run([log, '--max-cache-loss-usd', '0']);
    assert.equal(result.status, 0);
  });

  it('gates under --json too, because CI reads the exit code there', async () => {
    const log = await write('usage.jsonl', [settledWrites]);
    const result = run([log, '--max-cache-loss-usd', '1', '--json']);
    assert.equal(result.status, 1);
    // stdout stays parseable JSON; the verdict rides stderr.
    JSON.parse(result.stdout);
    assert.match(result.stderr, /FAILED/);
  });

  it('fails in Spanish with FALLO', async () => {
    const log = await write('usage.jsonl', [settledWrites]);
    const result = spawnSync(
      process.execPath,
      [CLI, 'profile', log, '--max-cache-loss-usd', '1', '--locale', 'es'],
      { encoding: 'utf8', env: SPAWN_ENV, timeout: 30000 },
    );
    assert.equal(result.status, 1);
    assert.match(flat(result), /FALLO: cachear añadió \$1\.25/);
  });
});
