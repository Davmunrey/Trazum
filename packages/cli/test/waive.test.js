import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/**
 * Findings as policy: a gate failure the team has decided to live with, on
 * the record, for a bounded time. $12.00 log against an $8.00 budget, so the
 * gate always fires and only the waiver decides the exit code.
 */

const FUTURE = '2099-01-01';
const PAST = '2020-01-01';

const setup = async (config) => {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-waive-'));
  const log = join(dir, 'usage.jsonl');
  await writeFile(log, [
    JSON.stringify({ model: 'claude-opus-5', label: 'rag', usage: { input_tokens: 2_000_000, output_tokens: 0 } }),
    JSON.stringify({ model: 'claude-opus-5', label: 'chat', usage: { input_tokens: 400_000, output_tokens: 0 } }),
  ].join('\n') + '\n');
  const path = join(dir, 'trazum.config.json');
  await writeFile(path, JSON.stringify(config));
  return { log, config: path };
};

const run = (log, config, extra = []) =>
  spawnSync(process.execPath, [CLI, 'profile', log, '--config', config, ...extra], {
    encoding: 'utf8',
    env: SPAWN_ENV,
    timeout: 30000,
  });

const flat = (result) => `${result.stdout}${result.stderr}`.replace(/\s+/g, ' ');

describe('waive: findings as policy', () => {
  it('silences the exit code and never the failure, with the reason on the record', async () => {
    const { log, config } = await setup({
      spend: { maxUsd: 8 },
      waive: [{ gate: 'maxUsd', reason: 'August migration doubles traffic', until: FUTURE }],
    });
    const result = run(log, config);
    assert.equal(result.status, 0, 'an active waiver must quiet the exit code');
    const out = flat(result);
    // Shown as waived, never hidden: the failure prints, then the waiver.
    assert.match(out, /FAILED: this log spent \$12\.00/);
    assert.match(out, /WAIVED: the maxUsd failure above is on the record and silenced until 2099-01-01/);
    assert.match(out, /"August migration doubles traffic"/);
    assert.match(out, /the day the waiver expires this gate fails again/);
  });

  it('an expired waiver silences nothing and says so beside the failure', async () => {
    const { log, config } = await setup({
      spend: { maxUsd: 8 },
      waive: [{ gate: 'maxUsd', reason: 'was covering the July spike', until: PAST }],
    });
    const result = run(log, config);
    assert.equal(result.status, 1, 'an expired waiver must not quiet anything');
    const out = flat(result);
    assert.match(out, /The waiver on maxUsd expired on 2020-01-01/);
    assert.match(out, /"was covering the July spike"/);
    assert.match(out, /a finding deleted with extra steps/);
  });

  it('waives exactly the gate it names, and no sibling', async () => {
    // maxUsd waived; the label budget still fails on its own.
    const { log, config } = await setup({
      spend: { maxUsd: 8, byLabel: { rag: 5 } },
      waive: [{ gate: 'maxUsd', reason: 'known and accepted', until: FUTURE }],
    });
    const result = run(log, config);
    assert.equal(result.status, 1, 'the unwaived label budget must still fail');
    assert.match(flat(result), /WAIVED: the maxUsd failure/);
    assert.match(flat(result), /FAILED, rag spent/);
  });

  it('waives one label budget through byLabel:<label>', async () => {
    const { log, config } = await setup({
      spend: { byLabel: { rag: 5 } },
      waive: [{ gate: 'byLabel:rag', reason: 'rag rebuild in progress', until: FUTURE }],
    });
    const result = run(log, config);
    assert.equal(result.status, 0);
    assert.match(flat(result), /WAIVED: the byLabel:rag failure/);
  });

  it('refuses a waiver with no reason, no expiry, or an unknown gate', async () => {
    for (const [entry, message] of [
      [{ gate: 'maxUsd', until: FUTURE }, /reason.*required/],
      [{ gate: 'maxUsd', reason: 'x', until: 'forever' }, /must be a date/],
      [{ gate: 'maxTypo', reason: 'x', until: FUTURE }, /names no gate/],
    ]) {
      const { log, config } = await setup({ spend: { maxUsd: 8 }, waive: [entry] });
      const result = run(log, config);
      assert.equal(result.status, 1, JSON.stringify(entry));
      assert.match(flat(result), message);
    }
  });

  it('never waives the coverage refusal, which is not a budget decision', async () => {
    // The growth gate's blind-comparison failure has no gate key on purpose:
    // a waiver on unmeasurability would be a decision to stop measuring.
    const dir = await mkdtemp(join(tmpdir(), 'trazum-waive-cov-'));
    const prev = join(dir, 'prev.jsonl');
    await writeFile(prev, [0, 1, 2, 3].map((i) =>
      JSON.stringify({ model: 'claude-opus-5', session: `s${i}`, ts: `2026-08-01T0${i}:00:00Z`, usage: { input_tokens: 200_000, output_tokens: 0 } }),
    ).join('\n') + '\n');
    const now = join(dir, 'now.jsonl');
    await writeFile(now, [0, 1, 2, 3].map((i) =>
      JSON.stringify({ model: 'claude-opus-5', ts: `2026-08-08T0${i}:00:00Z`, usage: { input_tokens: 200_000, output_tokens: 0 } }),
    ).join('\n') + '\n');
    const config = join(dir, 'trazum.config.json');
    await writeFile(config, JSON.stringify({
      waive: [{ gate: 'maxGrowthUsd', reason: 'accepted growth', until: FUTURE }],
    }));
    const result = spawnSync(
      process.execPath,
      [CLI, 'profile', now, '--config', config, '--against', prev, '--max-growth-usd', '100'],
      { encoding: 'utf8', env: SPAWN_ENV, timeout: 30000 },
    );
    assert.equal(result.status, 1, 'the blind comparison must fail through any waiver');
    assert.match(flat(result), /stopped recording session/);
  });

  it('speaks Spanish', async () => {
    const { log, config } = await setup({
      spend: { maxUsd: 8 },
      waive: [{ gate: 'maxUsd', reason: 'migración de agosto', until: FUTURE }],
    });
    const result = spawnSync(process.execPath, [CLI, 'profile', log, '--config', config, '--locale', 'es'], {
      encoding: 'utf8', env: SPAWN_ENV, timeout: 30000,
    });
    assert.equal(result.status, 0);
    assert.match(flat(result), /WAIVED: el fallo de maxUsd de arriba queda registrado/);
  });
});
