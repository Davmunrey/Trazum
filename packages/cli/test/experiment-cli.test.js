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
 * `trazum experiment`, end to end.
 *
 * Three failures a laboratory does not have: a winner where there is none,
 * peeking, and a quality difference reported without what it costs.
 */

const run = (cwd, args) =>
  spawnSync(process.execPath, [CLI, 'experiment', ...args], {
    cwd,
    encoding: 'utf8',
    env: SPAWN_ENV,
    timeout: 30000,
  });

const armCalls = (label, successes, n, inputTokens) => [
  ...Array.from({ length: successes }, () => ({
    model: 'claude-opus-5',
    label,
    outcome: 'resolved',
    usage: { input_tokens: inputTokens, output_tokens: 0 },
  })),
  ...Array.from({ length: n - successes }, () => ({
    model: 'claude-opus-5',
    label,
    outcome: 'escalated',
    usage: { input_tokens: inputTokens, output_tokens: 0 },
  })),
];

const workspace = async (records) => {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-experiment-'));
  await writeFile(join(dir, 'usage.jsonl'), `${records.map((r) => JSON.stringify(r)).join('\n')}\n`);
  await writeFile(
    join(dir, 'trazum.config.json'),
    `${JSON.stringify({ outcomes: { values: ['resolved', 'escalated'], success: ['resolved'] } })}\n`,
  );
  return dir;
};

describe('trazum experiment', () => {
  it('names a winner with the interval that makes it one', async () => {
    const dir = await workspace([
      ...armCalls('v2', 800, 1000, 200_000),
      ...armCalls('v1', 500, 1000, 100_000),
    ]);
    const { stdout, status } = run(dir, ['usage.jsonl', '--a', 'v2', '--b', 'v1', '--min-outcomes', '1000']);
    assert.equal(status, 0);
    const text = flat(stdout);
    assert.match(text, /v2 wins/);
    assert.match(text, /whole interval is on one side of zero/);
    assert.match(text, /Stopping rule honoured/);
  });

  it('refuses a winner when one number is merely larger', async () => {
    const dir = await workspace([...armCalls('a', 52, 100, 100_000), ...armCalls('b', 48, 100, 100_000)]);
    const text = flat(run(dir, ['usage.jsonl', '--a', 'a', '--b', 'b', '--min-outcomes', '1000']).stdout);
    assert.match(text, /Not separable on this traffic/);
    assert.match(text, /One number is larger, and that is not a finding/);
    // And the instruction is quantified rather than a shrug.
    assert.match(text, /About [\d,]+ outcomes per arm would settle/);
  });

  it('says there is nothing to find when the rates are identical', async () => {
    // No sample size separates a difference of zero, so there is no "run it
    // longer" to offer.
    const dir = await workspace([...armCalls('a', 50, 100, 100_000), ...armCalls('b', 50, 100, 100_000)]);
    const text = flat(run(dir, ['usage.jsonl', '--a', 'a', '--b', 'b', '--min-outcomes', '10']).stdout);
    assert.match(text, /both arms recorded the same rate/);
    assert.match(text, /there is nothing here to find/);
  });

  it('marks an early read, even when the arms separated', async () => {
    /**
     * A separable result read too early is still separable and still read too
     * early. Collapsing the two would hide one of the facts, and it is always
     * the inconvenient one that goes.
     */
    const dir = await workspace([...armCalls('a', 45, 50, 100_000), ...armCalls('b', 10, 50, 100_000)]);
    const text = flat(run(dir, ['usage.jsonl', '--a', 'a', '--b', 'b', '--min-outcomes', '1000']).stdout);
    assert.match(text, /a wins/);
    assert.match(text, /Read early/);
    assert.match(text, /whoever reads the result later can see that it was/);
  });

  it('prices what an extra success costs', async () => {
    // v2 costs $2 a call and resolves 80%; v1 costs $1 and resolves 50%. The
    // extra 30 points cost $1 a call: $3.33 an extra success.
    const dir = await workspace([
      ...armCalls('v2', 800, 1000, 400_000),
      ...armCalls('v1', 500, 1000, 200_000),
    ]);
    const text = flat(run(dir, ['usage.jsonl', '--a', 'v2', '--b', 'v1', '--min-outcomes', '1000']).stdout);
    assert.match(text, /One extra success costs \$3\.33/);
    assert.match(text, /that figure, not the rate, is what the decision turns on/);
  });

  it('says nothing is being traded when the better arm is also cheaper', async () => {
    const dir = await workspace([
      ...armCalls('v2', 800, 1000, 100_000),
      ...armCalls('v1', 500, 1000, 400_000),
    ]);
    const text = flat(run(dir, ['usage.jsonl', '--a', 'v2', '--b', 'v1', '--min-outcomes', '1000']).stdout);
    assert.match(text, /resolves more AND costs less per call/);
  });

  it('never promotes anything, and says so', async () => {
    const dir = await workspace([...armCalls('a', 80, 100, 100_000), ...armCalls('b', 50, 100, 100_000)]);
    const text = flat(run(dir, ['usage.jsonl', '--a', 'a', '--b', 'b', '--min-outcomes', '10']).stdout);
    assert.match(text, /Nothing was changed/);
    assert.match(text, /a decision with a name attached/);
  });
});

describe('the stopping rule is not optional', () => {
  it('refuses to run without one, and says why', async () => {
    const dir = await workspace(armCalls('a', 5, 10, 100_000));
    const { stderr, status } = run(dir, ['usage.jsonl', '--a', 'a', '--b', 'b']);
    assert.equal(status, 1);
    assert.match(flat(stderr), /--min-outcomes is required/);
    assert.match(flat(stderr), /declared after looking at the numbers is not a stopping rule/);
  });

  it('refuses two arms that were not named', async () => {
    const dir = await workspace(armCalls('a', 5, 10, 100_000));
    const { stderr, status } = run(dir, ['usage.jsonl', '--min-outcomes', '10']);
    assert.equal(status, 1);
    assert.match(flat(stderr), /Name two labels to compare/);
  });
});
