import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

/**
 * `trazum model-pricing`, run rather than read (#856): the contracted rates an
 * organisation gave Claude Code, written as an overlay, then used through
 * `--pricing` on a log whose bill is worked out by hand.
 */

const CLI = new URL('../dist/index.js', import.meta.url).pathname;
const run = (args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env: SPAWN_ENV, timeout: 30000 });

const SETTINGS = {
  permissions: { deny: ['Bash(curl:*)'] },
  modelPricing: {
    multiplier: 0.85,
    overrides: {
      'claude-sonnet-4-6': { input: 2.4, output: 12, cacheRead: 0.24, cacheWrite: 3 },
      'us.anthropic.claude-sonnet-4-6-v1:0': { input: 2.4, output: 12, cacheRead: 0.24, cacheWrite: 3 },
    },
  },
};

const LOG = [
  {
    timestamp: '2026-11-10T09:00:00Z',
    model: 'claude-sonnet-4-6',
    label: 'a',
    usage: {
      input_tokens: 1_000_000,
      output_tokens: 100_000,
      cache_read_input_tokens: 2_000_000,
      cache_creation: { ephemeral_5m_input_tokens: 400_000, ephemeral_1h_input_tokens: 0 },
    },
  },
  { timestamp: '2026-11-10T09:01:00Z', model: 'claude-haiku-4-5', label: 'a', usage: { input_tokens: 1_000_000, output_tokens: 1_000_000 } },
]
  .map((line) => JSON.stringify(line))
  .join('\n');

const workspace = async () => {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-model-pricing-'));
  await writeFile(join(dir, 'managed-settings.json'), JSON.stringify(SETTINGS));
  await writeFile(join(dir, 'usage.jsonl'), LOG);
  return dir;
};

describe('model-pricing, run', () => {
  it('writes an overlay that bills a log at the contracted rates, dated by the overlay', async () => {
    const dir = await workspace();
    const overlay = join(dir, 'overlay.json');
    const made = run(['model-pricing', join(dir, 'managed-settings.json'), '--reviewed', '2026-11-20', '-o', overlay]);
    assert.equal(made.status, 0, made.stderr);
    assert.match(made.stderr, /"us\.anthropic\.claude-sonnet-4-6-v1:0" is not a model the catalogue knows/);
    assert.match(made.stderr, /1 model\(s\) at the rates in your table, times 0\.85; 21 other Claude model\(s\) at list price times 0\.85\./);
    assert.match(made.stderr, /Fast mode: .*claude-fable-5-2/);
    assert.doesNotMatch(await readFile(overlay, 'utf8'), /curl|permissions/);

    const receipt = run(['receipt', join(dir, 'usage.jsonl'), '--pricing', overlay]);
    assert.equal(receipt.status, 0, receipt.stderr);
    const document = JSON.parse(receipt.stdout);
    // By hand. Sonnet 4.6 at 0.85 of its row: 2.04 + 1.02 + 0.408 + 1.02 = 4.488.
    // Haiku 4.5 at 0.85 of list (1 and 5): 0.85 + 4.25 = 5.10. Together 9.588.
    assert.ok(Math.abs(document.total.usd - 9.588) < 1e-9, `${document.total.usd}`);
    for (const line of document.lines) assert.equal(line.pricing.reviewedOn, '2026-11-20', line.model);
  });

  it('writes the overlay to stdout without -o', async () => {
    const dir = await workspace();
    const made = run(['model-pricing', join(dir, 'managed-settings.json'), '--reviewed', '2026-11-20']);
    assert.equal(made.status, 0, made.stderr);
    assert.equal(JSON.parse(made.stdout).lastReviewed, '2026-11-20');
  });

  it('refuses without a file, without a date, and on a file with no modelPricing', async () => {
    const dir = await workspace();
    assert.match(run(['model-pricing']).stderr, /managed-settings\.json/);
    assert.match(run(['model-pricing', join(dir, 'managed-settings.json')]).stderr, /--reviewed YYYY-MM-DD is required/);
    await writeFile(join(dir, 'other.json'), '{"permissions":{}}');
    const none = run(['model-pricing', join(dir, 'other.json'), '--reviewed', '2026-11-20']);
    assert.equal(none.status, 1);
    assert.match(none.stderr, /no "modelPricing"/);
  });

  it('refuses a directory, and a file past the overlay ceiling without reading it whole', async () => {
    const dir = await workspace();
    assert.match(run(['model-pricing', dir, '--reviewed', '2026-11-20']).stderr, /is not a file/);
    // Valid JSON, one byte past 64 KiB: refused for its size, never parsed.
    const big = join(dir, 'big.json');
    await writeFile(big, `{"modelPricing":{"multiplier":0.9},"pad":"${'x'.repeat(64 * 1024)}"}`);
    const refused = run(['model-pricing', big, '--reviewed', '2026-11-20']);
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /larger than 65536 bytes/);
  });
});
