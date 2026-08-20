import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/**
 * The outcome, end to end.
 *
 * The core decides; this checks that a reader actually sees the three things
 * that stop the rate being misread: what it covers, what it does not, and
 * which values nobody declared.
 */

const run = (cwd, args) =>
  spawnSync(process.execPath, [CLI, 'profile', ...args], {
    cwd,
    encoding: 'utf8',
    env: SPAWN_ENV,
    timeout: 30000,
  });

const call = (outcome, inputTokens = 100_000) => ({
  model: 'claude-opus-5',
  label: 'support',
  ...(outcome === null ? {} : { outcome }),
  usage: { input_tokens: inputTokens, output_tokens: 0 },
});

const workspace = async (records, config) => {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-outcome-'));
  await writeFile(join(dir, 'usage.jsonl'), `${records.map((r) => JSON.stringify(r)).join('\n')}\n`);
  if (config !== undefined) {
    await writeFile(join(dir, 'trazum.config.json'), `${JSON.stringify(config)}\n`);
  }
  return dir;
};

const VOCAB = { outcomes: { values: ['resolved', 'escalated'], success: ['resolved'] } };

/**
 * Collapses the wrapping before matching.
 *
 * The report wraps prose at 74 columns, so a sentence under test can break
 * across a line at any word depending on how long a dollar figure came out.
 * Asserting on the wrapped text makes a test that fails when a number gets
 * wider, which is a test about the terminal and not about the claim.
 */
const flat = (text) => text.replace(/\s+/g, ' ');

describe('trazum profile — outcomes', () => {
  it('reports the rate by spend, and says which figure it is', async () => {
    // Two calls, one each way, but the failure cost three times the success:
    // 50% by call and 25% by spend, and the report prints the one that matters.
    const dir = await workspace([call('resolved', 100_000), call('escalated', 300_000)], VOCAB);
    const { stdout, status } = run(dir, ['usage.jsonl']);
    assert.equal(status, 0);
    assert.match(stdout, /Outcomes/);
    assert.match(stdout, /25(\.0)?% of/);
    assert.match(flat(stdout), /by spend rather than by call/);
  });

  it('always says what share of the bill the rate does not cover', async () => {
    const dir = await workspace([call('resolved'), call(null), call(null), call(null)], VOCAB);
    const { stdout } = run(dir, ['usage.jsonl']);
    assert.match(flat(stdout), /75(\.0)?% of the bill .* carried no outcome/);
    assert.match(stdout, /neither half/);
  });

  it('names an undeclared value instead of counting it as a failure', async () => {
    const dir = await workspace([call('resolved'), call('resolvd')], VOCAB);
    const { stdout } = run(dir, ['usage.jsonl']);
    assert.match(stdout, /undeclared/);
    assert.match(flat(stdout), /Not declared in "outcomes\.values": resolvd/);
    // Still 100%: the typo is in neither half of the rate.
    assert.match(stdout, /100(\.0)?% of/);
  });

  it('says nothing at all when no record carried one', async () => {
    // The coverage section below already names the missing field and what it
    // would unlock; an empty Outcomes heading above it is the same sentence
    // twice.
    const dir = await workspace([call(null), call(null)], VOCAB);
    const { stdout } = run(dir, ['usage.jsonl']);
    assert.doesNotMatch(stdout, /^Outcomes$/m);
    assert.match(stdout, /an "outcome"/);
    assert.match(flat(stdout), /cannot say whether it stopped working/);
  });

  it('declines a rate rather than inventing one when nothing declares success', async () => {
    const dir = await workspace([call('escalated')], { outcomes: { values: ['escalated'], success: [] } });
    const { stdout } = run(dir, ['usage.jsonl']);
    assert.match(stdout, /No success rate/);
    assert.match(flat(stdout), /declares no values/);
  });

  it('reports values with no vocabulary as undeclared rather than guessing', async () => {
    const dir = await workspace([call('resolved')], undefined);
    const { stdout } = run(dir, ['usage.jsonl']);
    assert.match(stdout, /undeclared/);
  });
});

describe('the outcomes config refuses what it cannot judge', () => {
  const parse = async (outcomes) => {
    const dir = await workspace([call('resolved')], { outcomes });
    return run(dir, ['usage.jsonl']);
  };

  it('requires "success", because that judgement is not this tool\'s to make', async () => {
    const { stderr, status } = await parse({ values: ['resolved'] });
    assert.equal(status, 1);
    assert.match(flat(stderr), /"outcomes\.success".*is required/);
    assert.match(flat(stderr), /judgement about your product/);
    assert.match(flat(stderr), /Use \[\] if none of them are/);
  });

  it('refuses a success value the vocabulary never declared', async () => {
    const { stderr, status } = await parse({ values: ['escalated'], success: ['resolved'] });
    assert.equal(status, 1);
    assert.match(flat(stderr), /"resolved", which "outcomes\.values" does not declare/);
  });

  it('refuses a duplicated value', async () => {
    const { stderr } = await parse({ values: ['resolved', 'resolved'], success: [] });
    assert.match(flat(stderr), /lists "resolved" more than once/);
  });
});
