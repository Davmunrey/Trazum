import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;
const SOURCE = new URL('../src/', import.meta.url);
const { rangeDelivery } = await import(new URL('../dist/git.js', import.meta.url));
const { perDelivery } = await import(new URL('../dist/bill-range.js', import.meta.url));

/**
 * `trazum bill --git-range <range> --delivery` (#825): the spend recorded in a
 * repository's sessions set beside what local git shows landed in the same range.
 *
 * A made-up repository and made-up sessions, worked out by hand. Sonnet 5.5 is
 * $2 per million input tokens, and every call has no output, so a call's dollars
 * are its input tokens over a million, times two.
 *
 * The range main..HEAD holds eight commits (author time / commit time, UTC):
 *   A  "start the work"                       03-02 09:00 / 09:05
 *   D  "side work", on a branch               03-02 10:00 / 10:10
 *   B  "Add widget (#41)"   squash style      03-02 11:00 / 11:30
 *   E  "Tidy widget (#41)"  the same number   03-02 11:10 / 11:20
 *   F  `Revert "Add widget (#41)"`            03-02 11:15 / 11:25   ends in `)"`: names no pull request
 *   G  "Call (#43) later"                     03-02 11:16 / 11:26   a number mid-subject: names none
 *   M  "Merge pull request #42 from ..."      03-02 11:20 / 11:30   a real merge of D's branch
 *   H  "last one"                             03-02 23:00 / 03-03 10:00
 * so: 8 commits, 1 of them a merge; the pull requests named are #41 (twice,
 * counted once) and #42, so 2; the commit times fall on 03-02 and 03-03, so 2
 * days, while the author times fall on one day, which is the difference between
 * "written" and "landed". The span is 03-02 09:00:00 to 03-03 10:00:00.
 *
 * Sessions of this repository's project folder:
 *   in-1   03-02 09:10 1,000,000 ($2.00) and 10:00 500,000 ($1.00)    inside
 *   in-2   03-03 09:30 500,000 ($1.00)                                 inside
 *   late   03-04 10:00 5,000,000 ($10.00)                              wholly after
 * so the figure is $3.00 + $1.00 = $4.00, 3 calls, 2 sessions, and divided:
 * $4.00 / 8 commits = $0.50, $4.00 / 2 pull requests = $2.00, $4.00 / 2 days = $2.00.
 */

const SECRET_WORDS = ['widget', 'start the work', 'side work', 'last one', 'secret-branch-3c7a', 'Made Up', 'made.up@', 'someone'];

const line = (session, ts, input, n) =>
  JSON.stringify({
    type: 'assistant',
    timestamp: ts,
    sessionId: session,
    requestId: `req-${session}-${n}`,
    message: { id: `msg-${session}-${n}`, model: 'claude-sonnet-5-5', usage: { input_tokens: input, output_tokens: 0 } },
  });

const SESSIONS = {
  'in-1': [line('in-1', '2026-03-02T09:10:00Z', 1_000_000, 1), line('in-1', '2026-03-02T10:00:00Z', 500_000, 2)],
  'in-2': [line('in-2', '2026-03-03T09:30:00Z', 500_000, 1)],
  late: [line('late', '2026-03-04T10:00:00Z', 5_000_000, 1)],
};

const GIT_ENV = { ...SPAWN_ENV, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' };

function git(args, cwd, env = {}) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...GIT_ENV, ...env } });
  assert.equal(result.status, 0, `git ${args.join(' ')} failed: ${result.stderr}`);
  return result.stdout;
}

const IDENTITY = {
  GIT_AUTHOR_NAME: 'Made Up',
  GIT_AUTHOR_EMAIL: 'made.up@example.com',
  GIT_COMMITTER_NAME: 'Made Up',
  GIT_COMMITTER_EMAIL: 'made.up@example.com',
};
const dated = (author, committer) => ({ ...IDENTITY, GIT_AUTHOR_DATE: author, GIT_COMMITTER_DATE: committer });
const commit = (cwd, message, author, committer) => git(['commit', '-q', '--allow-empty', '-m', message], cwd, dated(author, committer));

const folderFor = (root) => root.replace(/[^A-Za-z0-9]/g, '-');

/** `plain` keeps only the two commits that name no pull request. */
async function world({ sessions = SESSIONS, plain = false } = {}) {
  const base = await realpath(await mkdtemp(join(tmpdir(), 'trazum-git-delivery-')));
  const root = join(base, 'made-up-repo');
  await mkdir(root);
  git(['init', '-q'], root);
  git(['symbolic-ref', 'HEAD', 'refs/heads/main'], root);
  commit(root, 'base', '2026-03-01T10:00:00Z', '2026-03-01T10:00:00Z');
  git(['checkout', '-q', '-b', 'feature'], root);
  commit(root, 'start the work', '2026-03-02T09:00:00Z', '2026-03-02T09:05:00Z');
  if (!plain) {
    git(['checkout', '-q', '-b', 'secret-branch-3c7a'], root);
    commit(root, 'side work', '2026-03-02T10:00:00Z', '2026-03-02T10:10:00Z');
    git(['checkout', '-q', 'feature'], root);
    commit(root, 'Add widget (#41)', '2026-03-02T11:00:00Z', '2026-03-02T11:30:00Z');
    commit(root, 'Tidy widget (#41)', '2026-03-02T11:10:00Z', '2026-03-02T11:20:00Z');
    commit(root, 'Revert "Add widget (#41)"', '2026-03-02T11:15:00Z', '2026-03-02T11:25:00Z');
    commit(root, 'Call (#43) later', '2026-03-02T11:16:00Z', '2026-03-02T11:26:00Z');
    git(
      ['merge', '-q', '--no-ff', '-m', 'Merge pull request #42 from someone/secret-branch-3c7a', 'secret-branch-3c7a'],
      root,
      dated('2026-03-02T11:20:00Z', '2026-03-02T11:30:00Z'),
    );
  }
  commit(root, 'last one', '2026-03-02T23:00:00Z', '2026-03-03T10:00:00Z');

  const projects = join(base, 'projects');
  const mine = join(projects, folderFor(root));
  await mkdir(mine, { recursive: true });
  for (const [name, lines] of Object.entries(sessions)) await writeFile(join(mine, `${name}.jsonl`), lines.join('\n') + '\n');
  return { base, root, projects };
}

const run = (args, cwd, locale = 'en') =>
  spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env: { ...SPAWN_ENV, TRAZUM_LOCALE: locale }, timeout: 60000 });

const flat = (text) => text.replace(/\s+/g, ' ');

describe('bill --git-range --delivery', () => {
  it('sets the recorded figure beside commits, pull requests and days, and divides it by each', async () => {
    const { root, projects } = await world();
    const result = run(['bill', projects, '--git-range', 'main..HEAD', '--delivery'], root);
    assert.equal(result.status, 0, result.stderr);
    const out = flat(result.stdout);

    // The figure is the one the plain view prints: $3.00 + $1.00.
    assert.match(out, /\$4\.00 across 3 priced call\(s\) in 2 session\(s\)/);
    assert.match(out, /from the author and commit times of 8 commit\(s\)/);
    // 8 commits, 1 merge; #41 once and #42 once; commit times on 2 UTC days.
    assert.match(out, /Landed in the same range, from local git: 8 commit\(s\), 1 of them merge commits; 2 pull request\(s\) named by number in a subject; 2 UTC day\(s\) with a commit\./);
    // $4.00 / 8, / 2, / 2.
    assert.match(out, /\$0\.5000 per commit, \$2\.00 per pull request, \$2\.00 per day\./);
  });

  it('counts a day by when the commit landed, not when it was written', async () => {
    const { root, projects } = await world();
    const out = flat(run(['bill', projects, '--git-range', 'main..HEAD', '--delivery'], root).stdout);
    // Every author time is on 03-02; only the commit time of the last commit is on 03-03.
    assert.match(out, /2 UTC day\(s\) with a commit/);
  });

  it('adds lines and changes none: the output without the flag is the output with it, less those lines', async () => {
    const { root, projects } = await world();
    const plain = run(['bill', projects, '--git-range', 'main..HEAD'], root).stdout;
    const withFlag = run(['bill', projects, '--git-range', 'main..HEAD', '--delivery'], root).stdout;
    assert.ok(!/Landed in the same range|divided by each count/.test(plain), 'the default view printed delivery lines');
    const stripped = withFlag
      .split('\n')
      .filter((row) => !/^Landed in the same range|^The figure above divided by each count/.test(row))
      .join('\n')
      // The two lines sat in a paragraph of their own: the blank line before it goes with them.
      .replace(/\n\n\n$/, '\n\n');
    assert.equal(stripped, plain);
  });

  it('prints, without the flag, exactly what it printed before the flag existed', async () => {
    const { root, projects } = await world();
    const result = run(['bill', projects, '--git-range', 'main..HEAD'], root);
    assert.equal(result.status, 0, result.stderr);
    // Written by hand from the sessions and commits above. The figure line is
    // $3.00 + $1.00 in 3 calls; the late session is the 1 call left out.
    const expected = [
      '',
      "Recorded in this repository's sessions while main..HEAD was written",
      '',
      'Span: 2026-03-02T09:00:00Z to 2026-03-03T10:00:00Z, from the author and commit times of 8 commit(s).',
      '$4.00 across 3 priced call(s) in 2 session(s) that began and ended inside the span.',
      '',
      'No session crossed either edge of the span.',
      '',
      'This is everything recorded in this repository during that span. It is not the cost of the change: other work in the same repository is in it, and work for the change done anywhere else is not.',
      'Left out: 1 call(s) of sessions wholly outside the span, 0 record(s) of other projects, 0 record(s) from sources with no project folder to match (Codex, Gemini CLI, logs), 0 call(s) with no timestamp.',
      '',
      '',
    ].join('\n');
    assert.equal(result.stdout, expected);
  });

  it('names no author, message, branch, hash or pull request number', async () => {
    const { root, projects } = await world();
    const shas = git(['log', '--format=%H', 'main..HEAD'], root).split('\n').filter(Boolean);
    assert.equal(shas.length, 8);
    const result = run(['bill', projects, '--git-range', 'main..HEAD', '--delivery'], root);
    assert.equal(result.status, 0, result.stderr);
    for (const text of [result.stdout, result.stderr]) {
      for (const word of SECRET_WORDS) assert.ok(!text.includes(word), `${word} reached the output`);
      for (const sha of shas) assert.ok(!text.includes(sha.slice(0, 7)), 'a hash reached the output');
      assert.ok(!/#4[123]/.test(text), 'a pull request number reached the output');
    }
  });

  it('says what the figures are, and that none of them is what a commit cost', async () => {
    const { root, projects } = await world();
    for (const locale of ['en', 'es']) {
      const out = flat(run(['bill', projects, '--git-range', 'main..HEAD', '--delivery'], root, locale).stdout);
      if (locale === 'en') assert.match(out, /Two numbers over one span, not what any commit, pull request or day cost\./);
      else assert.match(out, /Dos números sobre un mismo periodo, no lo que costó un commit, una pull request o un día\./);
      for (const word of [
        /\bcaused\b/i,
        /\bcausó\b/i,
        /cost of the (commit|pull request|PR|branch|feature|day)\b/i,
        /cost per (commit|pull request|PR|day)\b/i,
        /(this|that|each) (commit|pull request|PR|day) cost\b/i,
        /coste (de|por) (cada |un |una )?(commit|pull request|día)\b/i,
        /cost(ó|o) (este|ese|cada) (commit|día)\b/i,
      ]) {
        assert.doesNotMatch(out, word);
      }
    }
  });

  it('says it in Spanish too', async () => {
    const { root, projects } = await world();
    const result = run(['bill', projects, '--git-range', 'main..HEAD', '--delivery'], root, 'es');
    assert.equal(result.status, 0, result.stderr);
    const out = flat(result.stdout);
    assert.match(out, /Llegó en el mismo rango, según git local: 8 commit\(s\), 1 de ellos commits de fusión; 2 pull request\(s\) con número en un asunto; 2 día\(s\) UTC con un commit\./);
    assert.match(out, /\$0\.5000 por commit, \$2\.00 por pull request, \$2\.00 por día\./);
    assert.doesNotMatch(out, /Landed in the same range/);
  });

  it('names no figure per pull request when none is named, and never prints $0 for it', async () => {
    const { root, projects } = await world({ plain: true });
    const out = flat(run(['bill', projects, '--git-range', 'main..HEAD', '--delivery'], root).stdout);
    // Two commits, none naming a pull request, on 2 days; $4.00 / 2 = $2.00 each.
    assert.match(out, /2 commit\(s\), 0 of them merge commits; 0 pull request\(s\) named by number in a subject; 2 UTC day\(s\)/);
    assert.match(out, /\$2\.00 per commit, no figure \(no pull request is named\) per pull request, \$2\.00 per day\./);
  });

  it('has nothing to divide when no session is inside the span, and says so', async () => {
    const { root, projects } = await world({ sessions: { late: SESSIONS.late } });
    const out = flat(run(['bill', projects, '--git-range', 'main..HEAD', '--delivery'], root).stdout);
    assert.match(out, /No session of this project began and ended inside the span\./);
    assert.match(out, /Landed in the same range, from local git: 8 commit\(s\)/);
    assert.match(out, /there is no figure to divide by these counts\./);
    assert.doesNotMatch(out, /per commit/);
  });

  it('is refused without --git-range, by name', async () => {
    const { root, projects } = await world();
    const result = run(['bill', projects, '--delivery'], root);
    assert.notEqual(result.status, 0);
    assert.match(flat(result.stderr), /--delivery .* needs --git-range/);
  });

  it('still refuses what --git-range refuses, beside --delivery', async () => {
    const { root, projects } = await world();
    for (const extra of [['--since', '2026-03-01'], ['--by', 'day'], ['--receipt']]) {
      const result = run(['bill', projects, '--git-range', 'main..HEAD', '--delivery', ...extra], root);
      assert.notEqual(result.status, 0, `${extra.join(' ')} was accepted`);
      assert.match(flat(result.stderr), /cannot be combined with --/);
    }
  });
});

describe('rangeDelivery', () => {
  const fakeLog = (stdout) => {
    const calls = [];
    const spawn = (command, args) => {
      calls.push({ command, args });
      return { status: 0, stdout, stderr: '', error: undefined };
    };
    return { spawn, calls };
  };
  const FS = '\u001f';
  const row = (parents, ct, subject) => `${parents}${FS}${ct}${FS}${subject}`;
  const P1 = 'a'.repeat(40);
  const P2 = 'b'.repeat(40);

  it('asks git for the parents, the commit time and the subject, and nothing else', () => {
    const { spawn, calls } = fakeLog('');
    rangeDelivery('main..HEAD', { cwd: '/nowhere', spawn });
    assert.equal(calls.length, 1);
    const format = calls[0].args.find((arg) => arg.startsWith('--format='));
    assert.equal(format, `--format=%P${FS}%ct${FS}%s`);
    // No author or committer name or email, no body, no hash, no ref names.
    assert.ok(!/%(a|c)[nNeE]|%b|%B|%H|%h|%d|%D|%G/.test(format));
    // The range is one argument, then the separator, so it can never be a path.
    assert.deepEqual(calls[0].args.slice(-2), ['main..HEAD', '--']);
  });

  it('reads a pull request number from the two shapes GitHub writes, and only those', () => {
    const { spawn } = fakeLog(
      [
        row(`${P1} ${P2}`, '1772445000', 'Merge pull request #13 from someone/somewhere'),
        row(P1, '1772445000', 'Fix a thing (#16)'),
        row(P1, '1772445000', 'Fix a thing (#16)  '),
        row(P1, '1772445000', 'Call (#17) later'),
        row(P1, '1772445000', 'Revert "Fix (#18)"'),
        row(P1, '1772445000', 'Merge pull request #19 from someone/somewhere'),
        row(`${P1} ${P2}`, '1772445000', 'Merge branch main into feature (#20)'),
        row(P1, '1772445000', 'no number at all'),
        row(P1, '1772445000', `has the separator ${FS} in it (#21)`),
      ].join('\n'),
    );
    const found = rangeDelivery('main..HEAD', { cwd: '/nowhere', spawn });
    // #13 (merge shape, 2 parents), #16 once, #21. Not #17 (mid-subject), #18 (ends `)"`),
    // #19 (merge shape on one parent), #20 (squash shape on a merge).
    assert.equal(found.pullRequests, 3);
    assert.equal(found.commits, 9);
    assert.equal(found.merges, 2);
    assert.equal(found.days, 1);
  });

  it('keeps four integers and nothing of what it read', () => {
    const { spawn } = fakeLog(row(P1, '1772445000', 'secret message (#5)'));
    const found = rangeDelivery('main..HEAD', { cwd: '/nowhere', spawn });
    assert.deepEqual(Object.keys(found).sort(), ['commits', 'days', 'merges', 'pullRequests']);
    for (const value of Object.values(found)) assert.equal(typeof value, 'number');
  });

  it('skips a row whose time is not a number, and refuses a range that reads as an option', () => {
    const { spawn } = fakeLog([row(P1, 'soon', 'x'), row(P1, '1772445000', 'y')].join('\n'));
    assert.equal(rangeDelivery('main..HEAD', { cwd: '/nowhere', spawn }).commits, 1);
    const never = fakeLog('');
    assert.equal(rangeDelivery('--output=/tmp/x', { cwd: '/nowhere', spawn: never.spawn }), null);
    assert.equal(never.calls.length, 0);
  });
});

describe('perDelivery', () => {
  it('divides, and gives no figure where the count is zero', () => {
    assert.deepEqual(perDelivery(4, { commits: 8, pullRequests: 2, days: 2 }), { perCommit: 0.5, perPullRequest: 2, perDay: 2 });
    assert.deepEqual(perDelivery(4, { commits: 8, pullRequests: 0, days: 1 }), { perCommit: 0.5, perPullRequest: null, perDay: 4 });
  });
});

describe('the delivery view runs git only from git.ts', () => {
  it('has no program of its own in bill-range.ts', async () => {
    const source = await readFile(new URL('bill-range.ts', SOURCE), 'utf8');
    assert.ok(!/child_process|spawn|exec/.test(source.replace(/\/\*[\s\S]*?\*\//g, '')));
  });
});
