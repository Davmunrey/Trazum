import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/**
 * What a CI job summary says.
 *
 * `--markdown-out` is what a pull request comment and a GitHub job summary
 * show, which is where most people will ever read this report. A finding the
 * terminal makes and the summary omits is a finding nobody sees — and a
 * summary that words a finding differently is a second opinion nobody asked
 * for. These pin the three newest sections into it.
 */

const call = (over = {}) => ({
  model: 'claude-opus-5',
  label: 'rag',
  ts: '2026-08-01T10:00:00.000Z',
  usage: { input_tokens: 200_000, output_tokens: 0 },
  ...over,
});

const many = (count, over = {}) => Array.from({ length: count }, () => call(over));

const render = async (records, argv = []) => {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-profile-md-'));
  const log = join(dir, 'usage.jsonl');
  const out = join(dir, 'bill.md');
  await writeFile(log, records.map((r) => JSON.stringify(r)).join('\n') + '\n');
  const result = spawnSync(process.execPath, [CLI, 'profile', log, '--markdown-out', out, ...argv], {
    encoding: 'utf8',
    env: SPAWN_ENV,
    timeout: 30000,
  });
  assert.equal(result.status, 0, result.stderr);
  return readFile(out, 'utf8');
};

describe('the profile as a CI summary', () => {
  it('warns about a doubled bill above the figures it would inflate', async () => {
    // Three identical timestamped lines: $3.00, of which $2.00 is duplicated.
    const md = await render([call(), call(), call()]);
    assert.match(md, /⚠️ .*2 lines are exact duplicates of an earlier line/);
    assert.match(md, /that adds \$2\.00 to the total above/);
    const warning = md.indexOf('exact duplicates');
    const levers = md.indexOf('#'.repeat(4));
    assert.ok(warning < levers, 'the duplicate warning printed below the analysis it undermines');
  });

  it('describes how big the calls are, with the same threshold as the terminal', async () => {
    const md = await render([
      ...many(40, { usage: { input_tokens: 1_000, output_tokens: 0 } }),
      ...many(5, { usage: { input_tokens: 100_000, output_tokens: 0 } }),
    ]);
    assert.match(md, /is uneven: half its calls fit within 1,024 input tokens and 95% within 106,496/);
    assert.match(md, /The fix is a limit on the large calls, not a rewrite/);
  });

  it('renders the repricing with the assumption above the figure', async () => {
    const md = await render(many(2), ['--what-if', 'claude-haiku-4-5']);
    const caveat = md.indexOf('multiplication, not advice');
    const figure = md.indexOf('of movable spend');
    assert.ok(caveat > 0, 'the assumption never rendered');
    assert.ok(caveat < figure, 'the assumption rendered after the figure it qualifies');
    assert.match(md, /\$2\.00 of movable spend would have been \$0\.4000/);
  });

  it('names a slice the target model could not have taken', async () => {
    const md = await render(
      [call({ label: 'huge', usage: { input_tokens: 250_000, output_tokens: 0 } })],
      ['--what-if', 'claude-haiku-4-5'],
    );
    assert.match(md, /⚠️ .*huge cannot move/);
    assert.doesNotMatch(md, /of movable spend would have been/);
  });

  it('says nothing about a repricing nobody asked for', async () => {
    const md = await render(many(2));
    assert.doesNotMatch(md, /movable spend/);
  });
});
