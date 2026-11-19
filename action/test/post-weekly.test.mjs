import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { postWeekly } from '../post-weekly.mjs';

/**
 * The weekly-summary poster (#757), driven in-process against a stand-in for
 * the GitHub API: a Map of issues and of comments that records every request.
 * No socket, for the reason `post-comment.test.mjs` gives, and nothing here
 * ever reaches the real API.
 *
 * What is held: the summary lands in the one place the owner named and in no
 * other, a week is posted once however many times the run happens, a
 * contributor's own issue is never edited, and every way of declining ends in a
 * notice rather than an error.
 */

const MARKER = '<!-- trazum-weekly:2026-11-19 -->';
const REPORT = `## Trazum, the week of 2026-11-13 to 2026-11-19\n\n**$12.00** over 6 calls.\n\n${MARKER}\n`;

function fakeGitHub({ issues = [], comments = [], failWith = null, failWriteWith = null, throwWith = null } = {}) {
  const issueStore = new Map(issues.map((i) => [i.number, i]));
  const commentStore = new Map(comments.map((c) => [c.id, c]));
  const requests = [];
  let nextIssue = Math.max(100, ...issueStore.keys()) + 1;
  let nextComment = Math.max(1000, ...commentStore.keys()) + 1;
  const json = (status, value) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => value,
    text: async () => JSON.stringify(value),
  });
  const fetchImpl = async (url, init = {}) => {
    const method = init.method ?? 'GET';
    requests.push({ method, url, body: init.body ?? '', headers: init.headers ?? {} });
    if (throwWith) throw new Error(throwWith);
    if (failWith) return json(failWith, { message: 'refused' });
    if (failWriteWith && method !== 'GET') return json(failWriteWith, { message: 'refused' });
    const { pathname, searchParams } = new URL(url);
    const page = Number(searchParams.get('page') ?? '1');
    if (method === 'GET' && pathname.endsWith('/issues')) return json(200, page === 1 ? [...issueStore.values()] : []);
    if (method === 'GET' && /\/issues\/\d+\/comments$/.test(pathname)) return json(200, page === 1 ? [...commentStore.values()] : []);
    if (method === 'POST' && pathname.endsWith('/issues')) {
      const number = nextIssue++;
      issueStore.set(number, { number, ...JSON.parse(init.body), user: { type: 'Bot' } });
      return json(201, { number });
    }
    if (method === 'POST' && /\/issues\/\d+\/comments$/.test(pathname)) {
      const id = nextComment++;
      commentStore.set(id, { id, ...JSON.parse(init.body), user: { type: 'Bot' } });
      return json(201, { id });
    }
    if (method === 'PATCH' && /\/issues\/comments\/\d+$/.test(pathname)) {
      const id = Number(pathname.split('/').pop());
      commentStore.set(id, { ...commentStore.get(id), ...JSON.parse(init.body) });
      return json(200, { id });
    }
    if (method === 'PATCH' && /\/issues\/\d+$/.test(pathname)) {
      const number = Number(pathname.split('/').pop());
      issueStore.set(number, { ...issueStore.get(number), ...JSON.parse(init.body) });
      return json(200, { number });
    }
    return json(404, {});
  };
  return { fetchImpl, requests, issues: issueStore, comments: commentStore };
}

async function run({ github = fakeGitHub(), env = {}, report = REPORT } = {}) {
  const lines = [];
  const result = await postWeekly({
    env: {
      GITHUB_API_URL: 'https://api.example',
      GITHUB_REPOSITORY: 'owner/repo',
      TRAZUM_GITHUB_TOKEN: 'tok',
      TRAZUM_BODY_PATH: '/report.md',
      TRAZUM_SUMMARY_TARGET: 'issue',
      ...env,
    },
    fetchImpl: github.fetchImpl,
    readFileImpl: async (path) => {
      if (path === '/report.md') return report;
      throw new Error(`ENOENT: ${path}`);
    },
    log: (line) => lines.push(line),
  });
  return { result, lines, github };
}

const writes = (github) => github.requests.filter((r) => r.method !== 'GET');

describe('weekly-summary: issue', () => {
  it('opens one issue titled for the week, in the runner\'s own repository', async () => {
    const { result, github } = await run();
    assert.deepEqual(result, { action: 'created' });
    assert.equal(github.issues.size, 1);
    const [issue] = [...github.issues.values()];
    assert.match(issue.title, /2026-11-13 to 2026-11-19/);
    assert.ok(issue.body.includes(MARKER));
    for (const request of github.requests) {
      assert.ok(request.url.startsWith('https://api.example/repos/owner/repo/issues'), `a request left the repository: ${request.url}`);
    }
    assert.deepEqual(Object.keys(JSON.parse(writes(github)[0].body)).sort(), ['body', 'title'], 'it set something the owner did not ask for: a label, an assignee');
  });

  it('opens it once however many times the week is run', async () => {
    const github = fakeGitHub();
    await run({ github });
    const again = await run({ github });
    assert.deepEqual(again.result, { action: 'updated' });
    assert.equal(github.issues.size, 1, 'a second issue was opened for the same week');
  });

  it('opens another for another week', async () => {
    const github = fakeGitHub();
    await run({ github });
    await run({ github, report: REPORT.replaceAll('2026-11-19', '2026-11-26') });
    assert.equal(github.issues.size, 2);
  });

  it('never edits an issue a person wrote, however it was made to look', async () => {
    const squat = { number: 7, title: 'mine', body: `hello ${MARKER}`, user: { type: 'User' } };
    const github = fakeGitHub({ issues: [squat] });
    const { result } = await run({ github });
    assert.deepEqual(result, { action: 'created' });
    assert.equal(github.issues.get(7).body, `hello ${MARKER}`, 'a contributor\'s issue was overwritten');
  });

  it('does not take a pull request for its own post', async () => {
    const pr = { number: 8, body: MARKER, user: { type: 'Bot' }, pull_request: {} };
    const github = fakeGitHub({ issues: [pr] });
    assert.deepEqual((await run({ github })).result, { action: 'created' });
  });
});

describe('weekly-summary: comment', () => {
  const env = { TRAZUM_SUMMARY_TARGET: 'comment', TRAZUM_SUMMARY_ISSUE: '42' };

  it('comments on the standing issue the owner named and on no other', async () => {
    const { result, github } = await run({ env });
    assert.deepEqual(result, { action: 'created' });
    assert.equal(github.comments.size, 1);
    assert.equal(github.issues.size, 0, 'it opened an issue when it was told to comment');
    for (const request of github.requests) {
      assert.ok(request.url.startsWith('https://api.example/repos/owner/repo/issues/42/comments'), `it wrote somewhere else: ${request.url}`);
    }
  });

  it('comments once a week however many times it runs', async () => {
    const github = fakeGitHub();
    await run({ github, env });
    const again = await run({ github, env });
    assert.deepEqual(again.result, { action: 'updated' });
    assert.equal(github.comments.size, 1);
    await run({ github, env, report: REPORT.replaceAll('2026-11-19', '2026-11-26') });
    assert.equal(github.comments.size, 2, 'a new week did not get its own comment');
  });

  it('posts nothing without the number of an issue, or with something that is not one', async () => {
    for (const value of [undefined, '', '0', '-3', '4/../5', 'abc']) {
      const { result, github } = await run({ env: { TRAZUM_SUMMARY_TARGET: 'comment', TRAZUM_SUMMARY_ISSUE: value } });
      assert.equal(result.detail, 'no-standing-issue', String(value));
      assert.equal(github.requests.length, 0, `a request was made for "${value}"`);
    }
  });
});

describe('every other way it declines', () => {
  it('posts to no place the owner did not name', async () => {
    for (const target of [undefined, '', 'discussion', 'ISSUE', 'pr']) {
      const { result, github } = await run({ env: { TRAZUM_SUMMARY_TARGET: target } });
      assert.equal(result.detail, 'unknown-target', String(target));
      assert.equal(github.requests.length, 0);
    }
  });

  it('posts nothing that is not a weekly summary', async () => {
    const { result, github } = await run({ report: '### Trazum\n\nAll good.\n' });
    assert.equal(result.detail, 'not-a-weekly-summary');
    assert.equal(github.requests.length, 0);
  });

  it('says so when there is no token, and when the token is read-only', async () => {
    const none = await run({ env: { TRAZUM_GITHUB_TOKEN: '' } });
    assert.equal(none.result.detail, 'no-token');
    assert.equal(none.github.requests.length, 0);
    const refused = await run({ github: fakeGitHub({ failWriteWith: 403 }) });
    assert.equal(refused.result.detail, 'token-refused');
    assert.match(refused.lines.join('\n'), /issues: write/);
  });

  it('does not write when it could not look, so as not to post twice', async () => {
    const { result, github } = await run({ github: fakeGitHub({ failWith: 500 }) });
    assert.equal(result.detail, 'list-500');
    assert.equal(writes(github).length, 0);
  });

  it('ends in a notice when the API is unreachable', async () => {
    const { result } = await run({ github: fakeGitHub({ throwWith: 'ECONNRESET' }) });
    assert.equal(result.detail, 'api-unreachable');
  });

  it('keeps the marker when it has to cut a very long summary', async () => {
    const { github } = await run({ report: `## T\n\n${'x'.repeat(70_000)}\n\n${MARKER}\n` });
    const [issue] = [...github.issues.values()];
    assert.ok(issue.body.length <= 65_000);
    assert.ok(issue.body.includes(MARKER), 'the next run could not find this post');
  });
});

describe('what action.yml lets the weekly summary do', () => {
  const yaml = readFileSync(new URL('../../action.yml', import.meta.url), 'utf8');
  const steps = yaml.split(/\n {4}- name: /).slice(1);
  const post = steps.find((step) => step.startsWith('Post the weekly summary'));
  const check = steps.find((step) => step.startsWith('Check the budget'));

  it('posts only when the owner chose one of the two places, and only after a summary was written', () => {
    assert.ok(post, 'the posting step is gone');
    const condition = /^ {6}if: (.*)$/m.exec(post)?.[1] ?? '';
    assert.match(condition, /inputs\.weekly-summary == 'issue'/);
    assert.match(condition, /inputs\.weekly-summary == 'comment'/);
    assert.match(condition, /steps\.check\.outputs\.outcome == '0'/, 'it would post a summary that was never written');
    assert.equal((condition.match(/inputs\.weekly-summary ==/g) ?? []).length, 2, 'a third place was added');
  });

  it('hands the token to the one script that posts, and not to the step that runs the CLI', () => {
    assert.match(post, /TRAZUM_GITHUB_TOKEN: \$\{\{ inputs\.github-token \}\}/);
    assert.doesNotMatch(check, /github-token|GITHUB_TOKEN/, 'the CLI step can read the token');
  });

  it('keeps the weekly run apart from the target and from every gate', () => {
    const branch = check.slice(check.indexOf('TRAZUM_WEEKLY_SUMMARY" ]'), check.indexOf('args=(weekly'));
    assert.ok(branch.length > 200, 'could not find the weekly branch');
    assert.match(branch, /\[ -z "\$TRAZUM_USAGE_LOG" \] \|\| \[ -n "\$target" \]/, 'it no longer refuses a target');
    for (const gate of ['MAX_USD', 'AGAINST', 'MAX_GROWTH_USD', 'MAX_CACHE_LOSS_USD', 'SINCE']) {
      assert.ok(branch.includes(`$TRAZUM_${gate}`), `a run with weekly-summary and ${gate} is not refused`);
    }
  });
});
