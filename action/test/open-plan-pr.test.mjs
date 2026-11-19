import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { BUNDLED_CATALOGUE, optimize, planFileEdit, profileUsage } from '../../packages/core/dist/index.js';
import { BRANCH_PREFIX, openPlanPullRequest } from '../open-plan-pr.mjs';

/**
 * The plan's pull request (#796), driven in-process against a stand-in for
 * the GitHub API: a small in-memory git (blobs, trees, commits, refs) and a
 * list of pull requests, recording every request. No socket, and nothing here
 * reaches the real API.
 *
 * What is held: the branch carries exactly the plan's edits, each the text
 * the safe rules make of the default branch's file; nothing is created when
 * there is nothing to change; a plan gets one pull request however many times
 * it runs; and nothing is pushed to the default branch, merged, or sent to
 * another repository.
 */

const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');
const sha1 = (value) => createHash('sha1').update(JSON.stringify(value)).digest('hex');
const PROMPT = readFileSync(new URL('../../examples/support-prompt.txt', import.meta.url), 'utf8');
const OTHER = 'You summarise the ticket below in one line.\n\n{{ticket}}\n';

/** An in-memory repository the way the Git Data API shows one. */
function fakeGitHub({ files = { 'prompts/support.txt': PROMPT, 'prompts/other.txt': OTHER, 'README.md': '# app\n' }, modes = {}, pulls = [], failWith = null } = {}) {
  const objects = new Map();
  const put = (object) => {
    const sha = sha1(object);
    objects.set(sha, object);
    return sha;
  };
  const writeTree = (entries) => put({ type: 'tree', entries: [...entries].sort((a, b) => a.path.localeCompare(b.path)) });
  /** Builds the nested trees for a flat path → {content, mode} map. */
  const buildTree = (flat) => {
    const here = new Map();
    const below = new Map();
    for (const [path, file] of Object.entries(flat)) {
      const [head, ...rest] = path.split('/');
      if (rest.length === 0) here.set(head, file);
      else below.set(head, { ...(below.get(head) ?? {}), [rest.join('/')]: file });
    }
    const entries = [];
    for (const [name, file] of here) entries.push({ path: name, mode: file.mode, type: 'blob', sha: put({ type: 'blob', content: file.content }) });
    for (const [name, sub] of below) entries.push({ path: name, mode: '040000', type: 'tree', sha: buildTree(sub) });
    return writeTree(entries);
  };
  /** The flat path → content map a tree holds. */
  const flatten = (treeSha, prefix = '') => {
    const out = {};
    for (const entry of objects.get(treeSha).entries) {
      const path = `${prefix}${entry.path}`;
      if (entry.type === 'tree') Object.assign(out, flatten(entry.sha, `${path}/`));
      else out[path] = { content: objects.get(entry.sha).content, mode: entry.mode };
    }
    return out;
  };
  const initial = Object.fromEntries(Object.entries(files).map(([path, content]) => [path, { content, mode: modes[path] ?? '100644' }]));
  const baseTree = buildTree(initial);
  const baseCommit = put({ type: 'commit', tree: baseTree, parents: [], message: 'init' });
  const refs = new Map([['heads/main', baseCommit]]);
  const pullStore = [...pulls];
  const requests = [];

  const json = (status, value) => ({ ok: status >= 200 && status < 300, status, json: async () => value, text: async () => JSON.stringify(value) });
  const fetchImpl = async (url, init = {}) => {
    const method = init.method ?? 'GET';
    const payload = init.body ? JSON.parse(init.body) : null;
    requests.push({ method, url, payload });
    if (failWith) return json(failWith, { message: 'refused' });
    const { pathname, searchParams } = new URL(url);
    const prefix = '/repos/owner/repo';
    if (!pathname.startsWith(prefix)) return json(404, {});
    const rest = pathname.slice(prefix.length);
    if (method === 'GET' && rest === '') return json(200, { default_branch: 'main' });
    if (method === 'GET' && rest === '/pulls') {
      const head = searchParams.get('head');
      return json(200, pullStore.filter((pr) => `owner:${pr.head.ref}` === head));
    }
    if (method === 'GET' && rest.startsWith('/git/ref/')) {
      const ref = decodeURIComponent(rest.slice('/git/ref/'.length));
      return refs.has(ref) ? json(200, { ref: `refs/${ref}`, object: { sha: refs.get(ref) } }) : json(404, {});
    }
    if (method === 'GET' && rest.startsWith('/git/commits/')) {
      const commit = objects.get(rest.split('/').pop());
      return commit ? json(200, { sha: rest.split('/').pop(), tree: { sha: commit.tree } }) : json(404, {});
    }
    if (method === 'GET' && rest.startsWith('/git/trees/')) {
      const tree = objects.get(rest.split('/').pop());
      return tree ? json(200, { tree: tree.entries }) : json(404, {});
    }
    if (method === 'GET' && rest.startsWith('/git/blobs/')) {
      const blob = objects.get(rest.split('/').pop());
      return blob ? json(200, { content: Buffer.from(blob.content).toString('base64'), encoding: 'base64' }) : json(404, {});
    }
    if (method === 'POST' && rest === '/git/trees') {
      const flat = flatten(payload.base_tree);
      for (const entry of payload.tree) flat[entry.path] = { content: entry.content, mode: entry.mode };
      return json(201, { sha: buildTree(flat) });
    }
    if (method === 'POST' && rest === '/git/commits') {
      return json(201, { sha: put({ type: 'commit', tree: payload.tree, parents: payload.parents, message: payload.message }) });
    }
    if (method === 'POST' && rest === '/git/refs') {
      const ref = payload.ref.replace(/^refs\//, '');
      if (refs.has(ref)) return json(422, { message: 'Reference already exists' });
      refs.set(ref, payload.sha);
      return json(201, { ref: payload.ref });
    }
    if (method === 'POST' && rest === '/pulls') {
      const pr = { number: 100 + pullStore.length, state: 'open', head: { ref: payload.head }, base: { ref: payload.base }, title: payload.title, body: payload.body };
      pullStore.push(pr);
      return json(201, pr);
    }
    return json(404, {});
  };
  const filesAt = (ref) => flatten(objects.get(refs.get(ref)).tree);
  return { fetchImpl, requests, pulls: pullStore, refs, filesAt, base: () => filesAt('heads/main') };
}

const usage = profileUsage(
  ['support', 'other']
    .flatMap((label) => [1, 2, 3].map((day) => JSON.stringify({ model: 'claude-opus-5', label, ts: `2026-08-0${day}T09:00:00Z`, usage: { input_tokens: 2000, output_tokens: 100 } })))
    .join('\n'),
  { catalogue: BUNDLED_CATALOGUE, on: new Date('2026-08-16T00:00:00Z') },
);

const editFor = (label, path, text) =>
  planFileEdit({ report: usage, label, path, text, steps: ['trim'], disabledRules: [], pricing: BUNDLED_CATALOGUE, digest: sha256 });

const planOf = (actions, createdAt = '2026-11-19T09:00:00.000Z') => ({
  schemaVersion: 1,
  span: null,
  pricingLastReviewed: BUNDLED_CATALOGUE.lastReviewed,
  actions,
  projectedSavingUsd: 0,
  measuredStakeUsd: 0,
  totalUsd: 0.075,
  batchExcludedUsd: 0,
  createdAt,
});

const SUPPORT = editFor('support', 'prompts/support.txt', PROMPT);
const BODY = '## The plan\n\n### Edit the prompt file of support\n- prompts/support.txt: trimmed by the safe rules\n';

async function run({ github = fakeGitHub(), plan = planOf([SUPPORT]), body = BODY, env = {} } = {}) {
  const lines = [];
  const result = await openPlanPullRequest({
    env: {
      GITHUB_API_URL: 'https://api.example',
      GITHUB_REPOSITORY: 'owner/repo',
      TRAZUM_GITHUB_TOKEN: 'tok',
      TRAZUM_PLAN_PATH: '/plan.json',
      TRAZUM_BODY_PATH: '/plan.md',
      ...env,
    },
    fetchImpl: github.fetchImpl,
    readFileImpl: async (path) => {
      if (path === '/plan.json') return JSON.stringify(plan);
      if (path === '/plan.md') return body;
      throw new Error(`ENOENT: ${path}`);
    },
    log: (line) => lines.push(line),
  });
  return { result, lines, github };
}

const writes = (github) => github.requests.filter((r) => r.method !== 'GET');

describe('the plan\'s pull request: what the branch carries', () => {
  it('opens one pull request whose branch changes exactly the plan\'s files, to the promised text', async () => {
    const { result, github } = await run();
    assert.equal(result.action, 'created');
    assert.equal(github.pulls.length, 1);
    const [pr] = github.pulls;
    assert.equal(pr.base.ref, 'main');
    assert.ok(pr.head.ref.startsWith(BRANCH_PREFIX));
    assert.ok(pr.body.startsWith(BODY.trimEnd()), 'the body is not the plan');

    const before = github.base();
    const after = github.filesAt(`heads/${pr.head.ref}`);
    const changed = Object.keys(after).filter((path) => before[path]?.content !== after[path].content || before[path]?.mode !== after[path].mode);
    assert.deepEqual(changed, ['prompts/support.txt'], 'the branch changed a file the plan did not list');
    assert.deepEqual(Object.keys(after).sort(), Object.keys(before).sort(), 'the branch added or removed a file');
    assert.equal(sha256(after['prompts/support.txt'].content), SUPPORT.detail.edit.afterSha256, 'the edit is not the one the plan promised');
    assert.equal(after['prompts/support.txt'].content, optimize(PROMPT, { level: 'safe' }).optimized);
  });

  it('sends the plan\'s files and no others to the tree it writes', async () => {
    const { github } = await run();
    const trees = writes(github).filter((r) => r.url.endsWith('/git/trees'));
    assert.equal(trees.length, 1);
    assert.deepEqual(trees[0].payload.tree.map((entry) => entry.path), ['prompts/support.txt']);
  });

  it('keeps a file\'s mode', async () => {
    const github = fakeGitHub({ modes: { 'prompts/support.txt': '100755' } });
    const { github: after } = await run({ github });
    assert.equal(after.filesAt(`heads/${after.pulls[0].head.ref}`)['prompts/support.txt'].mode, '100755');
  });

  it('refuses the whole pull request when one file moved on since the plan', async () => {
    const github = fakeGitHub({ files: { 'prompts/support.txt': `${PROMPT}more\n`, 'prompts/other.txt': OTHER } });
    const { result } = await run({ github });
    assert.equal(result.detail, 'not-the-planned-file');
    assert.deepEqual(writes(github), [], 'something was written for a plan made against another file');
  });

  it('refuses a plan whose Markdown does not name the files it edits', async () => {
    const github = fakeGitHub();
    const { result } = await run({ github, body: '## A check report\n' });
    assert.equal(result.detail, 'body-not-the-plan');
    assert.deepEqual(writes(github), []);
  });
});

describe('the plan\'s pull request: never one with no change', () => {
  it('opens nothing for a plan with no edit', async () => {
    const github = fakeGitHub();
    const { result } = await run({ github, plan: planOf([]) });
    assert.equal(result.detail, 'no-edits');
    assert.deepEqual(writes(github), [], 'a plan with no edit created something');
  });

  it('opens nothing when every edit is already on the default branch', async () => {
    const github = fakeGitHub({ files: { 'prompts/support.txt': optimize(PROMPT, { level: 'safe' }).optimized } });
    const { result } = await run({ github });
    assert.equal(result.detail, 'no-change');
    assert.deepEqual(writes(github), [], 'a pull request with no change was started');
    assert.equal(github.pulls.length, 0);
  });

  it('commits only the edits still to make when some are already made', async () => {
    const otherText = `${OTHER}Please kindly answer.\n`;
    const otherEdit = editFor('other', 'prompts/other.txt', otherText);
    assert.ok(otherEdit, 'the fixture needs a second edit');
    // The second file already holds its promised text on main.
    const github = fakeGitHub({ files: { 'prompts/support.txt': PROMPT, 'prompts/other.txt': optimize(otherText, { level: 'safe' }).optimized } });
    await run({ github, plan: planOf([SUPPORT, otherEdit]), body: `${BODY}- prompts/other.txt\n` });
    const trees = writes(github).filter((r) => r.url.endsWith('/git/trees'));
    assert.deepEqual(trees[0].payload.tree.map((entry) => entry.path), ['prompts/support.txt']);
  });
});

describe('the plan\'s pull request: once per plan', () => {
  it('reuses the open pull request on a second run, and opens no second one', async () => {
    const github = fakeGitHub();
    const first = await run({ github });
    const second = await run({ github });
    assert.equal(first.result.action, 'created');
    assert.deepEqual(second.result, { action: 'reused', number: first.result.number });
    assert.equal(github.pulls.length, 1, 'a second pull request was opened for the same plan');
  });

  it('treats the same edits made into a plan on another day as the same plan', async () => {
    const github = fakeGitHub();
    await run({ github, plan: planOf([SUPPORT], '2026-11-19T09:00:00.000Z') });
    await run({ github, plan: { ...planOf([SUPPORT], '2026-11-26T09:00:00.000Z'), totalUsd: 0.09 } });
    assert.equal(github.pulls.length, 1, 'a plan made again opened a second pull request');
  });

  it('does not open it again once it was closed', async () => {
    const github = fakeGitHub();
    await run({ github });
    github.pulls[0].state = 'closed';
    const again = await run({ github });
    assert.equal(again.result.detail, 'closed-before');
    assert.equal(github.pulls.length, 1);
  });

  it('leaves a branch of that name alone when it has no pull request', async () => {
    const github = fakeGitHub();
    await run({ github });
    github.pulls.length = 0;
    const again = await run({ github });
    assert.equal(again.result.detail, 'branch-exists');
    assert.equal(writes(github).filter((r) => r.url.endsWith('/pulls')).length, 1);
  });
});

describe('the plan\'s pull request: where it writes', () => {
  it('writes only to its own new branch, in the runner\'s repository, and merges nothing', async () => {
    const { github } = await run();
    for (const request of github.requests) {
      assert.ok(request.url.startsWith('https://api.example/repos/owner/repo'), `a request left the repository: ${request.url}`);
      assert.doesNotMatch(request.url, /\/merge/, 'it asked to merge');
      assert.notEqual(request.method, 'PATCH', 'it moved a ref or edited something');
      assert.notEqual(request.method, 'PUT', 'it wrote with PUT');
    }
    const refs = writes(github).filter((r) => r.url.endsWith('/git/refs'));
    assert.equal(refs.length, 1);
    assert.ok(refs[0].payload.ref.startsWith(`refs/heads/${BRANCH_PREFIX}`), `it created ${refs[0].payload.ref}`);
    const pulls = writes(github).filter((r) => r.url.endsWith('/pulls'));
    assert.deepEqual(Object.keys(pulls[0].payload).sort(), ['base', 'body', 'head', 'title'], 'it set something the owner did not ask for');
  });

  it('leaves the default branch where it was', async () => {
    const github = fakeGitHub();
    const tip = github.refs.get('heads/main');
    await run({ github });
    assert.equal(github.refs.get('heads/main'), tip, 'the default branch moved');
  });

  it('declines with a notice when there is no token, or the token is refused', async () => {
    const none = await run({ env: { TRAZUM_GITHUB_TOKEN: '' } });
    assert.equal(none.result.detail, 'no-token');
    assert.deepEqual(none.github.requests, []);
    const refused = await run({ github: fakeGitHub({ failWith: 403 }) });
    assert.equal(refused.result.detail, 'token-refused');
    assert.ok(refused.lines.some((line) => /contents: write/.test(line)));
  });

  it('declines a file that is not a plan', async () => {
    const github = fakeGitHub();
    const lines = [];
    const result = await openPlanPullRequest({
      env: { GITHUB_REPOSITORY: 'owner/repo', TRAZUM_GITHUB_TOKEN: 'tok', TRAZUM_PLAN_PATH: '/p', TRAZUM_BODY_PATH: '/b' },
      fetchImpl: github.fetchImpl,
      readFileImpl: async () => '{"schemaVersion":2}',
      log: (line) => lines.push(line),
    });
    assert.equal(result.detail, 'not-a-plan');
    assert.deepEqual(github.requests, []);
  });
});

describe('the Action gives this step, and only this step, the writing', () => {
  const action = readFileSync(new URL('../../action.yml', import.meta.url), 'utf8');
  const steps = action.slice(action.indexOf('\n  steps:')).split(/\n {4}- name: /).slice(1);

  it('runs the script in one step, only when plan-pull-request is true and the plan was written', () => {
    const running = steps.filter((step) => step.includes('open-plan-pr.mjs'));
    assert.equal(running.length, 1);
    assert.match(running[0], /if: always\(\) && inputs\.plan-pull-request == 'true' && steps\.check\.outputs\.outcome == '0'/);
  });

  it('is the only script that creates a ref, a commit, a tree or a pull request', () => {
    for (const name of ['post-comment.mjs', 'post-weekly.mjs', 'suggest-fixes.mjs']) {
      const source = readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
      assert.doesNotMatch(source, /\/git\/(refs|commits|trees)|\/pulls['`]/, `${name} reaches an endpoint only the plan's step may`);
    }
  });
});
