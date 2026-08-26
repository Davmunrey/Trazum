import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

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

function run(args, cwd, env = {}) {
  const result = spawnSync(process.execPath, [CLI, 'blame', ...args], {
    encoding: 'utf8',
    cwd,
    env: {
      ...SPAWN_ENV,
      ...env,
    },
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
    assert.equal(lines.length, 2, out);
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
    assert.match(run(['p.txt'], root).out, /estimates \(±10%\)/);
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

  it('does not call a git it could not run "no commits"', async () => {
    /**
     * Issue #58: a table with zero rows, exit 0, once on CI, never reproducible.
     *
     * `git()` collapsed every failure into `null` — git missing, git exiting
     * non-zero, and **the process failing to start at all** — and `revisionsFor`
     * turned `null` into `[]`. So a fork refused with `EAGAIN` on a loaded
     * runner, which is a fact about the machine for one instant, reached the
     * author as `git has no commits touching p.txt`: a confident claim about
     * their repository, made without having asked it anything. That is the one
     * shape of #58 that cannot be diagnosed afterwards, because its output is
     * identical to the true answer.
     *
     * Called directly rather than through the CLI, and that matters: the first
     * version of this test ran `blame` with `PATH` stripped and passed against
     * every mutant, including the bug restored. `blame` checks `gitAvailable`
     * before it asks for revisions, so the process never reached the code under
     * test — the test was watching the wrong door.
     *
     * `ENOENT` rather than a real `EAGAIN`: both are `spawnSync` failing to
     * start a process, which is the branch that matters, and a test that tries
     * to exhaust the process table is a test that wedges somebody's laptop.
     *
     * What this does **not** claim is that `EAGAIN` caused the CI failure.
     * Nobody knows, and the issue is honest about that. What it fixes is that
     * this failure can no longer disguise itself as an empty history.
     */
    const { revisionsFor, GitUnavailableError } = await import('../dist/git.js');
    const root = await repo([['first', { 'p.txt': SHORT }]]);

    const realPath = process.env.PATH;
    process.env.PATH = '/nonexistent';
    try {
      assert.throws(
        () => revisionsFor('p.txt', { cwd: root, max: 3 }),
        GitUnavailableError,
        'a git that never ran came back as a repository with no history',
      );
    } finally {
      process.env.PATH = realPath;
    }
  });

  it('retries a fork the kernel refused, once', async () => {
    /**
     * `EAGAIN` is the kernel declining a fork because the process limit is
     * momentarily full. It is a fact about the machine for one instant, it is
     * gone by the next, and it is the reason this class of failure shows up on a
     * loaded CI runner and never on a laptop.
     *
     * Injected rather than provoked: producing a real `EAGAIN` means exhausting
     * the process table, which is not a thing a test suite should do to the
     * machine running it.
     */
    const { revisionsFor } = await import('../dist/git.js');
    const root = await repo([['first', { 'p.txt': SHORT }]]);

    let calls = 0;
    const flaky = (file, args, options) => {
      calls += 1;
      if (calls === 1) return { error: Object.assign(new Error('fork'), { code: 'EAGAIN' }) };
      return spawnSync(file, args, options);
    };

    const revisions = revisionsFor('p.txt', { cwd: root, max: 3, spawn: flaky });
    assert.equal(calls, 2, 'the refused fork was not retried');
    assert.equal(revisions.length, 1, 'the retry did not produce the history');
  });

  it('and gives up rather than retrying for ever', async () => {
    // A machine that is out of processes stays out of processes. Retrying until
    // it works is how a CLI hangs instead of failing.
    const { revisionsFor, GitUnavailableError } = await import('../dist/git.js');
    const root = await repo([['first', { 'p.txt': SHORT }]]);

    let calls = 0;
    const always = () => {
      calls += 1;
      return { error: Object.assign(new Error('fork'), { code: 'EAGAIN' }) };
    };

    assert.throws(() => revisionsFor('p.txt', { cwd: root, max: 3, spawn: always }), GitUnavailableError);
    assert.equal(calls, 2, 'a permanently refused fork was not bounded to two attempts');
  });

  it('does not retry a git that is simply not installed', async () => {
    // `ENOENT` is not transient: git will still be missing a millisecond later.
    // Only a refused fork is worth a second attempt, and the difference is
    // observable only in the count — so the count is what is asserted.
    const { revisionsFor, GitUnavailableError } = await import('../dist/git.js');
    const root = await repo([['first', { 'p.txt': SHORT }]]);

    let calls = 0;
    const missing = () => {
      calls += 1;
      return { error: Object.assign(new Error('no git'), { code: 'ENOENT' }) };
    };

    assert.throws(() => revisionsFor('p.txt', { cwd: root, max: 3, spawn: missing }), GitUnavailableError);
    assert.equal(calls, 1, 'a missing git was looked for twice');
  });

  it('does not retry a git that ran and refused', async () => {
    // A non-zero exit is git answering. Asking again just runs a command that
    // already failed for a reason, and doubles the wait before saying so.
    const { revisionsFor } = await import('../dist/git.js');
    const root = await repo([['first', { 'p.txt': SHORT }]]);

    let calls = 0;
    const refuses = () => {
      calls += 1;
      return { status: 128, stdout: '', stderr: 'fatal: bad revision' };
    };

    assert.deepEqual(revisionsFor('p.txt', { cwd: root, max: 3, spawn: refuses }), []);
    assert.equal(calls, 1, 'a git that answered was asked twice');
  });

  it('still calls an empty history an empty history', async () => {
    // The other side of the same distinction, so the fix cannot be "throw on
    // everything". git runs, git answers, the answer is nothing.
    const { revisionsFor } = await import('../dist/git.js');
    const root = await repo([['first', { 'p.txt': SHORT }]]);
    await writeFile(join(root, 'untracked.txt'), SHORT);

    assert.deepEqual(revisionsFor('untracked.txt', { cwd: root, max: 3 }), []);
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
    assert.equal(rows.length, 2, out);
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
    const { out, code } = run(['p.txt', '--limit', '3'], root);

    /**
     * The exit code first, with the output as the message.
     *
     * This test failed once on CI and could not be diagnosed, because it was the
     * only one in this file that checked neither. `blame` prints its reason to
     * stderr and `run` collects it, so the evidence was there and thrown away:
     * all the report said was `0 !== 3`, which is what "the table has no rows"
     * looks like whether the history was short, the path was rejected, or git
     * never answered.
     *
     * Not a fix for that failure — it has never reproduced here, in 26 runs
     * including under load, and the same commit passed in the same CI minute on
     * another event. It is what makes the next occurrence say something.
     */
    assert.equal(code, 0, out);
    const rows = rowsOf(out);
    assert.equal(rows.length, 3, out);
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

describe('blame --markdown-out', () => {
  it('writes a history a pull request can render', async () => {
    const root = await repo([
      ['first', { 'p.txt': SHORT }],
      ['grow it', { 'p.txt': LONG }],
    ]);
    const out = join(root, 'report.md');
    assert.equal(run(['p.txt', '--markdown-out', out], root).code, 0);

    const md = await readFile(out, 'utf8');
    assert.match(md, /^### Trazum, token history for/m);
    assert.match(md, /\| Date \| Tokens \| Change \|/);
    // A rise is what somebody has to act on, so it is what gets the weight.
    assert.match(md, /\*\*\+\d+\*\*/);
    assert.match(md, /Biggest single increase/);
  });

  it('carries the same priced movement the terminal printed', async () => {
    // One arithmetic, two destinations. Two copies is how a comment and a job
    // log start disagreeing about the same history.
    const root = await repo([
      ['first', { 'p.txt': SHORT }],
      ['grow it', { 'p.txt': LONG }],
    ]);
    const out = join(root, 'report.md');
    const terminal = run(['p.txt', '--calls', '50000', '--markdown-out', out], root);
    const md = await readFile(out, 'utf8');

    const money = /([+\u2212]\$[\d.,]+) a month/;
    const fromTerminal = terminal.stdout.match(money);
    const fromMarkdown = md.match(money);
    assert.ok(fromTerminal, `no priced movement in the terminal report:\n${terminal.out}`);
    assert.ok(fromMarkdown, `no priced movement in the markdown report:\n${md}`);
    assert.equal(fromMarkdown[1], fromTerminal[1]);
  });

  it('does not put a commit subject anywhere it could break the table', async () => {
    // The subject is written by whoever opened the pull request.
    const root = await repo([
      ['first', { 'p.txt': SHORT }],
      ['grow | </table><script>x</script> \\', { 'p.txt': LONG }],
    ]);
    const out = join(root, 'report.md');
    assert.equal(run(['p.txt', '--markdown-out', out], root).code, 0);

    const md = await readFile(out, 'utf8');
    const rows = md
      .split('\n')
      .filter((line) => line.startsWith('|'))
      .map((line) => line.slice(1, -1).split(/(?<!\\)\|/).length);
    assert.equal(new Set(rows).size, 1, `ragged table: ${rows.join(', ')}`);
    assert.equal(md.includes('<script>'), false);
    assert.match(md, /&lt;\/table&gt;/);
  });

  it('does not fail the run when the file cannot be written', async () => {
    const root = await repo([['first', { 'p.txt': SHORT }]]);
    const result = run(['p.txt', '--markdown-out', join(root, 'p.txt', 'nope.md')], root);

    assert.equal(result.code, 0);
    assert.match(result.out, /Could not write/);
  });
});
