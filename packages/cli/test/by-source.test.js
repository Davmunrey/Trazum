import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/**
 * The fleet: one report per service, plus the rollup. $1.00 = 200k input
 * tokens on Claude Opus 5, as everywhere in this suite.
 */

const line = (record) => JSON.stringify(record);

const setup = async () => {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-fleet-'));
  await mkdir(join(dir, 'logs/api'), { recursive: true });
  await mkdir(join(dir, 'logs/web'), { recursive: true });
  await writeFile(join(dir, 'logs/api/day.jsonl'), [
    line({ model: 'claude-opus-5', label: 'support', ts: '2026-08-01T09:00:00Z', usage: { input_tokens: 2_000_000, output_tokens: 0 } }),
    line({ model: 'claude-opus-5', label: 'support', ts: '2026-08-10T09:00:00Z', usage: { input_tokens: 2_000_000, output_tokens: 0 } }),
  ].join('\n') + '\n');
  await writeFile(join(dir, 'logs/web/day.jsonl'),
    line({ model: 'claude-haiku-4-5', label: 'support', ts: '2026-08-05T09:00:00Z', usage: { input_tokens: 1_000_000, output_tokens: 0 } }) + '\n');
  await writeFile(join(dir, 'logs/stray.jsonl'),
    line({ model: 'claude-opus-5', label: 'misc', ts: '2026-08-05T09:00:00Z', usage: { input_tokens: 200_000, output_tokens: 0 } }) + '\n');
  return dir;
};

const run = (dir, config, extra = []) =>
  spawnSync(process.execPath, [CLI, 'profile', 'logs', '--by-source', '--config', config, ...extra], {
    encoding: 'utf8',
    env: SPAWN_ENV,
    timeout: 30000,
    cwd: dir,
  });

const flat = (result) => `${result.stdout}${result.stderr}`.replace(/\s+/g, ' ');

describe('profile --by-source', () => {
  it('splits the fleet, names the bleeder, and refuses nothing silently', async () => {
    const dir = await setup();
    const config = join(dir, 'trazum.config.json');
    await writeFile(config, JSON.stringify({ sources: { api: ['logs/api/**'], web: ['logs/web/**'] } }));
    const result = run(dir, config);
    assert.equal(result.status, 0, result.stderr);
    const out = flat(result);

    assert.match(out, /The fleet: 2 sources · \$21\.00 · 3 calls/);
    assert.match(out, /api \$20\.00 95\.2% of the fleet/);
    // The one that is actually bleeding, named with its share.
    assert.match(out, /api is where the money is: \$20\.00, 95\.2%/);
    // Mismatched spans: shares compare totals, not rates, and it says so.
    assert.match(out, /shares above compare totals, not rates/);
    // The split brain a merged bill cannot show.
    assert.match(out, /support: api → claude-opus-5 \(\$20\.00\), web → claude-haiku-4-5 \(\$1\.00\)/);
    // The stray file is in no report, and that is said, never silent.
    assert.match(out, /stray\.jsonl matched no source pattern/);
  });

  it('gates each source against its own budget and names the failing service', async () => {
    const dir = await setup();
    const config = join(dir, 'trazum.config.json');
    await writeFile(config, JSON.stringify({
      sources: { api: ['logs/api/**'], web: ['logs/web/**'] },
      spend: { bySource: { api: 5, web: 10, ghost: 1 } },
    }));
    const result = run(dir, config);
    assert.equal(result.status, 1, 'the failing source must fail the run');
    const out = flat(result);
    assert.match(out, /FAILED — api spent \$20\.00 against its budget of \$5\.00/);
    assert.match(out, /Within budget: web spent \$1\.00/);
    // A budgeted source with no logs is named, not passed: "did not appear"
    // is not "under budget".
    assert.match(out, /ghost has a budget in spend\.bySource and no logs matched/);
  });

  it('carries the fleet in --json: per-source reports plus the rollup', async () => {
    const dir = await setup();
    const config = join(dir, 'trazum.config.json');
    await writeFile(config, JSON.stringify({ sources: { api: ['logs/api/**'], web: ['logs/web/**'] } }));
    const result = run(dir, config, ['--json']);
    assert.equal(result.status, 0, result.stderr);
    const doc = JSON.parse(result.stdout);
    assert.equal(doc.bySource.length, 2);
    const api = doc.bySource.find((s) => s.name === 'api');
    assert.ok(Math.abs(api.report.total.totalUsd - 20) < 1e-9);
    assert.equal(doc.rollup.worst.name, 'api');
    assert.equal(doc.rollup.mismatchedSpans, true);
    assert.equal(doc.rollup.splitBrains[0].label, 'support');
    assert.deepEqual(doc.rollup.unmatchedFiles, [join('logs', 'stray.jsonl')]);
  });

  it('refuses to run without a sources block, naming the fix', async () => {
    const dir = await setup();
    const config = join(dir, 'trazum.config.json');
    await writeFile(config, JSON.stringify({}));
    const result = run(dir, config);
    assert.equal(result.status, 1);
    assert.match(flat(result), /reads the "sources" block .* and this config has none/);
  });

  it('speaks Spanish', async () => {
    const dir = await setup();
    const config = join(dir, 'trazum.config.json');
    await writeFile(config, JSON.stringify({ sources: { api: ['logs/api/**'], web: ['logs/web/**'] } }));
    const result = run(dir, config, ['--locale', 'es']);
    assert.match(flat(result), /api es donde está el dinero/);
  });
});
