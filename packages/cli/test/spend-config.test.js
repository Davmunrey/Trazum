import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/**
 * Money budgets that live in the repository.
 *
 * `budgets` gates the tokens a prompt file may hold; `spend` gates the dollars
 * a usage log records. Hand arithmetic: 200k input tokens on Claude Opus 5 are
 * $1.00.
 */

const project = async (config, records) => {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-spend-'));
  await writeFile(join(dir, 'trazum.config.json'), JSON.stringify(config, null, 2));
  const log = join(dir, 'usage.jsonl');
  await writeFile(log, records.map((r) => JSON.stringify(r)).join('\n') + '\n');
  return { dir, log };
};

const call = (label, usd) => ({
  model: 'claude-opus-5',
  label,
  usage: { input_tokens: usd * 200_000, output_tokens: 0 },
});

const run = (dir, argv) =>
  spawnSync(process.execPath, [CLI, 'profile', ...argv], {
    cwd: dir,
    encoding: 'utf8',
    env: SPAWN_ENV,
    timeout: 30000,
  });

const flat = (result) => `${result.stdout}${result.stderr}`.replace(/\s+/g, ' ');

describe('spend budgets in trazum.config.json', () => {
  it('fails a workload over its own budget, and names it', async () => {
    const { dir, log } = await project(
      { spend: { byLabel: { chat: 2, batch: 10 } } },
      [call('chat', 5), call('batch', 1)],
    );
    const result = run(dir, [log]);
    assert.equal(result.status, 1);
    const text = flat(result);
    assert.match(text, /FAILED — chat spent \$5\.00 against its budget of \$2\.00/);
    assert.match(text, /Within budget: batch spent \$1\.00 against \$10\.00/);
  });

  it('passes when every budgeted workload fits', async () => {
    const { dir, log } = await project({ spend: { byLabel: { chat: 10 } } }, [call('chat', 5)]);
    assert.equal(run(dir, [log]).status, 0);
  });

  it('reports a budgeted workload with no calls as not measured, never as a pass', async () => {
    const { dir, log } = await project(
      { spend: { byLabel: { chat: 10, seasonal: 5 } } },
      [call('chat', 1)],
    );
    const result = run(dir, [log]);
    assert.equal(result.status, 0);
    const text = flat(result);
    assert.match(text, /seasonal has a budget .* and no calls in this log/);
    assert.match(text, /Not a pass/);
    // The absent workload must not appear as a satisfied budget.
    assert.doesNotMatch(text, /Within budget: seasonal/);
  });

  it('takes the whole-log budget from the config, and lets the flag win', async () => {
    const { dir, log } = await project({ spend: { maxUsd: 3 } }, [call('chat', 5)]);
    // Config alone: $5.00 over a $3.00 budget.
    assert.equal(run(dir, [log]).status, 1);
    // The flag wins, as everywhere in this tool.
    assert.equal(run(dir, [log, '--max-usd', '9']).status, 0);
  });

  it('takes the per-day budget from the config — the policy in the repo', async () => {
    const at = (day, usd) => ({
      model: 'claude-opus-5',
      label: 'chat',
      ts: `2026-08-0${day}T10:00:00Z`,
      usage: { input_tokens: usd * 200_000, output_tokens: 0 },
    });
    // $12.00 total, one $10.00 day: the whole-log budget passes, the day
    // budget fails — the gate a total cannot arm, now armed by the config.
    const { dir, log } = await project(
      { spend: { maxUsd: 20, maxDayUsd: 5 } },
      [at(1, 1), at(2, 10), at(3, 1)],
    );
    const result = run(dir, [log]);
    assert.equal(result.status, 1);
    assert.match(flat(result), /FAILED — 2026-08-02 spent \$10\.00, over the --max-day-usd limit of \$5\.00/);

    // And the flag beats the config, like every gate here.
    const loose = run(dir, [log, '--max-day-usd', '15']);
    assert.equal(loose.status, 0, loose.stderr);
  });

  it('fails the config day budget on a clockless log — not measured is not under budget', async () => {
    const { dir, log } = await project({ spend: { maxDayUsd: 5 } }, [call('chat', 1)]);
    const result = run(dir, [log]);
    assert.equal(result.status, 1);
    assert.match(flat(result), /no record in this log carries a timestamp, so there are no days to judge/);
  });

  it('refuses to apply per-label budgets under a time window', async () => {
    const { dir, log } = await project({ spend: { byLabel: { chat: 2 } } }, [
      { ...call('chat', 5), ts: '2026-08-01T10:00:00Z' },
    ]);
    const result = run(dir, [log, '--since', '2026-08-01']);
    // The label is over its budget, but the window means "what chat spent" is
    // a slice — gating on it would judge something the budget does not describe.
    assert.equal(result.status, 0);
    assert.match(flat(result), /were not applied/);
  });

  it('says the gated figure is a floor when the config gates and lines are unreadable', async () => {
    const dir = (await project({ spend: { maxUsd: 100 } }, [call('chat', 1)])).dir;
    const log = join(dir, 'broken.jsonl');
    await writeFile(log, `${JSON.stringify(call('chat', 1))}\nnot json\n`);
    assert.match(flat(run(dir, [log])), /is a floor, not the bill/);
  });

  it('speaks Spanish', async () => {
    const { dir, log } = await project({ spend: { byLabel: { chat: 2 } } }, [call('chat', 5)]);
    const result = run(dir, [log, '--locale', 'es']);
    assert.equal(result.status, 1);
    assert.match(flat(result), /FALLO: chat gastó \$5\.00/);
  });

  it('refuses a negative budget at parse time', async () => {
    const { dir, log } = await project({ spend: { byLabel: { chat: -1 } } }, [call('chat', 1)]);
    const result = run(dir, [log]);
    assert.equal(result.status, 1);
    assert.match(flat(result), /spend\.byLabel\["chat"\]/);
  });
});
