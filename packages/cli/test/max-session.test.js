import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/**
 * `--max-session-usd`: the unit an agent product blows up in.
 *
 * Hand arithmetic: 200k input tokens on Claude Opus 5 are $1.00, so a
 * conversation's cost is its turn count in dollars.
 */

const turn = (session, i, over = {}) => ({
  model: 'claude-opus-5',
  label: 'agent',
  session,
  ts: new Date(Date.UTC(2026, 7, 1, 10, i, 0)).toISOString(),
  usage: { input_tokens: 200_000, output_tokens: 0 },
  ...over,
});

const run = async (records, argv, config) => {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-maxsession-'));
  if (config) await writeFile(join(dir, 'trazum.config.json'), JSON.stringify(config));
  const log = join(dir, 'usage.jsonl');
  await writeFile(log, records.map((r) => JSON.stringify(r)).join('\n') + '\n');
  return spawnSync(process.execPath, [CLI, 'profile', log, ...argv], {
    cwd: dir, encoding: 'utf8', env: SPAWN_ENV, timeout: 30000,
  });
};
const flat = (r) => `${r.stdout}${r.stderr}`.replace(/\s+/g, ' ');

// s1 runs eight turns ($8.00); s2 and s3 one each. Totals: $10.00.
const LOG = [
  ...Array.from({ length: 8 }, (_, i) => turn('s1', i)),
  turn('s2', 20),
  turn('s3', 30),
];

describe('trazum profile --max-session-usd', () => {
  it('fails on the worst conversation while the total passes', async () => {
    const result = await run(LOG, ['--max-usd', '20', '--max-session-usd', '5']);
    assert.equal(result.status, 1);
    const out = flat(result);
    assert.match(out, /FAILED: the most expensive of 3 conversations cost \$8\.00, over the --max-session-usd limit of \$5\.00/);
  });

  it('never prints the session key, even in the failure', async () => {
    const out = flat(await run(LOG, ['--max-session-usd', '5']));
    assert.doesNotMatch(out, /\bs1\b/);
  });

  it('passes with the floor stated — earlier turns may be outside the log', async () => {
    const result = await run(LOG, ['--max-session-usd', '10']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(flat(result), /the most expensive of 3 cost \$8\.00, against --max-session-usd \$10\.00/);
    assert.match(flat(result), /so this is a floor/);
  });

  it('fails a log with no sessions — not measured is not under budget', async () => {
    const bare = [{ model: 'claude-opus-5', usage: { input_tokens: 200_000, output_tokens: 0 } }];
    const result = await run(bare, ['--max-session-usd', '5']);
    assert.equal(result.status, 1);
    assert.match(flat(result), /no record in this log carries a session, so there are no conversations to judge/);
  });

  it('arms from trazum.config.json, and the flag wins', async () => {
    const viaConfig = await run(LOG, [], { spend: { maxSessionUsd: 5 } });
    assert.equal(viaConfig.status, 1);
    const flagWins = await run(LOG, ['--max-session-usd', '10'], { spend: { maxSessionUsd: 5 } });
    assert.equal(flagWins.status, 0, flagWins.stderr);
  });

  it('carries sessionSpend into --json, keys absent', async () => {
    const result = await run(LOG, ['--json']);
    assert.equal(result.status, 0, result.stderr);
    const { sessionSpend } = JSON.parse(result.stdout);
    assert.equal(sessionSpend.sessions, 3);
    assert.ok(Math.abs(sessionSpend.maxUsd - 8) < 1e-9);
    assert.doesNotMatch(result.stdout, /"s1"/);
  });
});
