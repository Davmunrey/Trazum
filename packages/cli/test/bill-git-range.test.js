import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;
const SOURCE = new URL('../src/', import.meta.url);

/**
 * `trazum bill --git-range` (#777): what was recorded in this repository's
 * Claude Code sessions between the first and the last commit of a range.
 *
 * A made-up repository and made-up sessions, worked out by hand. Sonnet 5.5 is
 * $2 per million input tokens, and every call here has no output, so a call's
 * dollars are its input tokens over a million, times two.
 *
 * The range holds two commits on 2026-03-02 (UTC):
 *   A  written 09:00:00, committed 09:05:00 (rebased: the work began at the author time)
 *   B  written 11:00:00, committed 11:30:00 (rebased: the committer time is later)
 * so the span is 09:00:00 to 11:30:00, both edges inside it.
 *
 * Sessions of this repository's project folder:
 *   inside-1     09:10 1,000,000 tokens ($2.00) and 10:00 500,000 ($1.00)
 *   inside-2     09:02 250,000 ($0.50), after A was written and before it was committed,
 *                and 11:30:00 exactly, 250,000 ($0.50): the edge is in
 *   straddle-lo  08:30 1,000,000 ($2.00) before, 09:30 100,000 ($0.20) inside
 *   straddle-hi  11:00 200,000 ($0.40) inside, 12:00 1,000,000 ($2.00) after
 *   before-all   03-01 15:00, 300,000 ($0.60), wholly outside
 *   after-all    03-03 10:00, 5,000,000 ($10.00), wholly outside
 * and one call of inside-1 with no timestamp, which cannot be placed.
 * Another project's session is inside the window with 1,000,000 ($2.00).
 *
 * So the figure is inside-1 + inside-2 = $3.00 + $1.00 = $4.00, 4 calls, 2
 * sessions. Straddling: straddle-lo $0.20 in and $2.00 out, straddle-hi $0.40
 * in and $2.00 out. Left out: 2 calls of wholly outside sessions, 1 record of
 * the other project, 1 undated call.
 */

const SECRET_BRANCH = 'secret-branch-5d1c';
const SECRET_CWD = '/home/secret-cwd-9f2e/place';

const line = (session, ts, input, n) =>
  JSON.stringify({
    type: 'assistant',
    ...(ts === null ? {} : { timestamp: ts }),
    sessionId: session,
    requestId: `req-${session}-${n}`,
    cwd: SECRET_CWD,
    gitBranch: SECRET_BRANCH,
    message: { id: `msg-${session}-${n}`, model: 'claude-sonnet-5-5', usage: { input_tokens: input, output_tokens: 0 } },
  });

const SESSIONS = {
  'inside-1': [line('inside-1', '2026-03-02T09:10:00Z', 1_000_000, 1), line('inside-1', '2026-03-02T10:00:00Z', 500_000, 2), line('inside-1', null, 100_000, 3)],
  'inside-2': [line('inside-2', '2026-03-02T09:02:00Z', 250_000, 1), line('inside-2', '2026-03-02T11:30:00Z', 250_000, 2)],
  'straddle-lo': [line('straddle-lo', '2026-03-02T08:30:00Z', 1_000_000, 1), line('straddle-lo', '2026-03-02T09:30:00Z', 100_000, 2)],
  'straddle-hi': [line('straddle-hi', '2026-03-02T11:00:00Z', 200_000, 1), line('straddle-hi', '2026-03-02T12:00:00Z', 1_000_000, 2)],
  'before-all': [line('before-all', '2026-03-01T15:00:00Z', 300_000, 1)],
  'after-all': [line('after-all', '2026-03-03T10:00:00Z', 5_000_000, 1)],
};

const GIT_ENV = { ...SPAWN_ENV, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' };

function git(args, cwd, env = {}) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...GIT_ENV, ...env } });
  assert.equal(result.status, 0, `git ${args.join(' ')} failed: ${result.stderr}`);
  return result.stdout;
}

const commit = (cwd, message, author, committer) =>
  git(['commit', '-q', '--allow-empty', '-m', message], cwd, {
    GIT_AUTHOR_NAME: 'Made Up',
    GIT_AUTHOR_EMAIL: 'made.up@example.com',
    GIT_COMMITTER_NAME: 'Made Up',
    GIT_COMMITTER_EMAIL: 'made.up@example.com',
    GIT_AUTHOR_DATE: author,
    GIT_COMMITTER_DATE: committer,
  });

/** Claude Code's name for a project folder: the absolute path, every other character a dash. */
const folderFor = (root) => root.replace(/[^A-Za-z0-9]/g, '-');

async function world({ sessions = SESSIONS, otherProject = true, projectFolder } = {}) {
  const base = await realpath(await mkdtemp(join(tmpdir(), 'trazum-git-range-')));
  const root = join(base, 'made-up-repo');
  await mkdir(root);
  git(['init', '-q'], root);
  git(['symbolic-ref', 'HEAD', 'refs/heads/main'], root);
  commit(root, 'base', '2026-03-01T10:00:00Z', '2026-03-01T10:00:00Z');
  git(['checkout', '-q', '-b', 'feature'], root);
  commit(root, 'a', '2026-03-02T09:00:00Z', '2026-03-02T09:05:00Z');
  commit(root, 'b', '2026-03-02T11:00:00Z', '2026-03-02T11:30:00Z');

  const projects = join(base, 'projects');
  const mine = join(projects, projectFolder ?? folderFor(root));
  await mkdir(mine, { recursive: true });
  for (const [name, lines] of Object.entries(sessions)) await writeFile(join(mine, `${name}.jsonl`), lines.join('\n') + '\n');
  if (otherProject) {
    const other = join(projects, folderFor(join(base, 'another-repo')));
    await mkdir(other);
    await writeFile(join(other, 'other-1.jsonl'), line('other-1', '2026-03-02T10:00:00Z', 1_000_000, 1) + '\n');
  }
  return { base, root, projects };
}

const run = (args, cwd, locale = 'en') =>
  spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env: { ...SPAWN_ENV, TRAZUM_LOCALE: locale }, timeout: 60000 });

const flat = (text) => text.replace(/\s+/g, ' ');

describe('bill --git-range', () => {
  it('sums the sessions inside the span and names the two that cross an edge', async () => {
    const { root, projects } = await world();
    const result = run(['bill', projects, '--git-range', 'main..HEAD'], root);
    assert.equal(result.status, 0, result.stderr);
    const out = flat(result.stdout);

    assert.match(out, /Span: 2026-03-02T09:00:00Z to 2026-03-02T11:30:00Z, from the author and commit times of 2 commit/);
    // $3.00 + $1.00, 4 calls, 2 sessions: the sessions that began and ended inside.
    assert.match(out, /\$4\.00 across 4 priced call\(s\) in 2 session\(s\)/);
    assert.match(out, /2 session\(s\) began before the span or went on after it\. Counted apart, not in the figure above/);
    assert.match(out, /straddle-lo 2026-03-02T08:30:00Z to 2026-03-02T09:30:00Z: \$0\.2000 \(1 call\(s\)\) inside the span, \$2\.00 \(1 call\(s\)\) outside it/);
    assert.match(out, /straddle-hi 2026-03-02T11:00:00Z to 2026-03-02T12:00:00Z: \$0\.4000 \(1 call\(s\)\) inside the span, \$2\.00 \(1 call\(s\)\) outside it/);
    // Two wholly outside calls, one record of the other project, none from other sources, one undated call.
    assert.match(out, /Left out: 2 call\(s\) of sessions wholly outside the span, 1 record\(s\) of other projects, 0 record\(s\) from sources/);
    assert.match(out, /, 1 call\(s\) with no timestamp\./);
  });

  it('says what the figure is, and does not say the change caused it', async () => {
    const { root, projects } = await world();
    const out = flat(run(['bill', projects, '--git-range', 'main..HEAD'], root).stdout);
    assert.match(out, /everything recorded in this repository during that span\. It is not the cost of the change/);
    for (const word of [/\bcaused\b/i, /cost of the (pull request|PR|branch|feature)\b/i, /this change cost/i]) {
      assert.doesNotMatch(out, word);
    }
  });

  it('says it in Spanish too', async () => {
    const { root, projects } = await world();
    const result = run(['bill', projects, '--git-range', 'main..HEAD'], root, 'es');
    assert.equal(result.status, 0, result.stderr);
    const out = flat(result.stdout);
    assert.match(out, /No es el coste del cambio/);
    assert.match(out, /\$4\.00 en 4 llamada\(s\) valorada\(s\) de 2 sesión\(es\)/);
    assert.match(out, /straddle-lo/);
    assert.doesNotMatch(out, /Span:/);
  });

  it('copies no branch name and no working directory out of a transcript', async () => {
    const { root, projects } = await world();
    const result = run(['bill', projects, '--git-range', 'main..HEAD'], root);
    assert.equal(result.status, 0, result.stderr);
    for (const text of [result.stdout, result.stderr]) {
      assert.ok(!text.includes(SECRET_BRANCH), 'a branch name from a transcript reached the output');
      assert.ok(!text.includes(SECRET_CWD), 'a working directory from a transcript reached the output');
      assert.ok(!text.includes('secret-cwd'), 'part of a working directory reached the output');
    }
  });

  it('names no author or commit message either', async () => {
    const { root, projects } = await world();
    const result = run(['bill', projects, '--git-range', 'main..HEAD'], root);
    assert.ok(!/Made Up|made\.up@/.test(result.stdout + result.stderr));
  });

  it('does not match a project folder that is not this repository, and says so', async () => {
    const { root, projects } = await world({ projectFolder: 'some-other-folder', otherProject: false });
    const result = run(['bill', projects, '--git-range', 'main..HEAD'], root);
    assert.notEqual(result.status, 0);
    assert.match(flat(result.stderr), /No session read belongs to this repository's project folder/);
  });

  it('does not match a session started in a worktree of the repository', async () => {
    const { root, projects } = await world({ projectFolder: 'unused', otherProject: false });
    // The same repository's path with a worktree folder under it is another folder, another name.
    const worktree = join(projects, `${folderFor(root)}--claude-worktrees-x`);
    await mkdir(worktree);
    await writeFile(join(worktree, 'w.jsonl'), line('w', '2026-03-02T10:00:00Z', 1_000_000, 1) + '\n');
    const result = run(['bill', projects, '--git-range', 'main..HEAD'], root);
    assert.notEqual(result.status, 0);
    assert.match(flat(result.stderr), /not matched/);
  });

  it('says nothing was inside when every session crosses or misses the span', async () => {
    const { root, projects } = await world({ sessions: { 'straddle-lo': SESSIONS['straddle-lo'], 'after-all': SESSIONS['after-all'] }, otherProject: false });
    const out = flat(run(['bill', projects, '--git-range', 'main..HEAD'], root).stdout);
    assert.match(out, /No session of this project began and ended inside the span\./);
    assert.match(out, /1 session\(s\) began before the span/);
    assert.doesNotMatch(out, /\$0\.2000 across/);
  });

  it('says nothing crossed an edge when nothing did', async () => {
    const { root, projects } = await world({ sessions: { 'inside-2': SESSIONS['inside-2'] }, otherProject: false });
    const out = flat(run(['bill', projects, '--git-range', 'main..HEAD'], root).stdout);
    assert.match(out, /\$1\.00 across 2 priced call\(s\) in 1 session\(s\)/);
    assert.match(out, /No session crossed either edge of the span\./);
  });

  it('refuses a range git does not know, an empty range and a flag that sets the period', async () => {
    const { root, projects } = await world();
    const bad = run(['bill', projects, '--git-range', 'nosuchbranch..HEAD'], root);
    assert.notEqual(bad.status, 0);
    assert.match(flat(bad.stderr), /git does not know the range "nosuchbranch\.\.HEAD"/);

    const empty = run(['bill', projects, '--git-range', 'HEAD..HEAD'], root);
    assert.notEqual(empty.status, 0);
    assert.match(flat(empty.stderr), /holds no commit/);

    for (const extra of [['--since', '2026-03-01'], ['--until', '2026-03-05'], ['--label', 'x'], ['--no-label-from-project'], ['--receipt'], ['--pdf-out', 'x.pdf'], ['--otlp-out', 'x.json']]) {
      const result = run(['bill', projects, '--git-range', 'main..HEAD', ...extra], root);
      assert.notEqual(result.status, 0, `${extra.join(' ')} was accepted`);
      assert.match(flat(result.stderr), /cannot be combined with --/);
    }
  });

  it('never lets a range reach git as an option', async () => {
    const { root, projects } = await world();
    const target = join(root, 'planted.txt');
    const result = run(['bill', projects, '--git-range', `--output=${target}`], root);
    assert.notEqual(result.status, 0);
    await assert.rejects(readFile(target), 'git wrote a file named by the range');
  });

  it('refuses outside a repository', async () => {
    const { base, projects } = await world();
    const elsewhere = await mkdtemp(join(tmpdir(), 'trazum-not-a-repo-'));
    const result = run(['bill', projects, '--git-range', 'main..HEAD'], elsewhere);
    assert.notEqual(result.status, 0);
    assert.match(flat(result.stderr), /not inside a git repository/);
    assert.ok(base.length > 0);
  });

  it('runs git only from git.ts', async () => {
    const source = await readFile(new URL('bill-range.ts', SOURCE), 'utf8');
    assert.ok(!/child_process|spawn|exec/.test(source.replace(/\/\*[\s\S]*?\*\//g, '')), 'bill-range.ts runs a program');
    const index = await readFile(new URL('index.ts', SOURCE), 'utf8');
    assert.ok(!/from 'node:child_process'/.test(index));
  });
});
