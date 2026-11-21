import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

/**
 * `bill` on a log of Bedrock and Vertex ids (#858): each is named with its
 * platform and the model inside, nothing is priced, and the receipt is what it
 * was without the hint.
 */

const CLI = new URL('../dist/index.js', import.meta.url).pathname;
const run = (args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env: SPAWN_ENV, timeout: 30000 });

const line = (model) =>
  JSON.stringify({ timestamp: '2026-11-10T09:00:00Z', model, usage: { input_tokens: 1000, output_tokens: 100 } });

describe('bill, on ids from Bedrock and Vertex', () => {
  it('names each with its platform and model, and prices none of them', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'trazum-partner-'));
    const file = join(dir, 'usage.jsonl');
    await writeFile(
      file,
      [
        line('us.anthropic.claude-sonnet-4-6'),
        line('anthropic.claude-haiku-4-5-20251001-v1:0'),
        line('claude-sonnet-4-5@20250929'),
        line('claude-haiku-4-5'),
      ].join('\n'),
    );
    const bill = run(['bill', file]);
    assert.equal(bill.status, 0, bill.stderr);
    assert.match(bill.stderr, /us\.anthropic\.claude-sonnet-4-6 \(Amazon Bedrock, claude-sonnet-4-6\)/);
    assert.match(bill.stderr, /anthropic\.claude-haiku-4-5-20251001-v1:0 \(Amazon Bedrock, claude-haiku-4-5\)/);
    assert.match(bill.stderr, /claude-sonnet-4-5@20250929 \(Vertex AI, claude-sonnet-4-5\)/);
    assert.match(bill.stderr, /stay unpriced rather than billed at Anthropic's/);

    const receipt = JSON.parse(bill.stdout);
    // Only the plain Haiku call is priced: 1000 in at 1 and 100 out at 5 per million.
    assert.deepEqual(receipt.lines.map((l) => l.model), ['claude-haiku-4-5']);
    assert.ok(Math.abs(receipt.total.usd - 0.0015) < 1e-12, `${receipt.total.usd}`);
    assert.deepEqual(receipt.gaps[0].models.sort(), [
      'anthropic.claude-haiku-4-5-20251001-v1:0',
      'claude-sonnet-4-5@20250929',
      'us.anthropic.claude-sonnet-4-6',
    ]);
    // The hint is on stderr only: receipt is byte for byte what `receipt` writes.
    assert.equal(bill.stdout, run(['receipt', file]).stdout);
  });

  it('says nothing when no unpriced id is a partner id', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'trazum-partner-'));
    const file = join(dir, 'usage.jsonl');
    await writeFile(file, [line('claude-haiku-4-5'), line('some-model-nobody-prices')].join('\n'));
    const bill = run(['bill', file]);
    assert.equal(bill.status, 0, bill.stderr);
    assert.doesNotMatch(bill.stderr, /Amazon Bedrock|Vertex AI/);
  });
});
