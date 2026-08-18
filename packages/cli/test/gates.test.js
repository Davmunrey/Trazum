import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/**
 * The money gates, and the most expensive day.
 *
 * `check` gates tokens before the money is spent; `--max-usd` and
 * `--max-growth-usd` gate the spend itself, from the provider's own billed
 * counts. Everything here rides exit codes, because that is what CI reads.
 */

const write = async (name, records) => {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-gates-'));
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

/** One call costing exactly $5.00: 1M input tokens on Claude Opus 5. */
const call = (over = {}) => ({
  model: 'claude-opus-5',
  usage: { input_tokens: 1_000_000, output_tokens: 0 },
  ...over,
});

describe('--max-usd, the spend gate', () => {
  it('fails a log over its budget, in dollars the provider billed', async () => {
    const log = await write('usage.jsonl', [call(), call()]); // $10.00
    const result = run([log, '--max-usd', '9.50']);
    assert.equal(result.status, 1);
    assert.match(flat(result), /FAILED — this log spent \$10\.00 against a --max-usd of \$9\.50/);
  });

  it('passes under budget, and says so instead of staying silent', async () => {
    const log = await write('usage.jsonl', [call()]); // $5.00
    const result = run([log, '--max-usd', '9.50']);
    assert.equal(result.status, 0);
    assert.match(flat(result), /Within budget: \$5\.00/);
  });

  it('gates under --json too, because CI reads the exit code there', async () => {
    const log = await write('usage.jsonl', [call(), call()]);
    const result = run([log, '--max-usd', '1', '--json']);
    assert.equal(result.status, 1);
    // The JSON on stdout stays parseable; the verdict rides stderr.
    assert.doesNotThrow(() => JSON.parse(result.stdout));
    assert.match(result.stderr, /FAILED/);
  });
});

describe('--max-growth-usd, the growth gate', () => {
  it('fails when the bill grew more than the limit over the previous log', async () => {
    const before = await write('before.jsonl', [call()]); // $5.00
    const after = await write('after.jsonl', [call(), call(), call()]); // $15.00
    const result = run([after, '--against', before, '--max-growth-usd', '5']);
    assert.equal(result.status, 1);
    assert.match(flat(result), /the bill grew \+\$10\.00 .* limit of \$5\.00/);
  });

  it('passes growth inside the limit', async () => {
    const before = await write('before.jsonl', [call()]);
    const after = await write('after.jsonl', [call()]);
    const result = run([after, '--against', before, '--max-growth-usd', '5']);
    assert.equal(result.status, 0);
  });

  it('alone it is an error, not a flag that silently gates nothing', async () => {
    const log = await write('usage.jsonl', [call()]);
    const result = run([log, '--max-growth-usd', '5']);
    assert.notEqual(result.status, 0);
    assert.match(flat(result), /--max-growth-usd has nothing to compare without --against/);
  });

  it('fails in Spanish with the same arithmetic', async () => {
    const before = await write('before.jsonl', [call()]);
    const after = await write('after.jsonl', [call(), call(), call()]);
    const result = run([after, '--against', before, '--max-growth-usd', '5', '--locale', 'es']);
    assert.equal(result.status, 1);
    assert.match(flat(result), /FALLO — la factura creció \+\$10\.00/);
  });
});

describe('the most expensive day', () => {
  it('names the peak day, its multiple of the median, and the label behind it', async () => {
    const day = (d, label, tokens) => ({
      model: 'claude-opus-5',
      label,
      ts: `${d}T12:00:00Z`,
      usage: { input_tokens: tokens, output_tokens: 0 },
    });
    const log = await write('usage.jsonl', [
      day('2026-08-01', 'chat', 200_000),   // $1.00
      day('2026-08-02', 'chat', 200_000),   // $1.00
      day('2026-08-03', 'chat', 1_000_000), // the spike: $5.00 + $1.00 rag
      day('2026-08-03', 'rag', 200_000),
    ]);
    const out = flat(run([log]));
    assert.match(out, /The most expensive day in this log was 2026-08-03: \$6\.00, 6\.0x the median day/);
    assert.match(out, /Most of it was chat \(\$5\.00\)/);
  });

  it('says nothing about days when the log has no clock', async () => {
    const log = await write('usage.jsonl', [call(), call()]);
    assert.doesNotMatch(flat(run([log])), /most expensive day/i);
  });
});

describe('the clock reaches the markdown rendering', () => {
  it('writes the span, the peak day and the TTL verdict into --markdown-out', async () => {
    const { readFile } = await import('node:fs/promises');
    const turn = (offsetMin, writes) => ({
      model: 'claude-opus-5',
      label: 'chat',
      session: 'a',
      ts: new Date(Date.parse('2026-08-01T10:00:00Z') + offsetMin * 60_000).toISOString(),
      usage: {
        input_tokens: 500,
        output_tokens: 50,
        cache_creation: { ephemeral_5m_input_tokens: writes, ephemeral_1h_input_tokens: 0 },
      },
    });
    const log = await write('usage.jsonl', [turn(0, 10_000), turn(9, 10_000), turn(18, 10_000)]);
    const out = join(log, '..', 'report.md');
    const result = run([log, '--markdown-out', out]);
    assert.equal(result.status, 0, result.stderr);
    const md = await readFile(out, 'utf8');
    assert.match(md, /covers 2026-08-01 → 2026-08-01/);
    assert.match(md, /median of 9m apart/);
    // The failing verdict is loud in markdown the way it is on the terminal.
    assert.match(md, /> ⚠️ .*5-minute entry is gone/);
  });
});
