import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/**
 * `trazum baseline`, and the gate `trazum check` builds on it.
 *
 * The behaviours worth testing here are all about failing. A budget is a ceiling
 * and answers "does this file fit"; a baseline answers "did this repository get
 * worse", and the reason it exists is that the second question has a green answer
 * to the first. So the load-bearing test below is the one where every budget
 * passes, nothing that already existed grew, and the run still exits 1 — because
 * somebody added a file.
 *
 * Exit codes are asserted rather than output text, per CONTRIBUTING: the wording
 * changes without a version bump and a test that breaks when somebody improves a
 * sentence is a test that gets deleted. Where text is asserted it is a stable
 * fragment of a number or a path.
 */

const ENV = {
  ...process.env,
  NO_COLOR: '1',
  LANG: '',
  LC_ALL: '',
  TRAZUM_LOCALE: '',
  CLAUDECODE: '',
};

function run(command, args, cwd) {
  const result = spawnSync(process.execPath, [CLI, command, ...args], {
    encoding: 'utf8',
    cwd,
    env: ENV,
  });
  return { out: `${result.stdout}${result.stderr}`, code: result.status };
}

const SUPPORT = `You are a customer support assistant for an online store.

It is important to note that you should always answer in the customer's own language.

Customer query: {{query}}
`;

/** A directory with one prompt and a config that declares a baseline. */
async function fixture(baselineBlock = '{ "maxGrowthTokens": 0, "maxGrowthPct": 5 }') {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-baseline-'));
  await mkdir(join(dir, 'prompts'), { recursive: true });
  await writeFile(join(dir, 'prompts', 'support.txt'), SUPPORT, 'utf8');
  await writeFile(
    join(dir, 'trazum.config.json'),
    JSON.stringify({
      usage: { model: 'claude-opus-5', callsPerMonth: 10_000 },
      baseline: JSON.parse(baselineBlock),
    }),
    'utf8',
  );
  return dir;
}

const readBaseline = async (dir) =>
  JSON.parse(await readFile(join(dir, 'trazum.baseline.json'), 'utf8'));

describe('trazum baseline: recording', () => {
  it('writes a file that names every prompt and totals them', async () => {
    const dir = await fixture();
    const { code } = run('baseline', ['.'], dir);
    assert.equal(code, 0);

    const document = await readBaseline(dir);
    assert.equal(document.version, 1);
    assert.deepEqual(Object.keys(document.files), ['prompts/support.txt']);
    assert.equal(document.totals.tokens, document.files['prompts/support.txt']);
    assert.ok(document.totals.tokens > 0, 'counted nothing');
  });

  it('records the scenario, so a later comparison knows what the money meant', async () => {
    const dir = await fixture();
    run('baseline', ['.', '--calls', '25000'], dir);

    const document = await readBaseline(dir);
    assert.equal(document.scenario.callsPerMonth, 25_000);
    assert.equal(document.scenario.model, 'claude-opus-5');
    assert.match(document.pricingReviewed, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(document.totals.monthlyUsd > 0);
  });

  it('never fails, because recording is not a verdict', async () => {
    // A command that could fail while writing the very thing you would fix the
    // failure with is a loop. Even with a zero-tolerance threshold in the config
    // and a repository that has grown, recording succeeds.
    const dir = await fixture();
    run('baseline', ['.'], dir);
    await writeFile(join(dir, 'prompts', 'extra.txt'), 'Another whole prompt here.\n', 'utf8');
    assert.equal(run('baseline', ['.'], dir).code, 0);
  });

  it('is byte-identical when nothing changed', async () => {
    // A baseline is committed; one that reshuffles itself makes every pull
    // request unreviewable.
    const dir = await fixture();
    run('baseline', ['.'], dir);
    const first = await readFile(join(dir, 'trazum.baseline.json'), 'utf8');
    run('baseline', ['.'], dir);
    assert.equal(await readFile(join(dir, 'trazum.baseline.json'), 'utf8'), first);
  });

  it('honours --out over the config path', async () => {
    const dir = await fixture();
    assert.equal(run('baseline', ['.', '--out', 'costs.json'], dir).code, 0);
    JSON.parse(await readFile(join(dir, 'costs.json'), 'utf8'));
  });
});

describe('trazum check: the baseline gate', () => {
  it('refuses to run when the config declares a baseline that is not there', async () => {
    /**
     * The most important failure in this file. A gate the config asked for and
     * could not run is not a pass — treating a missing baseline as "nothing to
     * compare" would mean a deleted file silently switches CI off.
     */
    const dir = await fixture();
    const { code, out } = run('check', ['.'], dir);
    assert.equal(code, 1);
    assert.match(out, /trazum\.baseline\.json/, 'does not name the file it wanted');
    assert.match(out, /trazum baseline/, 'does not name the command that fixes it');
  });

  it('passes a tree that has not moved', async () => {
    const dir = await fixture();
    run('baseline', ['.'], dir);
    assert.equal(run('check', ['.'], dir).code, 0);
  });

  it('fails a file that grew past the threshold', async () => {
    const dir = await fixture();
    run('baseline', ['.'], dir);
    await writeFile(
      join(dir, 'prompts', 'support.txt'),
      `${SUPPORT}\nPlease also always double-check your answer before responding. Thank you.\n`,
      'utf8',
    );
    assert.equal(run('check', ['.'], dir).code, 1);
  });

  it('fails on a new prompt while every budget is green and nothing grew', async () => {
    /**
     * This is the case budgets cannot catch and the whole reason a baseline
     * exists. `support.txt` is untouched, no file has a budget to bust, and the
     * repository is nonetheless more expensive than the commit that was
     * recorded.
     */
    const dir = await fixture();
    run('baseline', ['.'], dir);
    await writeFile(
      join(dir, 'prompts', 'triage.md'),
      'Classify the ticket into one of: billing, technical, account. Answer with the category only.\n',
      'utf8',
    );

    const { code, out } = run('check', ['.'], dir);
    assert.equal(code, 1, 'a new prompt slipped through the gate');
    assert.match(out, /triage\.md/, 'the report does not name the file that did it');
    assert.doesNotMatch(out, /support\.txt {2}\d+ → /, 'reported an untouched file as changed');
  });

  it('passes a tree that got cheaper, at zero tolerance', async () => {
    // There is no such thing as a prompt that got too cheap.
    const dir = await fixture('{ "maxGrowthTokens": 0 }');
    run('baseline', ['.'], dir);
    await writeFile(join(dir, 'prompts', 'support.txt'), 'Answer briefly.\n', 'utf8');
    assert.equal(run('check', ['.'], dir).code, 0);
  });

  it('passes growth that stays inside the threshold', async () => {
    const dir = await fixture('{ "maxGrowthTokens": 500, "maxGrowthPct": 500 }');
    run('baseline', ['.'], dir);
    await writeFile(join(dir, 'prompts', 'triage.md'), 'A short new prompt.\n', 'utf8');
    assert.equal(run('check', ['.'], dir).code, 0);
  });

  it('holds the percentage threshold on its own', async () => {
    const dir = await fixture('{ "maxGrowthPct": 1 }');
    run('baseline', ['.'], dir);
    await writeFile(
      join(dir, 'prompts', 'triage.md'),
      'Classify the ticket into one of: billing, technical, account.\n',
      'utf8',
    );
    assert.equal(run('check', ['.'], dir).code, 1);
  });

  it('refuses a corrupt baseline instead of skipping the gate', async () => {
    const dir = await fixture();
    run('baseline', ['.'], dir);
    const document = await readBaseline(dir);
    // A hand-edited total: the file still parses, the gate still runs, and the
    // comparison would be against a number nobody measured.
    document.totals.tokens += 500;
    await writeFile(join(dir, 'trazum.baseline.json'), JSON.stringify(document), 'utf8');

    const { code, out } = run('check', ['.'], dir);
    assert.equal(code, 1);
    assert.match(out, /per-file counts sum to/);
  });

  it('refuses a baseline that is not JSON', async () => {
    const dir = await fixture();
    await writeFile(join(dir, 'trazum.baseline.json'), '{ not json', 'utf8');
    assert.equal(run('check', ['.'], dir).code, 1);
  });

  it('--no-baseline skips it for one run', async () => {
    const dir = await fixture();
    run('baseline', ['.'], dir);
    await writeFile(join(dir, 'prompts', 'triage.md'), 'A new prompt that grows the tree.\n', 'utf8');
    assert.equal(run('check', ['.'], dir).code, 1, 'the gate did not fire to begin with');

    // With the gate off and no budgets, nothing is governing the run — which is
    // an error rather than a green "0 failures", the same doctrine as before.
    const { code, out } = run('check', ['.', '--no-baseline'], dir);
    assert.equal(code, 1);
    assert.match(out, /budget/i, 'failed for some other reason than nothing being measured');
  });

  it('does not report money across a reprice as if it were a saving', async () => {
    const dir = await fixture();
    run('baseline', ['.'], dir);
    const document = await readBaseline(dir);
    document.pricingReviewed = '2020-01-01';
    await writeFile(join(dir, 'trazum.baseline.json'), JSON.stringify(document), 'utf8');

    const { code, out } = run('check', ['.'], dir);
    assert.equal(code, 0, 'a price change is not a regression');
    assert.match(out, /2020-01-01/, 'does not say which price list the baseline used');
    assert.doesNotMatch(out, /Monthly cost/, 'subtracted two different measurements anyway');
  });

  it('says so when the scenario moved, rather than comparing two scenarios', async () => {
    // `check` takes no scenario flags — the realistic way this happens is
    // somebody editing `usage` in the config after the baseline was recorded.
    const dir = await fixture();
    run('baseline', ['.'], dir);
    await writeFile(
      join(dir, 'trazum.config.json'),
      JSON.stringify({
        usage: { model: 'claude-opus-5', callsPerMonth: 90_000 },
        baseline: { maxGrowthTokens: 0, maxGrowthPct: 5 },
      }),
      'utf8',
    );

    const { code, out } = run('check', ['.'], dir);
    assert.equal(code, 0, 'editing the scenario is not a regression either');
    assert.doesNotMatch(out, /Monthly cost/);
  });

  it('is governed by the baseline alone, with no budgets anywhere', async () => {
    // Adopting `baseline` without ever writing a `budgets` map has to work, or
    // the feature is unreachable for the repositories that need it most.
    const dir = await fixture();
    assert.equal(run('baseline', ['.'], dir).code, 0);
    assert.equal(run('check', ['.'], dir).code, 0);
    await rm(join(dir, 'prompts', 'support.txt'));
    await writeFile(
      join(dir, 'prompts', 'support.txt'),
      `${SUPPORT}${SUPPORT}${SUPPORT}`,
      'utf8',
    );
    assert.equal(run('check', ['.'], dir).code, 1);
  });
});

describe('trazum baseline: the config', () => {
  it('rejects a baseline block with no threshold', async () => {
    // A gate that cannot fail is not a gate, and the number is a policy decision
    // rather than something to default.
    const dir = await fixture('{}');
    const { code, out } = run('check', ['.'], dir);
    assert.equal(code, 1);
    assert.match(out, /maxGrowthTokens/);
    assert.match(out, /maxGrowthPct/);
  });

  it('rejects a path that escapes the project', async () => {
    const dir = await fixture('{ "maxGrowthTokens": 0, "path": "../elsewhere.json" }');
    const { code, out } = run('check', ['.'], dir);
    assert.equal(code, 1);
    assert.match(out, /relative path inside the project/);
  });

  it('names the nearest key on a typo', async () => {
    const dir = await fixture('{ "maxGrowthToken": 0 }');
    const { code, out } = run('check', ['.'], dir);
    assert.equal(code, 1);
    assert.match(out, /maxGrowthTokens/, 'did not suggest the intended key');
  });
});
