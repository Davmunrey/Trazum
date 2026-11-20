import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { SPAWN_ENV } from '../../cli/test/env.mjs';
import { sectionOf } from '../../../test-utils/section.mjs';
import { POINTER } from '../../../scripts/changes.mjs';

import {
  ACCEPTED,
  addedLines,
  changelogChanges,
  fileAt,
  linkedIssues,
  readIssues,
  readiness,
  unaccepted,
} from '../../../scripts/pr-readiness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');

/**
 * The merge gate's decision: does a pull request name its issue, and does it
 * add its changelog entry as a file in `changes/` without editing an entry of
 * `CHANGELOG.md`? scripts/pr-readiness.mjs explains why each rule exists; this
 * holds the decision, including the case that prompted it (#666) and the
 * folder that ended it (#847).
 */

/** A changelog in the shape the 2.7.10 release left `main` in. */
const RELEASED = [
  '# Changelog',
  '',
  '## Unreleased',
  '',
  'No changes yet.',
  '',
  '## 2.7.10 — 2026-11-17',
  '',
  '### Fixed',
  '',
  '- **`plan` offered the Batch API to calls that cannot take it.**',
  '',
  '## 2.7.9 — 2026-11-17',
  '',
  '### Added',
  '',
  "- **Google's Gemini 4 family and Gemini 3.5 Flash-Lite are priced.**",
  '',
].join('\n');

const ENTRY = "- **Google's prices were re-read, and `gemini-2.5-pro` bills at Gemini 3.8 Flash's rates.**";

/** The same file with `ENTRY` written under Unreleased, where an entry went until #847. */
const WITH_ENTRY = RELEASED.replace('No changes yet.\n', `### Fixed\n\n${ENTRY}\n`);

/** Where the entry goes since #847. */
const FRAGMENT = 'changes/639.fixed.md';

/** Issue #639 as GitHub describes it once a maintainer has agreed to the work. */
const AGREED = { ref: '#639', labels: ['bug', 'accepted', 'area:core'], pullRequest: false };

const ready = (overrides = {}) =>
  readiness({
    body: 'Fixes #639',
    author: 'Davmunrey',
    labels: [],
    issues: [AGREED],
    changelogBefore: RELEASED,
    changelogAfter: RELEASED,
    added: [FRAGMENT],
    ...overrides,
  });

describe('a pull request names its issue', () => {
  it('reads every closing keyword GitHub reads, in order and without repeats', () => {
    const body = 'Fixes #12. Also resolves: other/repo#3, and closes #12 again.\nRefs #9.';
    assert.deepEqual(linkedIssues(body), ['#12', 'other/repo#3']);
    assert.deepEqual(linkedIssues('Closed #4, Fixed #5, resolved #6'), ['#4', '#5', '#6']);
  });

  it('a mention without a closing keyword links nothing', () => {
    assert.deepEqual(linkedIssues('See #12 and issue 14'), []);
    assert.deepEqual(linkedIssues(null), []);
  });

  it('a description with no linked issue is refused, with what to do', () => {
    const { problems } = ready({ body: 'Tidies the README.' });
    assert.equal(problems.length, 1);
    assert.match(problems[0], /Fixes #<n>/);
  });

  it('Dependabot and a maintainer-labelled no-issue pull request are exempt', () => {
    assert.deepEqual(ready({ body: '', author: 'dependabot[bot]', changelogAfter: RELEASED }).problems, []);
    assert.deepEqual(ready({ body: '', labels: ['no-issue'] }).problems, []);
  });
});

describe('the issue it names was accepted', () => {
  /*
    Until #718 any issue would do. A pull request could name one its own
    author had opened a minute earlier, still `needs-triage`, and pass: the
    check asked for a number and never for what stood behind it.
  */
  it('an issue a maintainer accepted is enough', () => {
    assert.deepEqual(ready().problems, []);
    assert.equal(ACCEPTED, 'accepted');
  });

  it('an issue still waiting for triage is refused, and the sentence says what it carries', () => {
    const { problems } = ready({ issues: [{ ref: '#639', labels: ['enhancement', 'needs-triage'], pullRequest: false }] });
    assert.equal(problems.length, 1, problems.join('\n'));
    assert.match(problems[0], /^Issue #639 is not accepted yet: it carries `enhancement`, `needs-triage`\./);
    assert.match(problems[0], /Once the issue is labelled `accepted`, re-run this check/);
  });

  it('so is one with no label at all, and one that was turned down', () => {
    assert.match(ready({ issues: [{ ref: '#639', labels: [], pullRequest: false }] }).problems[0], /it carries no label\./);
    assert.match(ready({ issues: [{ ref: '#639', labels: ['wontfix'], pullRequest: false }] }).problems[0], /it carries `wontfix`\./);
  });

  it('a label that only looks like it does not count', () => {
    for (const label of ['Accepted', 'accepted-later', 'not accepted', 'unaccepted']) {
      assert.equal(ready({ issues: [{ ref: '#639', labels: [label], pullRequest: false }] }).problems.length, 1, label);
    }
  });

  it('a pull request named in place of an issue is refused, and so is a number with nothing behind it', () => {
    assert.match(ready({ issues: [{ ref: '#639', labels: ['accepted'], pullRequest: true }] }).problems[0], /^#639 is a pull request, not an issue\./);
    assert.match(ready({ issues: [{ ref: '#639', missing: true }] }).problems[0], /^Issue #639 does not exist in this repository\./);
  });

  it('a closed issue does not count, even one that was accepted', () => {
    // Hundreds of closed issues here carry `accepted`. Naming any of them
    // would otherwise be a way past the rule.
    const { problems } = ready({ issues: [{ ...AGREED, closed: true }] });
    assert.equal(problems.length, 1, problems.join('\n'));
    assert.match(problems[0], /^Issue #639 is closed\. A pull request resolves an open issue/);
    assert.deepEqual(ready({ issues: [{ ...AGREED, closed: false }] }).problems, []);
  });

  it('an issue that was not read is not taken as accepted', () => {
    assert.match(ready({ issues: [] }).problems[0], /^Issue #639 was not read, so nothing says it was accepted\./);
    assert.match(readiness({ body: 'Fixes #639', author: 'somebody', changelogBefore: RELEASED, changelogAfter: RELEASED, added: [FRAGMENT] }).problems[0], /was not read/);
  });

  it('every issue a merge would close has to be accepted, not just the first', () => {
    const second = { ref: '#640', labels: ['needs-triage'], pullRequest: false };
    const { problems } = ready({ body: 'Fixes #639 and closes #640', issues: [AGREED, second] });
    assert.equal(problems.length, 1);
    assert.match(problems[0], /^Issue #640 is not accepted yet/);
    assert.deepEqual(ready({ body: 'Fixes #639 and closes #640', issues: [AGREED, { ...second, labels: ['accepted'] }] }).problems, []);
  });

  it('an issue of another repository cannot stand in for one of this', () => {
    assert.match(ready({ body: 'Fixes other/repo#3', issues: [] }).problems[0], /^other\/repo#3 is in another repository/);
    assert.deepEqual(unaccepted(['#639', 'other/repo#3'], [AGREED]).length, 1);
  });

  it('Dependabot and a no-issue pull request are not asked, whatever the issue says', () => {
    const waiting = [{ ref: '#639', labels: ['needs-triage'], pullRequest: false }];
    assert.deepEqual(ready({ author: 'dependabot[bot]', issues: waiting, changelogAfter: RELEASED }).problems, []);
    assert.deepEqual(ready({ labels: ['no-issue'], issues: waiting }).problems, []);
  });
});

describe('the labels are asked of GitHub, and an answer that is not one is not read as "no labels"', () => {
  const answering = (table) => {
    const asked = [];
    const fetcher = async (url, init) => {
      asked.push({ url, authorization: init.headers.authorization });
      const answer = table[url.split('/').at(-1)] ?? { status: 404 };
      return { status: answer.status, ok: answer.status >= 200 && answer.status < 300, json: async () => answer.body };
    };
    return { fetcher, asked };
  };

  it('reads each issue of this repository once, with the token, and nothing of another repository', async () => {
    const { fetcher, asked } = answering({
      639: { status: 200, body: { state: 'open', labels: [{ name: 'bug' }, { name: 'accepted' }] } },
      640: { status: 200, body: { state: 'closed', labels: ['needs-triage'], pull_request: { url: 'x' } } },
    });
    const read = await readIssues(['#639', 'other/repo#3', '#640'], { repository: 'o/r', token: 't0ken', fetcher });
    assert.deepEqual(read, [
      { ref: '#639', labels: ['bug', 'accepted'], pullRequest: false, closed: false },
      { ref: '#640', labels: ['needs-triage'], pullRequest: true, closed: true },
    ]);
    assert.deepEqual(asked, [
      { url: 'https://api.github.com/repos/o/r/issues/639', authorization: 'Bearer t0ken' },
      { url: 'https://api.github.com/repos/o/r/issues/640', authorization: 'Bearer t0ken' },
    ]);
  });

  it('a number with no issue behind it is missing, and says so', async () => {
    const { fetcher } = answering({});
    assert.deepEqual(await readIssues(['#999'], { repository: 'o/r', token: 't', fetcher }), [{ ref: '#999', missing: true }]);
  });

  it('a refusal or an outage throws: it must not come back looking like an issue with no labels', async () => {
    for (const status of [401, 403, 429, 500, 503]) {
      const { fetcher } = answering({ 639: { status, body: { message: 'no' } } });
      await assert.rejects(() => readIssues(['#639'], { repository: 'o/r', token: 't', fetcher }), new RegExp(`GitHub answered ${status} for issue #639`));
    }
  });

  it('the script refuses to judge when it cannot read, and exits 2, not 0', () => {
    const script = readFileSync(join(ROOT, 'scripts/pr-readiness.mjs'), 'utf8');
    const caught = script.indexOf('the linked issue could not be read');
    assert.ok(caught > 0);
    assert.match(script.slice(caught, caught + 200), /refusing to judge without it\.`\);\n\s+return 2;/);
    // And a failure nobody foresaw is not a pass either.
    assert.match(script, /console\.error\(`pr-readiness: \$\{error\.message\}`\);\n\s+process\.exitCode = 2;/);
  });
});

describe('the script itself, with a stand-in for GitHub', () => {
  /**
   * The whole of `main`: the description from the environment, the issue
   * asked for over HTTP, the verdict as exit code. The stand-in listens on
   * this machine and answers for one issue, so nothing leaves it. The two
   * commits compared are the same one, so the changelog rule always has its
   * say as well; what is read here is what the script says about the issue.
   */
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  async function run(answer, env = {}) {
    const asked = [];
    const server = createServer((request, response) => {
      asked.push({ url: request.url, authorization: request.headers.authorization });
      response.writeHead(answer.status, { 'content-type': 'application/json' });
      response.end(JSON.stringify(answer.body ?? {}));
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const child = spawn(process.execPath, [join(ROOT, 'scripts/pr-readiness.mjs')], {
        cwd: ROOT,
        env: { ...SPAWN_ENV, PR_BODY: 'Fixes #639', PR_AUTHOR: 'somebody', PR_LABELS: '[]', BASE_SHA: head, HEAD_SHA: head, GH_TOKEN: 'not-a-real-token', GITHUB_REPOSITORY: 'o/r', GITHUB_API_URL: `http://127.0.0.1:${server.address().port}`, ...env },
      });
      let out = '';
      child.stdout.on('data', (chunk) => { out += chunk; });
      child.stderr.on('data', (chunk) => { out += chunk; });
      const status = await new Promise((resolve) => child.on('close', resolve));
      return { status, out, asked };
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  }

  it('asks for the issue the description names, with the token, and refuses one that is not accepted', async () => {
    const { status, out, asked } = await run({ status: 200, body: { labels: [{ name: 'needs-triage' }] } });
    assert.deepEqual(asked, [{ url: '/repos/o/r/issues/639', authorization: 'Bearer not-a-real-token' }]);
    assert.equal(status, 1, out);
    assert.match(out, /^::error::Issue #639 is not accepted yet: it carries `needs-triage`\./m);
    assert.ok(!out.includes('not-a-real-token'), 'the token was printed');
  });

  it('says nothing about the issue when it is accepted and open', async () => {
    const { out } = await run({ status: 200, body: { state: 'open', labels: [{ name: 'accepted' }] } });
    assert.match(out, /^Linked issue: #639$/m);
    assert.doesNotMatch(out, /not accepted|was not read|could not be read|is closed/);
  });

  it('refuses an accepted issue that GitHub says is closed', async () => {
    const { status, out } = await run({ status: 200, body: { state: 'closed', labels: [{ name: 'accepted' }] } });
    assert.equal(status, 1, out);
    assert.match(out, /^::error::Issue #639 is closed\./m);
  });

  it('refuses to judge, with exit code 2, when GitHub does not answer for the issue', async () => {
    for (const code of [403, 500]) {
      const { status, out } = await run({ status: code, body: { message: 'no' } });
      assert.equal(status, 2, out);
      assert.match(out, new RegExp(`the linked issue could not be read \\(GitHub answered ${code} for issue #639\\); refusing to judge without it\\.`));
      assert.doesNotMatch(out, /^Ready:/m);
    }
  });

  it('refuses to judge when it is not told which repository it is in', async () => {
    const { status, out } = await run({ status: 200, body: { labels: [{ name: 'accepted' }] } }, { GITHUB_REPOSITORY: '' });
    assert.equal(status, 2, out);
    assert.match(out, /GITHUB_REPOSITORY is not set/);
  });

  it('does not ask at all for Dependabot, or for a pull request labelled no-issue', async () => {
    // Dependabot's description quotes other projects' changelogs, closing
    // keywords and all. Its pull request must not wait on GitHub for an
    // answer nobody will use, and must not be refused because GitHub was down.
    const bot = await run({ status: 500 }, { PR_AUTHOR: 'dependabot[bot]', PR_BODY: 'Bumps a thing.\n\nRelease notes: fixes #12, closes #13.' });
    assert.deepEqual(bot.asked, []);
    assert.equal(bot.status, 0, bot.out);
    const labelled = await run({ status: 500 }, { PR_LABELS: '["no-issue"]' });
    assert.deepEqual(labelled.asked, []);
    assert.doesNotMatch(labelled.out, /could not be read/);
  });
});

describe('a changelog of any size is read, and one that cannot be read is not judged', () => {
  /**
   * `CHANGELOG.md` passed 1 MiB on 2026-11-18. The script read it through
   * `execFileSync` with Node's default limit on a child's output, which is
   * 1 MiB, and swallowed the failure: a pull request that added twenty-two
   * lines under `Unreleased` was told to add one, and so would every pull
   * request after it have been (#754). So the script runs here on a real
   * repository whose changelog is larger than that.
   */
  const big = (extra = '') =>
    `# Changelog\n\n## Unreleased\n\n${extra}- **Something earlier.** It happened.\n\n## 1.0.0\n\n${'- A line of a released version, long enough to count for something.\n'.repeat(18_000)}`;

  function repository(before, after, files = {}) {
    const dir = mkdtempSync(join(tmpdir(), 'readiness-'));
    const git = (...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    git('init', '-q');
    writeFileSync(join(dir, 'README.md'), 'A repository.\n');
    if (before !== null) writeFileSync(join(dir, 'CHANGELOG.md'), before);
    git('add', '-A');
    git('commit', '-q', '--no-verify', '-m', 'base');
    const base = git('rev-parse', 'HEAD');
    writeFileSync(join(dir, 'CHANGELOG.md'), after);
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), text);
    }
    git('add', '-A');
    git('commit', '-q', '--no-verify', '-m', 'head');
    return { dir, base, head: git('rev-parse', 'HEAD') };
  }

  async function judge({ dir, base, head }) {
    const child = spawn(process.execPath, [join(ROOT, 'scripts/pr-readiness.mjs')], {
      cwd: dir,
      env: { ...SPAWN_ENV, PR_BODY: 'A change.', PR_AUTHOR: 'somebody', PR_LABELS: '["no-issue"]', BASE_SHA: base, HEAD_SHA: head },
    });
    let out = '';
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.stderr.on('data', (chunk) => { out += chunk; });
    const status = await new Promise((resolve) => child.on('close', resolve));
    return { status, out };
  }

  it('reads a changelog over 1 MiB, and finds the change file beside it', async () => {
    assert.ok(Buffer.byteLength(big()) > 1024 * 1024 + 100_000, 'the changelog made for this is not over the limit');
    const made = repository(big(), big(), { 'changes/1.added.md': '**Something new.** It was added (#1).\n' });
    try {
      const { status, out } = await judge(made);
      assert.equal(status, 0, out);
      assert.match(out, /^Ready:/m);
    } finally {
      rmSync(made.dir, { recursive: true, force: true });
    }
  });

  it('still refuses a line slipped into a released version, in the same changelog', async () => {
    const made = repository(big(), big().replace('## 1.0.0\n\n', '## 1.0.0\n\n- A line slipped into a released version.\n'), { 'changes/1.added.md': '**Something new.** It was added (#1).\n' });
    try {
      const { status, out } = await judge(made);
      assert.equal(status, 1, out);
      assert.match(out, /line\(s\) added inside `## 1\.0\.0`/);
    } finally {
      rmSync(made.dir, { recursive: true, force: true });
    }
  });

  it('reads a changelog the base did not have as an empty one', async () => {
    const made = repository(null, '# Changelog\n\n## Unreleased\n\nNo changes yet.\n', { 'changes/1.added.md': '**The first line.** It was added (#1).\n' });
    try {
      const { status, out } = await judge(made);
      assert.equal(status, 0, out);
    } finally {
      rmSync(made.dir, { recursive: true, force: true });
    }
  });

  it('tells a file the commit does not have from a file it could not read', () => {
    const missing = () => { throw Object.assign(new Error('Command failed'), { status: 128, stderr: "fatal: path 'CHANGELOG.md' does not exist in 'abc1234'\n" }); };
    assert.equal(fileAt('abc1234', 'CHANGELOG.md', missing), '');
    const onDisk = () => { throw Object.assign(new Error('Command failed'), { status: 128, stderr: "fatal: path 'CHANGELOG.md' exists on disk, but not in 'abc1234'\n" }); };
    assert.equal(fileAt('abc1234', 'CHANGELOG.md', onDisk), '');
    const tooLarge = () => { throw Object.assign(new Error('spawnSync git ENOBUFS'), { code: 'ENOBUFS', stderr: '' }); };
    assert.throws(() => fileAt('abc1234', 'CHANGELOG.md', tooLarge), /CHANGELOG\.md could not be read at abc1234 \(ENOBUFS\); refusing to judge without it\./);
    const corrupt = () => { throw Object.assign(new Error('Command failed'), { status: 128, stderr: 'fatal: bad object abc1234\n' }); };
    assert.throws(() => fileAt('abc1234', 'CHANGELOG.md', corrupt), /could not be read at abc1234 \(fatal: bad object abc1234\)/);
  });
});

describe('its changelog entry is a file in changes/, and CHANGELOG.md gains no entry', () => {
  it('a change file, and no edit to CHANGELOG.md, is ready', () => {
    assert.deepEqual(ready().problems, []);
    assert.deepEqual(ready({ added: ['changes/639-2.changed.md'] }).problems, []);
    assert.deepEqual(ready({ added: ['changes/session-hook.fixed.md'] }).problems, []);
  });

  it('a pull request that adds no change file is refused, and told where it goes', () => {
    const { problems } = ready({ added: [] });
    assert.equal(problems.length, 1, problems.join('\n'));
    assert.match(problems[0], /Add the changelog entry as a file in `changes\/`, named <issue>\.<kind>\.md/);
    // The folder's README is not an entry.
    assert.match(ready({ added: ['changes/README.md'] }).problems[0], /Add the changelog entry as a file in `changes\/`/);
  });

  it('a file in changes/ that is not named as one is refused by name', () => {
    for (const path of ['changes/639.md', 'changes/639.improved.md', 'changes/Fix-it.added.md', 'changes/notes/639.added.md']) {
      const { problems } = ready({ added: [FRAGMENT, path] });
      assert.equal(problems.length, 1, `${path}: ${problems.join('\n')}`);
      assert.ok(problems[0].startsWith(`${path}: `), problems[0]);
    }
  });

  it('a line written under Unreleased, where entries went until #847, is refused and pointed at changes/', () => {
    const changes = changelogChanges(RELEASED, WITH_ENTRY);
    assert.deepEqual(changes.underUnreleased, ['### Fixed', ENTRY]);
    const { problems } = ready({ changelogAfter: WITH_ENTRY });
    assert.equal(problems.length, 1, problems.join('\n'));
    assert.match(problems[0], /2 line\(s\) added under `## Unreleased`\. Put the entry in a file in `changes\/` instead/);
  });

  it('the 2.7.9 misplacement is still refused: a line inside a released version', () => {
    const after = RELEASED.replace(
      '## 2.7.9 — 2026-11-17\n\n### Added\n\n',
      `## 2.7.9 — 2026-11-17\n\n### Added\n\n${ENTRY}\n\n`,
    );
    const { problems } = ready({ changelogAfter: after });
    assert.equal(problems.length, 1, problems.join('\n'));
    assert.match(problems[0], /inside `## 2\.7\.9`, a released version/);
  });

  it('a maintainer correcting a released entry labels it changelog-history, and still adds a change file', () => {
    const after = RELEASED.replace('Flash-Lite are priced.**', 'Flash-Lite are priced, at last.**');
    assert.deepEqual(ready({ changelogAfter: after, labels: ['changelog-history'] }).problems, []);
    assert.match(ready({ changelogAfter: after }).problems[0], /inside `## 2\.7\.9`/);
    assert.match(ready({ changelogAfter: after, labels: ['changelog-history'], added: [] }).problems[0], /Add the changelog entry/);
  });

  it('neither "No changes yet." nor the pointer to changes/ is a line the pull request added', () => {
    const before = RELEASED.replace('No changes yet.\n', '');
    assert.deepEqual(changelogChanges(before, RELEASED).underUnreleased, []);
    assert.deepEqual(changelogChanges(before, RELEASED.replace('No changes yet.', POINTER)).underUnreleased, []);
  });

  it('a release pull request, which adds a version heading and deletes the change files, is exempt', () => {
    const after = RELEASED.replace('## 2.7.10', `## 2.7.11 — 2026-11-18\n\n### Fixed\n\n${ENTRY}\n\n## 2.7.10`);
    const changes = changelogChanges(RELEASED, after);
    assert.equal(changes.release, true);
    assert.deepEqual(ready({ changelogAfter: after, labels: ['no-issue'], added: [] }).problems, []);
  });

  it('Dependabot is not asked for a change file', () => {
    assert.deepEqual(ready({ body: '', author: 'dependabot[bot]', added: [] }).problems, []);
  });

  it('counts a repeated line once for each time it is added', () => {
    assert.deepEqual(addedLines(['- a', ''], ['- a', '- a', '']), ['- a']);
  });
});

describe('the workflow and the rules agree', () => {
  const workflow = readFileSync(join(ROOT, '.github/workflows/pr-readiness.yml'), 'utf8');
  const ruleset = JSON.parse(readFileSync(join(ROOT, '.github/rulesets/main-branch.json'), 'utf8'));
  const labels = JSON.parse(readFileSync(join(ROOT, '.github/labels.json'), 'utf8')).map((l) => l.name);

  const required = ruleset.rules
    .find((rule) => rule.type === 'required_status_checks')
    .parameters.required_status_checks.map((check) => check.context);

  it('the job is named as the ruleset requires it', () => {
    assert.ok(required.includes('PR readiness'));
    assert.match(workflow, /^ {4}name: PR readiness$/m);
  });

  it('the sign-off and the CLA are required too, each under the name its job reports', () => {
    // Both ran on every pull request and neither was required, so a pull
    // request with an unsigned commit, or from somebody who had not signed,
    // could be merged by a click made in a hurry (#718).
    const dco = readFileSync(join(ROOT, '.github/workflows/dco.yml'), 'utf8');
    const [, signOff] = dco.match(/^ {4}name: (.+)$/m) ?? [];
    assert.equal(signOff, 'Signed-off-by on every commit');
    assert.ok(required.includes(signOff), 'the sign-off check is not required');
    // A job with no name reports under its key.
    const cla = readFileSync(join(ROOT, '.github/workflows/cla.yml'), 'utf8');
    assert.match(cla, /^jobs:\n {2}cla:\n {4}runs-on:/m);
    assert.ok(required.includes('cla'), 'the CLA check is not required');
  });

  it('a required check runs on every pull request, or it would block the ones it skips', () => {
    // A workflow filtered by path reports nothing on a pull request outside
    // its paths, and a required check that reports nothing never turns green.
    const dco = readFileSync(join(ROOT, '.github/workflows/dco.yml'), 'utf8');
    const cla = readFileSync(join(ROOT, '.github/workflows/cla.yml'), 'utf8');
    for (const [name, text] of [['dco.yml', dco], ['cla.yml', cla], ['pr-readiness.yml', workflow]]) {
      const triggers = text.slice(text.indexOf('\non:\n'), text.indexOf('\npermissions:'));
      assert.match(triggers, /pull_request(?:_target)?:/, name);
      assert.doesNotMatch(triggers, /paths(?:-ignore)?:|branches(?:-ignore)?:/, `${name} does not run on every pull request`);
    }
    // And each lets Dependabot through, whose pull requests carry no CLA and no issue.
    assert.match(cla, /allowlist: '[^']*dependabot\[bot\]/);
  });

  it('the job can read the issue it is asked about, and can write nothing', () => {
    const [, permissions] = workflow.match(/^ {4}permissions:\n((?: {6}(?:#.*|[a-z-]+: [a-z]+)\n)+)/m) ?? [];
    assert.ok(permissions, 'the job states no permissions of its own');
    const granted = permissions.split('\n').map((line) => line.trim()).filter((line) => line !== '' && !line.startsWith('#'));
    assert.deepEqual(granted, ['contents: read', 'issues: read', 'pull-requests: read']);
    assert.doesNotMatch(workflow, /: write\b/);
    assert.match(workflow, /GH_TOKEN: \$\{\{ github\.token \}\}/);
    assert.doesNotMatch(workflow, /secrets\./);
  });

  it('the description reaches the script through the environment, never inline', () => {
    // A body interpolated into `run:` is a script injection; through `env:` it is data.
    assert.match(workflow, /PR_BODY: \$\{\{ github\.event\.pull_request\.body \}\}/);
    const runs = [...workflow.matchAll(/^\s+run: (.*)$/gm)].map((match) => match[1]);
    assert.deepEqual(runs, ['node scripts/pr-readiness.mjs'], 'one single-line run step, with no expression in it');
  });

  it('lets a run in progress finish, so a quick edit does not leave a cancelled required check', () => {
    // #699: the description was edited seconds after the pull request opened,
    // the second run cancelled the first, and the guide comment reported
    // `PR readiness` as failing. One group for each pull request keeps the
    // runs in order, so the last word is still the newest description's.
    assert.match(workflow, /^concurrency:\n {2}group: pr-readiness-\$\{\{ github\.event\.pull_request\.number \}\}\n {2}cancel-in-progress: false$/m);
    assert.doesNotMatch(workflow, /cancel-in-progress: true/);
  });

  it('every exemption label exists', () => {
    for (const label of ['no-issue', 'changelog-history']) assert.ok(labels.includes(label), label);
  });

  it('squash is the only merge method, as linear history already forces', () => {
    const pr = ruleset.rules.find((rule) => rule.type === 'pull_request');
    assert.deepEqual(pr.parameters.allowed_merge_methods, ['squash']);
    assert.ok(ruleset.rules.some((rule) => rule.type === 'required_linear_history'));
  });
});

describe('what the documents tell a contributor is what the check and the ruleset do', () => {
  const read = (path) => readFileSync(join(ROOT, path), 'utf8');
  const contributing = read('CONTRIBUTING.md');
  /** One `###` section of the contributing guide, ending at the next heading of any depth. */
  const part = (title) => {
    const found = contributing.split(/\n(?=#{2,3} )/).find((piece) => piece.startsWith(`### ${title}\n`));
    assert.ok(found, `CONTRIBUTING.md has no "### ${title}" section any more`);
    return found;
  };
  const required = JSON.parse(read('.github/rulesets/main-branch.json'))
    .rules.find((rule) => rule.type === 'required_status_checks')
    .parameters.required_status_checks.map((check) => check.context);

  it('the guide lists every required check, and none that is not required', () => {
    // The sentence that lists them ends by naming the file they are listed in.
    const [, sentence] = part('How a pull request lands').match(/^- \*\*Required checks:\*\*([^.]+?),\s+listed in\s+`\.github\/rulesets\/main-branch\.json`\./m) ?? [];
    assert.ok(sentence, 'the "Required checks:" sentence is gone, or no longer names the ruleset file');
    const named = [...sentence.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
    // The two self-test jobs are one name in the guide: "both `GitHub Action self-test` jobs".
    const contexts = [...new Set(required.map((context) => context.replace(/ \(.*\)$/, '')))];
    assert.deepEqual([...named].sort(), [...contexts].sort());
  });

  it('"Issue first" says the issue has to be accepted, by the label the check reads', () => {
    const section = part('Issue first');
    assert.match(section, new RegExp(`unless it carries \`${ACCEPTED}\``));
    assert.match(section, /cannot read is not taken as accepted/);
  });

  it('the guide says what a pull request from outside is read for', () => {
    const section = part('Work from somebody outside');
    for (const phrase of ['The maintainer assigns it', '`.github/` and `scripts/`', 'necessary and not sufficient', 'do not run until the maintainer approves them']) {
      assert.ok(section.includes(phrase), `"${phrase}" is gone from "Work from somebody outside"`);
    }
  });

  it('the template and the review rule say it where a contributor and a reviewer look', () => {
    assert.match(read('.github/PULL_REQUEST_TEMPLATE.md'), /label it `accepted`/);
    const rule = read('.claude/skills/trazum-review/SKILL.md').split('\n### ').find((piece) => piece.startsWith('`issue-and-changelog`'));
    assert.ok(rule, 'the review skill has no issue-and-changelog rule any more');
    assert.match(rule, /\*\*Check:\*\*.*that issue carries `accepted`/);
  });

  it('an agent is told what it may not do with somebody else\'s work', () => {
    // It happened: on 2026-11-18 an agent answered a volunteer and assigned
    // them an issue before the owner had looked at who they were (#718).
    const section = sectionOf(read('AGENTS.md'), "## Other people's work");
    const [, forbidden] = section.match(/Do not (assign[^.]+) unless the owner has said so for that case\./s) ?? [];
    assert.ok(forbidden, 'the sentence that says what an agent does not decide is gone');
    for (const act of ['assign an issue', 'label one\n  `accepted`', 'approve', 'merge', 'close or reopen']) {
      assert.ok(forbidden.includes(act), `"${act}" is no longer on the list`);
    }
    assert.match(section, /Do not post a comment or a review\./);
    assert.match(section, /covers your own pull requests\. It does not cover theirs\./);
    assert.match(section, /Read the diff, `\.github\/` and\s+`scripts\/` first/);
  });
});
