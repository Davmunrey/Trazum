import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/**
 * `optimize` is the command anybody runs first, and it reports the smallest line
 * item on the bill.
 *
 * That is not a defect in the measurement — the rules really do recover about 1%,
 * measured. It was a defect in the product: everything that moves 40% to 80% lives
 * in `profile`, which needs a usage log a new reader does not have and has no
 * reason to go looking for. A tool that learned that and only said it in the
 * command you reach last has not said it.
 */

const promptFile = async (text) => {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-front-'));
  const path = join(dir, 'prompt.txt');
  await writeFile(path, text);
  return { path, out: join(dir, 'out.txt') };
};

const run = (argv, env = {}) =>
  spawnSync(process.execPath, [CLI, 'optimize', ...argv], {
    encoding: 'utf8',
    env: { ...SPAWN_ENV, ...env },
    timeout: 30000,
  });

const flat = (r) => `${r.stdout}${r.stderr}`.replace(/\s+/g, ' ');

const PROMPT = 'You are a support agent.\n\nAnswer the question using only the context below.\n\n{{query}}\n';

describe('the front door says where the money actually is', () => {
  it('points at profile on a metered run', async () => {
    const { path, out } = await promptFile(PROMPT);
    const result = run([path, '--calls', '50000', '-o', out]);
    assert.equal(result.status, 0, result.stderr);
    const text = flat(result);

    assert.match(text, /smallest lever there is/);
    assert.match(text, /trazum profile <usage\.jsonl>/);
    // The four things that actually move a bill, named rather than hinted at.
    for (const lever of ['which model the call goes to', 'Batch API', 'prompt caching', 're-sending the conversation']) {
      assert.ok(text.includes(lever), `${lever} is not named`);
    }
  });

  it('points at it inside a subscription host too, without claiming a bill', async () => {
    /**
     * The tokens-only branch has just said there is no bill to reduce. A pointer
     * that opened "this is the smallest lever on your bill" contradicted the line
     * three above it — which is how the first version of this read.
     */
    const { path, out } = await promptFile(PROMPT);
    const result = run([path, '-o', out], { CLAUDECODE: '1' });
    const text = flat(result);

    assert.match(text, /no bill to reduce/, 'not the subscription branch, so this proves nothing');
    assert.match(text, /smallest lever there is/, 'the pointer is missing where most readers are');
    assert.doesNotMatch(text, /smallest lever on your bill/, 'claimed a bill the same report denies');
  });
});

describe('naming a scenario the host will not price', () => {
  /**
   * `--cost` stays the one way to ask for money, and that is deliberate: `--calls`
   * is a scenario parameter with a default that several commands take purely to
   * size a finding, so making it imply `--cost` would hand dollar figures to
   * somebody who put it in an alias precisely because they had configured the tool
   * not to show them. The existing tests encode that design and they are right.
   *
   * What was wrong was the answer. Somebody who typed `--calls 50000` and read
   * "pass --cost if this prompt is bound for a metered API" has been told to do the
   * thing they plainly just tried to do.
   */

  it('says the scenario went unpriced, rather than hinting at a flag', async () => {
    const { path, out } = await promptFile(PROMPT);
    const text = flat(run([path, '--calls', '50000', '-o', out], { CLAUDECODE: '1' }));

    assert.match(text, /You named a scenario, and it was not priced/);
    assert.doesNotMatch(text, /\$/, 'priced a scenario the host bills by subscription');
  });

  it('keeps the generic hint on a run that named nothing', async () => {
    // Nothing was ignored there, so there is nothing to acknowledge.
    const { path, out } = await promptFile(PROMPT);
    const text = flat(run([path, '-o', out], { CLAUDECODE: '1' }));

    assert.match(text, /Pass --cost if this prompt is bound for a metered API/);
    assert.doesNotMatch(text, /You named a scenario/);
  });

  it('prices it when --cost is given, which is the way to ask', async () => {
    const { path, out } = await promptFile(PROMPT);
    const text = flat(run([path, '--calls', '50000', '--cost', '-o', out], { CLAUDECODE: '1' }));
    assert.match(text, /50,000 calls\/month/);
  });
});

describe('a line that says nothing twice', () => {
  it('does not report the window as 0.0% to 0.0%', async () => {
    /**
     * A 225-token prompt against a million-token window printed `0.0% → 0.0%`: a
     * line whose whole job is to say what a saved token buys, saying nothing
     * twice. When both sides round the same, the honest statement is the other
     * one — that the window is not the constraint.
     */
    const { path, out } = await promptFile(PROMPT);
    const text = flat(run([path, '-o', out], { CLAUDECODE: '1' }));

    assert.doesNotMatch(text, /0\.0% → 0\.0%/, 'printed a window change of nothing to nothing');
    assert.match(text, /under a tenth of a percent, so the window is not what constrains/);
  });

  it('still reports the change when it is big enough to see', async () => {
    // A prompt that is a real share of a small window has a figure worth printing,
    // and suppressing that would be the fix overshooting.
    const { path, out } = await promptFile(`${'word '.repeat(20_000)}\n\n{{query}}\n`);
    const text = flat(run([path, '--model', 'claude-haiku-4-5', '-o', out], { CLAUDECODE: '1' }));
    /**
     * 20,005 of Haiku's 200,000 is 10%, and one token does not move it. The first
     * version of the fix called that "under a tenth of a percent" — off by two
     * orders of magnitude, on the one line whose job is to size the prompt.
     */
    assert.match(text, /10\.0% of Claude Haiku 4\.5's 200,000-token window, before and after/);
    assert.doesNotMatch(text, /under a tenth of a percent/, 'called a tenth of the window a rounding error');
  });
});
