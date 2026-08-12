import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/**
 * `trazum diff --all <before> <after>` — a whole prompt library at once.
 *
 * Two decisions carry this, and both are the kind that look like details until
 * they mislead somebody:
 *
 * 1. **A prompt on only one side is named, not folded into the totals.** A
 *    refactor that deletes a prompt and one that renames it look identical from a
 *    token count. Counting the deletion as a saving would report a library getting
 *    cheaper when a file went missing.
 *
 * 2. **`--max-growth` applies per prompt, not to the total.** Summing would pass a
 *    refactor that doubled one prompt because another happened to shrink — and the
 *    one that doubled is the one somebody has to look at. Same rule `check` states
 *    about budgets.
 */
function run(args, cwd) {
  const result = spawnSync(process.execPath, [CLI, 'diff', ...args], {
    encoding: 'utf8',
    cwd,
    env: SPAWN_ENV,
  });
  return { out: `${result.stdout}${result.stderr}`, stdout: result.stdout, code: result.status };
}

const GREW_BEFORE = 'Classify {{t}}.\n';
const GREW_AFTER = 'Please kindly classify {{t}} very carefully. Thank you very much!\n';
const SHRANK_BEFORE = 'Please kindly summarise {{d}} very briefly. Thank you!\n';
const SHRANK_AFTER = 'Summarise {{d}}.\n';
const SAME = 'Answer in English.\n';

async function library(before, after) {
  const root = await mkdtemp(join(tmpdir(), 'trazum-diffall-'));
  for (const [side, files] of [['old', before], ['new', after]]) {
    for (const [name, body] of Object.entries(files)) {
      const path = join(root, side, name);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, body);
    }
    await mkdir(join(root, side), { recursive: true });
  }
  return root;
}

describe('a library, before and after', () => {
  it('reports every paired prompt and totals them', async () => {
    const root = await library(
      { 'a.txt': GREW_BEFORE, 'b.txt': SHRANK_BEFORE, 'c.txt': SAME },
      { 'a.txt': GREW_AFTER, 'b.txt': SHRANK_AFTER, 'c.txt': SAME },
    );
    const report = JSON.parse(run(['--all', 'old', 'new', '--json'], root).stdout);

    assert.equal(report.prompts.length, 3);
    assert.equal(
      report.totals.tokenDelta,
      report.prompts.reduce((sum, p) => sum + p.tokenDelta, 0),
      'the total is not the sum of the prompts it claims to total',
    );
    assert.equal(
      report.totals.monthlyDeltaUsd,
      report.prompts.reduce((sum, p) => sum + p.monthlyDeltaUsd, 0),
    );
  });

  it('keeps the sign convention: positive means worse', async () => {
    const root = await library({ 'a.txt': GREW_BEFORE }, { 'a.txt': GREW_AFTER });
    const report = JSON.parse(run(['--all', 'old', 'new', '--json'], root).stdout);
    assert.ok(report.totals.tokenDelta > 0, 'a prompt that grew reported a negative delta');

    const swapped = JSON.parse(run(['--all', 'new', 'old', '--json'], root).stdout);
    assert.equal(swapped.totals.tokenDelta, -report.totals.tokenDelta);
  });

  it('states the convention in the report, before any number', async () => {
    // A reader arriving from `optimize` has the opposite one loaded.
    const root = await library({ 'a.txt': GREW_BEFORE }, { 'a.txt': GREW_AFTER });
    const { out } = run(['--all', 'old', 'new'], root);
    const convention = out.indexOf('positive means worse');
    const firstDelta = out.search(/[+-]\d+ {2}a\.txt/);

    assert.notEqual(convention, -1, 'the sign convention is not stated');
    assert.ok(convention < firstDelta, 'the convention is stated after the first figure');
  });

  it('sorts worst first, so the top of the list is the thing to look at', async () => {
    const root = await library(
      { 'a.txt': GREW_BEFORE, 'b.txt': SHRANK_BEFORE },
      { 'a.txt': GREW_AFTER, 'b.txt': SHRANK_AFTER },
    );
    const report = JSON.parse(run(['--all', 'old', 'new', '--json'], root).stdout);
    const deltas = report.prompts.map((p) => p.tokenDelta);
    assert.deepEqual(deltas, [...deltas].sort((x, y) => y - x));
  });
});

describe('a prompt on only one side', () => {
  it('names it instead of counting it', async () => {
    /**
     * The failure this prevents: a deleted prompt reported as a saving.
     *
     * `gone.txt` is 14 tokens of prompt that no longer exists. If deletions were
     * folded into the totals, this refactor would report a library that got
     * cheaper — when what actually happened is that a file went missing and
     * somebody needs to say whether that was deliberate.
     */
    const root = await library(
      { 'kept.txt': SAME, 'gone.txt': 'Old prompt about {{x}} that is quite wordy indeed.\n' },
      { 'kept.txt': SAME, 'fresh.txt': 'Brand new prompt for {{y}}.\n' },
    );
    const report = JSON.parse(run(['--all', 'old', 'new', '--json'], root).stdout);

    assert.deepEqual(report.removed, ['gone.txt']);
    assert.deepEqual(report.added, ['fresh.txt']);
    assert.equal(report.prompts.length, 1, 'an unpaired prompt was compared against nothing');
    assert.equal(report.totals.tokenDelta, 0, 'a deletion was counted as a saving');

    const { out } = run(['--all', 'old', 'new'], root);
    assert.match(out, /only before {2}gone\.txt/);
    assert.match(out, /only after {3}fresh\.txt/);
    assert.match(out, /not a saving/i);
  });
});

describe('the gate applies per prompt', () => {
  it('fails when one prompt grew past the limit, even if the total did not', async () => {
    // a.txt grows +14 while b.txt shrinks -11, so the total is +3. A gate on the
    // total would pass this and the prompt that doubled would ship unlooked-at.
    const root = await library(
      { 'a.txt': GREW_BEFORE, 'b.txt': SHRANK_BEFORE },
      { 'a.txt': GREW_AFTER, 'b.txt': SHRANK_AFTER },
    );
    const total = JSON.parse(run(['--all', 'old', 'new', '--json'], root).stdout).totals.tokenDelta;
    assert.ok(total < 10, `this fixture needs a small total to be meaningful; got ${total}`);

    const { code, out } = run(['--all', 'old', 'new', '--max-growth', '10'], root);
    assert.equal(code, 1, out);
    assert.match(out, /past the per-prompt limit of 10/);
    assert.match(out, /a\.txt/);
  });

  it('passes when no single prompt is over, and names none', async () => {
    const root = await library(
      { 'a.txt': GREW_BEFORE, 'b.txt': SHRANK_BEFORE },
      { 'a.txt': GREW_AFTER, 'b.txt': SHRANK_AFTER },
    );
    const { code, out } = run(['--all', 'old', 'new', '--max-growth', '50'], root);
    assert.equal(code, 0, out);
    assert.doesNotMatch(out, /per-prompt limit/);
  });

  it('reports and exits 0 with no limit given', async () => {
    // Deciding growth is unacceptable is the caller's call, as with single-file
    // `diff`. Growth alone is not a failure.
    const root = await library({ 'a.txt': GREW_BEFORE }, { 'a.txt': GREW_AFTER });
    assert.equal(run(['--all', 'old', 'new'], root).code, 0);
  });
});

describe('what it refuses and what it skips', () => {
  it('refuses two directories with no prompts between them', async () => {
    const root = await library({}, {});
    const { code, out } = run(['--all', 'old', 'new'], root);
    assert.notEqual(code, 0);
    assert.match(out, /No prompt files under/);
  });

  it('skips a source file with no marker on either side, and counts it', async () => {
    const source = "import OpenAI from 'openai';\nexport const x = 1;\n";
    const root = await library(
      { 'a.txt': SAME, 'plain.ts': source },
      { 'a.txt': SAME, 'plain.ts': source },
    );
    const report = JSON.parse(run(['--all', 'old', 'new', '--json'], root).stdout);

    assert.equal(report.prompts.length, 1);
    assert.equal(report.skippedSourceFiles, 1);
  });

  it('still takes two files without --all', async () => {
    // The flag adds a mode; it must not have taken the old one away.
    const root = await library({ 'a.txt': GREW_BEFORE }, { 'a.txt': GREW_AFTER });
    const { code, stdout } = run(['old/a.txt', 'new/a.txt', '--json'], root);
    assert.equal(code, 0);
    const single = JSON.parse(stdout);
    assert.ok(single.tokenDelta > 0);
    assert.equal(single.totals, undefined, 'single-file diff grew a totals block');
  });

  it('reports in Spanish too', async () => {
    const root = await library({ 'a.txt': GREW_BEFORE }, { 'a.txt': GREW_AFTER });
    const { out } = run(['--all', 'old', 'new', '--locale', 'es'], root);
    assert.match(out, /positivo significa peor/);
  });
});
