import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/**
 * `trazum blame` — a prompt's cost across its git history.
 *
 * This is the first command in the repository that runs another program, so
 * roughly half of these tests are about the argv rather than the report. A path
 * that reaches git without a `--` in front of it is not a path, it is an
 * option, and git has options that run programs.
 */

const created = [];
after(async () => {
  for (const dir of created) await rm(dir, { recursive: true, force: true });
});

function git(args, cwd) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, `git ${args.join(' ')} failed: ${result.stderr}`);
  return result.stdout;
}

/** A repository with the given commits applied in order. */
async function repo(commits) {
  const root = await mkdtemp(join(tmpdir(), 'trazum-blame-'));
  created.push(root);
  git(['init', '-q', '.'], root);
  git(['config', 'user.email', 'test@example.com'], root);
  git(['config', 'user.name', 'Test Person'], root);
  git(['config', 'commit.gpgsign', 'false'], root);

  for (const [message, files] of commits) {
    for (const [name, body] of Object.entries(files)) {
      if (body === null) {
        git(['rm', '-q', '--', name], root);
        continue;
      }
      await writeFile(join(root, name), body);
    }
    git(['add', '-A'], root);
    git(['commit', '-q', '-m', message], root);
  }
  return root;
}

/**
 * The table rows, and only those.
 *
 * Matching on the author name caught the "biggest single increase" line too,
 * which names the author as well — so a two-revision history counted as three.
 * A row starts with its date; the summary does not.
 */
const rowsOf = (out) => out.split('\n').filter((line) => /^\d{4}-\d{2}-\d{2}\s/.test(line));

function run(args, cwd) {
  const result = spawnSync(process.execPath, [CLI, 'blame', ...args], {
    encoding: 'utf8',
    cwd,
    env: { ...process.env, NO_COLOR: '1', LANG: '', LC_ALL: '', TRAZUM_LOCALE: '', CLAUDECODE: '' },
  });
  return { out: `${result.stdout}${result.stderr}`, stdout: result.stdout, code: result.status };
}

const SHORT = 'Be brief.\n';
const LONG = 'Please kindly be very brief, and thorough, and complete in every respect.\n';

describe('it reports what the prompt cost at each commit', () => {
  it('lists revisions newest first with the change each one made', async () => {
    const root = await repo([
      ['first', { 'p.txt': SHORT }],
      ['grow it', { 'p.txt': LONG }],
    ]);
    const { out, code } = run(['p.txt'], root);

    assert.equal(code, 0);
    const lines = rowsOf(out);
    assert.equal(lines.length, 2);
    assert.match(lines[0], /grow it/, 'the newest revision is not first');
    assert.match(lines[1], /first/);
    assert.match(lines[0], /\+\d+/, 'the growth is not reported as a change');
  });

  it('marks the first revision as an addition, not a change of zero', async () => {
    // "+0" would be a claim about a previous version that does not exist.
    const root = await repo([['first', { 'p.txt': SHORT }]]);
    const { out } = run(['p.txt'], root);
    assert.match(out, /added/);
    assert.doesNotMatch(out, /\+0\b/);
  });

  it('names the single commit that added the most', async () => {
    // The question the command exists for. A total says the prompt grew; this
    // says which change did it and who to ask.
    const root = await repo([
      ['first', { 'p.txt': SHORT }],
      ['small tweak', { 'p.txt': `${SHORT}Also be polite.\n` }],
      ['the big one', { 'p.txt': `${SHORT}${LONG.repeat(6)}` }],
    ]);
    const { out } = run(['p.txt'], root);

    assert.match(out, /Biggest single increase/);
    assert.match(out, /the big one/);
  });

  it('prices the net movement through the same usage profile as everything else', async () => {
    const root = await repo([
      ['first', { 'p.txt': SHORT }],
      ['grow it', { 'p.txt': LONG.repeat(40) }],
    ]);
    const { out } = run(['p.txt', '--calls', '50000', '--model', 'claude-opus-5'], root);

    assert.match(out, /Net across this history/);
    assert.match(out, /\+\$[\d,]+/, 'growth was not priced');
    assert.match(out, /Claude Opus 5/);
  });

  it('says the counts are estimates, since every figure descends from one', async () => {
    const root = await repo([['first', { 'p.txt': SHORT }]]);
    assert.match(run(['p.txt'], root).out, /estimates \(±15%\)/);
  });
});

describe('a path is a path, never an option', () => {
  /**
   * The reason `git.ts` exists as its own module.
   *
   * `git log --format=… <path>` with no `--` lets a file called
   * `--output=/etc/cron.d/x` become an option. These names are committed for
   * real and then blamed: the test is not that the command *errors*, which
   * would pass just as well if the separator were missing and git rejected the
   * unknown option — it is that the history comes back correctly, which can
   * only happen if git read the name as a path.
   */
  for (const name of ['--output=pwned.txt', '-x.txt', '--follow', '--all']) {
    it(`blames a file called ${name} instead of obeying it`, async () => {
      const root = await repo([
        ['add it', { [name]: SHORT }],
        ['grow it', { [name]: LONG }],
      ]);
      const { out, code } = run(['--', name], root);

      assert.equal(code, 0, `blame failed on ${name}: ${out}`);
      assert.match(out, /grow it/, 'the history did not come back — the name was read as an option');
      assert.match(out, /add it/);
      assert.equal(
        existsSync(join(root, 'pwned.txt')),
        false,
        'something wrote a file it was named after',
      );
    });
  }

  it('refuses a path outside the repository', async () => {
    const root = await repo([['first', { 'p.txt': SHORT }]]);
    const { out, code } = run(['../../../etc/passwd'], root);

    assert.notEqual(code, 0);
    assert.match(out, /outside the repository/);
  });

  it('refuses an absolute path elsewhere on the machine', async () => {
    const root = await repo([['first', { 'p.txt': SHORT }]]);
    const { out, code } = run(['/etc/hostname'], root);

    assert.notEqual(code, 0);
    assert.match(out, /outside the repository/);
  });
});

describe('it refuses clearly rather than reporting nothing', () => {
  it('says so when the directory is not a repository', async () => {
    const bare = await mkdtemp(join(tmpdir(), 'trazum-norepo-'));
    created.push(bare);
    await writeFile(join(bare, 'p.txt'), SHORT);
    const { out, code } = run(['p.txt'], bare);

    assert.notEqual(code, 0);
    assert.match(out, /not inside a repository/);
    // The other failure with the same symptom must not be implied.
    assert.doesNotMatch(out, /not on PATH/);
  });

  it('says so when the file has no commits', async () => {
    const root = await repo([['first', { 'p.txt': SHORT }]]);
    await writeFile(join(root, 'untracked.txt'), SHORT);
    const { out, code } = run(['untracked.txt'], root);

    assert.notEqual(code, 0);
    assert.match(out, /no commits touching untracked\.txt/);
  });
});

describe('it follows the prompt, not the file around it', () => {
  it('tracks a marked prompt inside a source file', async () => {
    // Without this, every refactor of the imports reads as prompt growth — and
    // the whole point of the command is telling those two apart.
    const before =
      "import OpenAI from 'openai';\n\n// trazum:prompt support\nexport const S = `Be brief.`;\n";
    const after =
      "import OpenAI from 'openai';\nimport { z } from 'zod';\nimport fs from 'node:fs';\n" +
      'const schema = z.object({ a: z.string(), b: z.number(), c: z.boolean() });\n\n' +
      '// trazum:prompt support\nexport const S = `Be brief.`;\n';

    const root = await repo([
      ['first', { 'a.ts': before }],
      ['add imports, not prompt', { 'a.ts': after }],
    ]);
    const { out, code } = run(['a.ts', '--prompt', 'support'], root);

    assert.equal(code, 0, out);
    // The prompt did not change, so the second revision must report no change.
    const rows = rowsOf(out);
    assert.equal(rows.length, 2);
    assert.doesNotMatch(rows[0], /\+\d/, 'imports were counted as prompt growth');
  });

  it('keeps the history across a rename', async () => {
    // A cost history that restarts at a rename says the growth began the day
    // somebody tidied the directory.
    const root = await repo([
      ['first', { 'p.txt': SHORT }],
      ['grow it', { 'p.txt': LONG }],
    ]);
    git(['mv', 'p.txt', 'prompts.txt'], root);
    git(['commit', '-q', '-m', 'move it'], root);

    const { out, code } = run(['prompts.txt'], root);
    assert.equal(code, 0, out);
    assert.match(out, /grow it/, 'history stopped at the rename');
    assert.match(out, /Followed a rename/);
  });
});

describe('--limit and --json', () => {
  it('shows the most recent N and says the list was cut', async () => {
    const commits = Array.from({ length: 6 }, (_, i) => [
      `commit ${i}`,
      { 'p.txt': `${SHORT}${'more text. '.repeat(i)}\n` },
    ]);
    const root = await repo(commits);
    const { out } = run(['p.txt', '--limit', '3'], root);

    const rows = rowsOf(out);
    assert.equal(rows.length, 3);
    assert.match(out, /Showing the most recent 3/);
    // And the oldest shown row still has a change, because the revision before
    // it was measured as a baseline rather than dropped.
    assert.match(rows[2], /[+-]\d|·/, 'the oldest shown row has no baseline to compare against');
  });

  it('emits machine-readable history', async () => {
    const root = await repo([
      ['first', { 'p.txt': SHORT }],
      ['grow it', { 'p.txt': LONG }],
    ]);
    const { stdout } = run(['p.txt', '--json'], root);
    const report = JSON.parse(stdout);

    assert.equal(report.path, 'p.txt');
    assert.equal(report.revisions.length, 2);
    assert.equal(report.revisions[0].subject, 'grow it');
    assert.ok(report.revisions[0].tokens > report.revisions[1].tokens);
    assert.ok(report.revisions[0].delta > 0);
    assert.equal(report.revisions[1].delta, null, 'the oldest revision claims a delta');
    assert.match(report.revisions[0].sha, /^[0-9a-f]{40}$/);
  });

  it('rejects a limit that is not a number, rather than ignoring it', async () => {
    const root = await repo([['first', { 'p.txt': SHORT }]]);
    const { code, out } = run(['p.txt', '--limit', 'lots'], root);
    assert.notEqual(code, 0, out);
  });
});
