import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/**
 * What an outcome costs, end to end.
 *
 * The point of the section is a finding no total can make, so the tests are
 * mostly about the figure that is *not* printed and the sentence that appears
 * in its place.
 */

const flat = (text) => text.replace(/\s+/g, ' ');

const run = (cwd, args) =>
  spawnSync(process.execPath, [CLI, 'profile', ...args], {
    cwd,
    encoding: 'utf8',
    env: SPAWN_ENV,
    timeout: 30000,
  });

const call = (label, outcome, inputTokens) => ({
  model: 'claude-opus-5',
  label,
  ...(outcome === null ? {} : { outcome }),
  usage: { input_tokens: inputTokens, output_tokens: 0 },
});

const times = (n, ...args) => Array.from({ length: n }, () => call(...args));

const VOCAB = { outcomes: { values: ['resolved', 'escalated'], success: ['resolved'] } };

const workspace = async (records, config = VOCAB) => {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-per-outcome-'));
  await writeFile(join(dir, 'usage.jsonl'), `${records.map((r) => JSON.stringify(r)).join('\n')}\n`);
  await writeFile(join(dir, 'trazum.config.json'), `${JSON.stringify(config)}\n`);
  return dir;
};

describe('trazum profile — what an outcome costs', () => {
  it('prints both orders and names where they disagree', async () => {
    // `dear` is ten times more per call and half as much per resolution.
    const dir = await workspace([
      ...times(10, 'cheap', 'resolved', 20_000),
      ...times(190, 'cheap', 'escalated', 20_000),
      ...times(20, 'dear', 'resolved', 200_000),
    ]);
    const { stdout, status } = run(dir, ['usage.jsonl']);
    assert.equal(status, 0);
    assert.match(stdout, /What an outcome costs/);
    assert.match(
      flat(stdout),
      /cheap is #2 by cost per call and #1 by cost per success/,
    );
  });

  it('says which of the five reasons a figure is withheld for', async () => {
    const cases = [
      [times(3, 'thin', 'resolved', 200_000), /3 so far/],
      [
        [...times(20, 'sparse', 'resolved', 200_000), ...times(20, 'sparse', null, 200_000)],
        /50\.0% covered/,
      ],
      [times(20, 'failing', 'escalated', 200_000), /none succeeded/],
      /**
       * A workload that recorded nothing, **beside one that did**.
       *
       * With nothing recorded anywhere the section does not print at all, and
       * that is right: the coverage section below already names the missing
       * field and what it would unlock, and a table of "not recorded" rows
       * above it would be the same sentence in a grid. The case worth showing
       * is the mixed one, where a silent workload sits next to a measured one
       * and the difference is the point.
       */
      [
        [...times(20, 'measured', 'resolved', 200_000), ...times(20, 'silent', null, 200_000)],
        /not recorded/,
      ],
    ];
    for (const [records, expected] of cases) {
      const { stdout } = run(await workspace(records), ['usage.jsonl']);
      assert.match(stdout, expected, `expected ${expected} in the withheld cell`);
    }
  });

  it('prints nothing at all when no workload recorded an outcome', async () => {
    const dir = await workspace(times(20, 'silent', null, 200_000));
    const { stdout } = run(dir, ['usage.jsonl']);
    assert.doesNotMatch(stdout, /What an outcome costs/);
    // And the coverage section still asks for the field.
    assert.match(flat(stdout), /an "outcome"/);
  });

  it('says so when no vocabulary is declared rather than printing a figure', async () => {
    const dir = await workspace(times(20, 'x', 'resolved', 200_000), {});
    const { stdout } = run(dir, ['usage.jsonl']);
    assert.match(stdout, /no vocabulary/);
  });

  it('always states what share of the spend the figure covers', async () => {
    // A ratio over a sample presented without its sample size is a claim about
    // the whole.
    const dir = await workspace(times(20, 'good', 'resolved', 200_000));
    const { stdout } = run(dir, ['usage.jsonl']);
    assert.match(flat(stdout), /recorded/);
    assert.match(flat(stdout), /never the whole bill/);
    assert.match(flat(stdout), /gets a working feature killed/);
  });
});
