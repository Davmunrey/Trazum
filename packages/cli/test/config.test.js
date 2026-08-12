import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/**
 * Every test here drives the built binary, because the behaviour under test is
 * the layering of config under flags — and a wiring mistake there is invisible
 * from inside any one function.
 */
function run(args, cwd) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    cwd,
    // LANG cleared so a config `locale` is actually the most explicit source,
    // and the runner's own language cannot decide the assertion.
    env: {
      ...SPAWN_ENV,
      LC_MESSAGES: '',
      TRAZUM_LOCALE: '',
    },
  });
  return { out: `${result.stdout}${result.stderr}`, code: result.status };
}

/** A project with prompts and, optionally, a config file. */
async function project(config, files = {}) {
  const root = await mkdtemp(join(tmpdir(), 'trazum-cli-'));
  // A .git marker, so the upward search stops here rather than climbing out of
  // the temp directory and finding whatever else is above it.
  await mkdir(join(root, '.git'), { recursive: true });
  if (config !== null) {
    await writeFile(join(root, 'trazum.config.json'), JSON.stringify(config, null, 2));
  }
  for (const [path, contents] of Object.entries(files)) {
    const full = join(root, path);
    await mkdir(join(full, '..'), { recursive: true });
    await writeFile(full, contents);
  }
  return root;
}

const WORDY = 'Please could you kindly summarise the following text for me. Thank you very much indeed.\n';
const SHORT = 'Summarise this.\n';

describe('the config file is read', () => {
  it('supplies the level when no flag does', async () => {
    // `politeness` is a safe rule; `intensifiers` only fires at aggressive. If
    // the config level were ignored, the aggressive-only rule would not appear.
    const root = await project(
      { level: 'aggressive' },
      { 'p.txt': 'Summarise this VERY carefully and extremely thoroughly.\n' },
    );
    const { out } = run(['optimize', 'p.txt', '--json'], root);
    assert.match(out, /"level": "aggressive"/);
  });

  it('supplies the usage profile', async () => {
    const root = await project(
      { usage: { model: 'claude-haiku-4-5', callsPerMonth: 12345 } },
      { 'p.txt': WORDY },
    );
    const { out } = run(['optimize', 'p.txt', '--json'], root);
    assert.match(out, /"model": "claude-haiku-4-5"/);
    assert.match(out, /"callsPerMonth": 12345/);
  });

  it('a flag beats the config', async () => {
    // The direction that matters: a config able to override an explicit flag
    // would make every flag a suggestion.
    const root = await project({ usage: { callsPerMonth: 12345 } }, { 'p.txt': WORDY });
    const { out } = run(['optimize', 'p.txt', '--calls', '777', '--json'], root);
    assert.match(out, /"callsPerMonth": 777/);
    assert.doesNotMatch(out, /12345/);
  });

  it('--no-batch switches off a boolean the config switched on', async () => {
    // Otherwise a setting written into the repository is one you have to edit
    // the repository to escape.
    const root = await project({ usage: { batchEligible: true } }, { 'p.txt': WORDY });
    assert.match(run(['optimize', 'p.txt', '--json'], root).out, /"batchEligible": true/);
    assert.match(
      run(['optimize', 'p.txt', '--no-batch', '--json'], root).out,
      /"batchEligible": false/,
    );
  });

  it('--no- on a flag that takes a value is refused rather than ignored', async () => {
    const root = await project(null, { 'p.txt': WORDY });
    assert.match(run(['check', 'p.txt', '--no-max-tokens'], root).out, /makes no sense/);
  });

  it('quotes an unknown flag the way it was typed', async () => {
    // Reporting "--nonsense" for `--no-nonsense` sends the reader looking for a
    // flag they never used.
    const root = await project(null, { 'p.txt': WORDY });
    const { out } = run(['check', 'p.txt', '--max-tokens', '5', '--no-nonsense'], root);
    assert.match(out, /--no-nonsense/);
  });

  it('sets the report language only when nothing more explicit did', async () => {
    const root = await project({ locale: 'es' }, { 'p.txt': WORDY });
    assert.match(run(['check', 'p.txt', '--max-tokens', '1'], root).out, /supera el presupuesto/);
    assert.match(
      run(['check', 'p.txt', '--max-tokens', '1', '--locale', 'en'], root).out,
      /busts the budget/,
    );
  });

  it('is found by walking up from a subdirectory', async () => {
    const root = await project({ usage: { callsPerMonth: 4242 } }, { 'nested/p.txt': WORDY });
    const { out } = run(['optimize', 'p.txt', '--json'], join(root, 'nested'));
    assert.match(out, /"callsPerMonth": 4242/);
  });

  it('--config names one directly', async () => {
    const root = await project(null, { 'p.txt': WORDY });
    await writeFile(join(root, 'other.json'), '{"usage":{"callsPerMonth":31337}}');
    assert.match(
      run(['optimize', 'p.txt', '--config', 'other.json', '--json'], root).out,
      /"callsPerMonth": 31337/,
    );
  });

  it('refuses to run on a config it cannot validate', async () => {
    // The alternative is worse than an error: a typo'd key means a budget that
    // is never read, and a green build for a prompt nobody measured.
    const root = await project({ budgts: {} }, { 'p.txt': WORDY });
    const { out, code } = run(['check', 'p.txt', '--max-tokens', '5'], root);
    assert.match(out, /unknown key "budgts" — did you mean "budgets"\?/);
    assert.equal(code, 1);
  });
});

describe('the config supplies a budget', () => {
  it('check needs no --max-tokens once a budget covers the file', async () => {
    const root = await project({ budgets: { 'p.txt': 5 } }, { 'p.txt': WORDY });
    const { out, code } = run(['check', 'p.txt'], root);
    assert.match(out, /busts the budget of 5/);
    assert.equal(code, 1);
  });

  it('still asks for one when no budget covers the file', async () => {
    const root = await project({ budgets: { 'prompts/**': 5 } }, { 'p.txt': WORDY });
    assert.match(run(['check', 'p.txt'], root).out, /needs --max-tokens/);
  });

  it('arms the diff gate, the same as the flag would', async () => {
    // A repository that wrote down "maxGrowth" has opted in as deliberately as
    // somebody typing the flag.
    const root = await project({ maxGrowth: 2 }, { 'a.txt': SHORT, 'b.txt': WORDY });
    assert.equal(run(['diff', 'a.txt', 'b.txt'], root).code, 1);
    assert.equal(run(['diff', 'b.txt', 'a.txt'], root).code, 0, 'shrinking must not fail');
  });

  it('leaves the diff gate disarmed when nothing set a limit', async () => {
    const root = await project(null, { 'a.txt': SHORT, 'b.txt': WORDY });
    assert.equal(run(['diff', 'a.txt', 'b.txt'], root).code, 0);
  });

  it('a flag still beats the config limit', async () => {
    const root = await project({ maxGrowth: 2 }, { 'a.txt': SHORT, 'b.txt': WORDY });
    assert.equal(run(['diff', 'a.txt', 'b.txt', '--max-growth', '500'], root).code, 0);
  });
});

describe('trazum check on a directory', () => {
  const TREE = {
    'prompts/small.txt': SHORT,
    'prompts/big.txt': WORDY.repeat(4),
    'prompts/nested/deep.md': SHORT,
    'notes.txt': SHORT,
  };

  it('checks every prompt against its budget', async () => {
    const root = await project({ budgets: { 'prompts/**': 10 } }, TREE);
    const { out, code } = run(['check', 'prompts'], root);
    assert.match(out, /prompts\/small\.txt/);
    assert.match(out, /prompts\/big\.txt/);
    assert.match(out, /prompts\/nested\/deep\.md/);
    assert.doesNotMatch(out, /notes\.txt/, 'a file outside the directory should not be checked');
    assert.equal(code, 1, 'the oversized prompt should fail the run');
  });

  it('the most specific pattern wins', async () => {
    const root = await project(
      { budgets: { 'prompts/**': 10, 'prompts/big.txt': 100_000 } },
      TREE,
    );
    const { out, code } = run(['check', 'prompts'], root);
    assert.equal(code, 0, `the specific budget should have exempted big.txt: ${out}`);
  });

  it('lists a file no budget covers instead of hiding it', async () => {
    // Silently skipping it would let a prompt sit outside every pattern for
    // months while the report says everything is fine.
    const root = await project({ budgets: { 'prompts/small.txt': 10 } }, TREE);
    const { out } = run(['check', 'prompts'], root);
    assert.match(out, /prompts\/big\.txt \(no budget\)/);
  });

  it('refuses a run in which nothing was budgeted at all', async () => {
    // "0 failures" from a check that measured nothing is the most misleading
    // output this tool could produce.
    const root = await project({ budgets: { 'elsewhere/**': 10 } }, TREE);
    const { out, code } = run(['check', 'prompts'], root);
    assert.match(out, /No budget covers anything/);
    assert.equal(code, 1);
  });

  it('--max-tokens covers the files the config does not', async () => {
    const root = await project(null, TREE);
    const { out, code } = run(['check', 'prompts', '--max-tokens', '100000'], root);
    assert.equal(code, 0, out);
    assert.doesNotMatch(out, /no budget/);
  });

  it('says so when the directory holds no prompts', async () => {
    const root = await project({ budgets: { '**': 10 } }, { 'prompts/readme.rst': 'x' });
    assert.match(run(['check', 'prompts'], root).out, /No prompt files under/);
  });

  it('honours the configured extensions', async () => {
    const root = await project(
      { budgets: { '**': 10 }, extensions: ['.md'] },
      { 'prompts/a.txt': SHORT, 'prompts/b.md': SHORT },
    );
    const { out } = run(['check', 'prompts'], root);
    assert.match(out, /b\.md/);
    assert.doesNotMatch(out, /a\.txt/);
  });

  it('reports as JSON, naming the pattern each budget came from', async () => {
    // A file failing against a budget the reader cannot locate in their config
    // is a bug report rather than a fix.
    const root = await project({ budgets: { 'prompts/**': 10 } }, TREE);
    const { out } = run(['check', 'prompts', '--json'], root);
    const report = JSON.parse(out);
    assert.equal(report.ok, false);
    assert.equal(report.files.length, 3);
    assert.equal(report.files[0].budgetPattern, 'prompts/**');
    assert.ok(report.files.some((f) => f.ok === false));
  });

  it('a single file still works exactly as before', async () => {
    const root = await project(null, TREE);
    const { out, code } = run(['check', 'prompts/small.txt', '--max-tokens', '1000'], root);
    assert.match(out, /within the budget/);
    assert.equal(code, 0);
  });
});
