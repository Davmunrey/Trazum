import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

/**
 * `check --files-from -` — the one-pipe pre-commit hook, chapter three of
 * the 1.67 arc. The refusals and budgets are directory mode's own; what
 * this suite proves is the list handling: drops counted out loud, a
 * promptless commit passing, and the baseline deliberately skipped with the
 * reason said.
 */

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

const run = (cwd, input, extra = []) =>
  spawnSync(process.execPath, [CLI, 'check', '--files-from', '-', ...extra], {
    encoding: 'utf8',
    env: SPAWN_ENV,
    timeout: 30000,
    cwd,
    input,
  });

const workspace = async (config = { budgets: { 'prompts/**': 10 } }) => {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-files-from-'));
  await mkdir(join(dir, 'prompts'), { recursive: true });
  await writeFile(
    join(dir, 'prompts', 'big.txt'),
    'You are a helpful assistant. Please kindly note that you should be concise and very helpful at all times.\n',
  );
  await writeFile(join(dir, 'prompts', 'small.txt'), 'Short.\n');
  await writeFile(join(dir, 'trazum.config.json'), JSON.stringify(config));
  return dir;
};

describe('check --files-from -', () => {
  it('gates the listed files against their config budgets, and fails on the one over', async () => {
    const dir = await workspace();
    const result = run(dir, 'prompts/big.txt\nprompts/small.txt\n');
    assert.equal(result.status, 1);
    assert.match(result.stdout, /prompts\/big\.txt/);
    assert.match(result.stdout, /Checking 2 of 2 listed/);
  });

  it('drops non-prompts, deletions and ignored paths, counting them out loud', async () => {
    const dir = await workspace({ budgets: { 'prompts/**': 10 }, ignore: ['prompts/big*'] });
    const result = run(dir, 'prompts/big.txt\nprompts/small.txt\nsrc/app.py\ngone/deleted.txt\n');
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /Checking 1 of 4 listed/);
    assert.match(result.stdout, /3 dropped/);
  });

  it('a commit that touches no prompts passes without ceremony', async () => {
    const dir = await workspace();
    const result = run(dir, 'src/app.py\nREADME.md.gone\n');
    assert.equal(result.status, 0);
    assert.match(result.stdout, /Checking 0 of 2 listed/);
  });

  it('skips the baseline gate and says why, instead of reading a partial list as removals', async () => {
    const dir = await workspace({
      budgets: { 'prompts/**': 100 },
      baseline: { path: 'trazum.baseline.json', maxGrowthTokens: 0 },
    });
    // No baseline file exists: under directory mode this run would fail
    // loudly. Under --files-from the gate is skipped BY DESIGN, so the run
    // passes and the skip is stated.
    const result = run(dir, 'prompts/small.txt\n');
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /baseline gate is skipped under --files-from/);
  });

  it('says the summary in Spanish too', async () => {
    const dir = await workspace();
    const result = run(dir, 'src/app.py\n', ['--locale', 'es']);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /Comprobando 0 de 1 fichero/);
  });
});
