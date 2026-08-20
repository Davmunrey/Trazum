import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;
const flat = (text) => text.replace(/\s+/g, ' ');

/**
 * `trazum ladder`, end to end.
 *
 * Two ladders configured identically, one saving 70% a call and one costing
 * 10% more than never having built it. The only difference is a measured
 * escalation rate that no configuration file can show you, which is the whole
 * reason the command exists.
 */

const run = (cwd, args) =>
  spawnSync(process.execPath, [CLI, 'ladder', ...args], {
    cwd,
    encoding: 'utf8',
    env: SPAWN_ENV,
    timeout: 30000,
  });

const calls = (n, label, outcome) =>
  Array.from({ length: n }, () => ({
    model: 'claude-haiku-4-5',
    label,
    outcome,
    usage: { input_tokens: 200_000, output_tokens: 0 },
  }));

const TIERS = ['claude-haiku-4-5', 'claude-opus-5'];

const workspace = async (records, ladders, outcomes = { values: ['resolved', 'escalated'], success: ['resolved'] }) => {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-ladder-'));
  await writeFile(join(dir, 'usage.jsonl'), `${records.map((r) => JSON.stringify(r)).join('\n')}\n`);
  await writeFile(join(dir, 'trazum.config.json'), `${JSON.stringify({ outcomes, ladders })}\n`);
  return dir;
};

describe('trazum ladder', () => {
  it('separates a saving ladder from an identical one that is a bill', async () => {
    const dir = await workspace(
      [
        ...calls(90, 'support', 'resolved'),
        ...calls(10, 'support', 'escalated'),
        ...calls(10, 'triage', 'resolved'),
        ...calls(90, 'triage', 'escalated'),
      ],
      {
        support: { tiers: TIERS, escalateOn: ['escalated'] },
        triage: { tiers: TIERS, escalateOn: ['escalated'] },
      },
    );
    const { stdout, status } = run(dir, ['usage.jsonl']);
    assert.equal(status, 0);
    const text = flat(stdout);
    assert.match(text, /Break-even escalation rate: 80\.0%/);
    assert.match(text, /Saving \$0\.7000 a call/);
    assert.match(text, /Costing \$0\.1000 a call MORE/);
  });

  it('fails the command on a ladder that escalates on a success', async () => {
    /**
     * The most expensive possible typo in the config: it pays twice for work
     * that already worked, on every call, while looking exactly like a
     * cost-saving measure. It is wrong *now* rather than a measurement to look
     * at, so it is the one finding here that exits non-zero.
     */
    const dir = await workspace(calls(20, 'x', 'resolved'), {
      x: { tiers: TIERS, escalateOn: ['resolved'] },
    });
    const { stdout, status } = run(dir, ['usage.jsonl']);
    assert.equal(status, 1);
    assert.match(flat(stdout), /declares a SUCCESS/);
    assert.match(flat(stdout), /pays twice for work that already worked/);
  });

  it('names a ladder that would silently never fire', async () => {
    const dir = await workspace(calls(20, 'x', 'resolved'), {
      x: { tiers: TIERS, escalateOn: ['nobody-declared-this'] },
    });
    const { stdout, status } = run(dir, ['usage.jsonl']);
    assert.equal(status, 1);
    assert.match(flat(stdout), /never fires, silently/);
  });

  it('refuses a sign inside the break-even band rather than flipping weekly', async () => {
    const dir = await workspace(
      [...calls(20, 'x', 'resolved'), ...calls(80, 'x', 'escalated')],
      { x: { tiers: TIERS, escalateOn: ['escalated'] } },
    );
    assert.match(flat(run(dir, ['usage.jsonl']).stdout), /no sign is claimed/);
  });

  it('says how few calls rather than stating a rate from them', async () => {
    const dir = await workspace(calls(4, 'x', 'escalated'), {
      x: { tiers: TIERS, escalateOn: ['escalated'] },
    });
    assert.match(flat(run(dir, ['usage.jsonl']).stdout), /Cannot tell yet: 4 calls/);
  });

  it('says what a ladder is when none is configured', async () => {
    const dir = await workspace(calls(20, 'x', 'resolved'), {});
    const { stdout, status } = run(dir, ['usage.jsonl']);
    assert.equal(status, 0);
    assert.match(flat(stdout), /No ladders configured/);
  });

  it('says plainly that it does not run the escalation', async () => {
    // A command that printed ladder arithmetic without this line would read as
    // a feature that routes traffic, which it is not.
    const dir = await workspace(calls(20, 'x', 'resolved'), {
      x: { tiers: TIERS, escalateOn: ['escalated'] },
    });
    assert.match(flat(run(dir, ['usage.jsonl']).stdout), /Trazum does not run the escalation/);
  });
});

describe('the ladders config refuses what it cannot run', () => {
  it('requires escalateOn rather than defaulting to "not a success"', async () => {
    // That default would mean adding a word to the vocabulary silently starts
    // sending traffic to a more expensive model.
    const dir = await workspace(calls(2, 'x', 'resolved'), { x: { tiers: TIERS } });
    const { stderr, status } = run(dir, ['usage.jsonl']);
    assert.equal(status, 1);
    assert.match(flat(stderr), /escalateOn.*is required/);
    assert.match(flat(stderr), /silently starts sending traffic to a more expensive model/);
  });
});
