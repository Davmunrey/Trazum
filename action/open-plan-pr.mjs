#!/usr/bin/env node
/**
 * Opens one pull request that makes a plan's edits, and nothing else (#796).
 *
 * `trazum plan --edits` names an edit to each prompt file the configuration
 * maps a label to: the deterministic steps, the file's hash before and the
 * text's hash after. This script makes those edits on a new branch and opens
 * one pull request whose body is the plan. It is the only step of this Action
 * that writes to a repository, so it is the one a workflow gives
 * `contents: write` and `pull-requests: write`, in a job of its own.
 *
 * What it refuses, in the order it checks:
 *
 * - **Anything but the plan's edits.** The commit's tree is the default
 *   branch's tree with the plan's files replaced, and each new text is made
 *   here by `applyPlanEdit`: the steps, run on the file the default branch
 *   holds, held to the plan's hash before and after. A file that moved on
 *   since the plan, or a rule that now gives other text, refuses the whole
 *   pull request: a body listing a change the branch does not make would be
 *   a plan that lies. The workspace is never read for content and never
 *   written.
 * - **A pull request with no change.** No edit in the plan, or every edit
 *   already on the default branch, and nothing is created: no branch, no
 *   commit, no pull request.
 * - **A second pull request for the same plan.** The branch is named after
 *   the plan's edits (their paths and hashes), and a pull request from it in
 *   any state is looked for first: an open one is reused, a closed or merged
 *   one is the owner's answer and is not asked again. A branch with that name
 *   and no pull request is refused rather than pushed over.
 * - **The default branch, a merge, another repository.** The only ref it
 *   creates is `refs/heads/trazum/plan-<hash>`, created once and never moved;
 *   it calls no merge endpoint; the repository is the runner's own
 *   `GITHUB_REPOSITORY` and the base is that repository's default branch. It
 *   sets no label, reviewer or assignee: those are the owner's decisions.
 *
 * Like the other posting scripts it never fails the build: every refusal is a
 * notice or a warning and an exit 0, because the plan is already in the run
 * summary. It takes its environment, `fetch`, file reader and logger as
 * arguments so the tests drive it against a stand-in for the API, with no
 * socket.
 */

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { applyPlanEdit, parsePlanDocument, planEdits } from '../packages/core/dist/index.js';

/** GitHub rejects a body over 65,536 characters. */
const MAX_BODY = 65_000;

/** The prefix every branch this script creates carries, and the only one it creates. */
export const BRANCH_PREFIX = 'trazum/plan-';

const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

/**
 * What makes two plans the same plan: the edits, by path and both hashes.
 *
 * Not the whole document. A plan made again from the same files on another
 * day differs in `createdAt` and in every figure the newer log moved, and is
 * still the same set of changes to propose.
 */
export function planIdentity(edits) {
  const lines = edits.map((edit) => `${edit.path}\n${edit.beforeSha256}\n${edit.afterSha256}`).sort();
  return sha256(lines.join('\n'));
}

/**
 * @returns {Promise<{action: string, detail?: string, number?: number}>} what
 *   it did, for the tests and the log. Never throws for an expected condition.
 */
export async function openPlanPullRequest({
  env = {},
  fetchImpl = globalThis.fetch,
  readFileImpl = (path) => readFile(path, 'utf8'),
  log = () => {},
} = {}) {
  const notice = (message) => log(`::notice title=Trazum::${message}`);
  const warn = (message) => log(`::warning title=Trazum::${message}`);
  const skipped = (detail) => ({ action: 'skipped', detail });

  const token = env.TRAZUM_GITHUB_TOKEN;
  const repository = env.GITHUB_REPOSITORY;
  const apiBase = env.GITHUB_API_URL || 'https://api.github.com';

  if (!env.TRAZUM_PLAN_PATH || !env.TRAZUM_BODY_PATH) {
    warn('open-plan-pr invoked without a plan or its Markdown; nothing opened.');
    return skipped('no-plan-path');
  }
  if (!token) {
    notice(
      'No token available, so no pull request was opened. The plan is in the run summary. ' +
        'To open one, pass github-token and give this job contents: write and pull-requests: write.',
    );
    return skipped('no-token');
  }
  if (!repository || !/^[\w.-]+\/[\w.-]+$/.test(repository)) {
    warn('GITHUB_REPOSITORY is unset or not owner/name; not running inside GitHub Actions?');
    return skipped('no-repository');
  }

  let planText;
  let body;
  try {
    planText = await readFileImpl(env.TRAZUM_PLAN_PATH);
    body = await readFileImpl(env.TRAZUM_BODY_PATH);
  } catch (error) {
    warn(`Could not read the plan: ${error.message}`);
    return skipped('unreadable-plan');
  }
  const parsed = parsePlanDocument(planText);
  if (!parsed.ok) {
    warn(`The file is not a plan (${parsed.why.kind}); nothing opened.`);
    return skipped('not-a-plan');
  }
  const edits = planEdits(parsed.plan);
  if (edits.length === 0) {
    notice('The plan names no edit to a file, so there is nothing to propose; no pull request opened.');
    return skipped('no-edits');
  }
  // The body is the plan: it has to name every file the branch changes.
  // Anything else, an empty file or a check's report, is not this plan.
  if (edits.some((edit) => !body.includes(edit.path))) {
    warn('The Markdown beside the plan does not name every file the plan edits; nothing opened.');
    return skipped('body-not-the-plan');
  }

  const identity = planIdentity(edits);
  const branch = `${BRANCH_PREFIX}${identity.slice(0, 16)}`;
  const marker = `<!-- trazum-plan:${identity} -->`;
  const owner = repository.split('/')[0];
  const base = `${apiBase}/repos/${repository}`;

  const request = (url, init = {}) =>
    fetchImpl(url, {
      ...init,
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'x-github-api-version': '2022-11-28',
        'user-agent': 'trazum-action',
        ...(init.headers ?? {}),
      },
    });

  /** One call, answered as JSON, or a refusal the caller returns. */
  class Refusal extends Error {
    constructor(result) {
      super(result.detail);
      this.result = result;
    }
  }
  const call = async (what, url, init) => {
    let response;
    try {
      response = await request(url, init);
    } catch (error) {
      warn(`Could not reach the API (${error?.message ?? error}). The plan is in the run summary.`);
      throw new Refusal(skipped('api-unreachable'));
    }
    if (response.status === 401 || response.status === 403) {
      notice(
        `The token cannot ${what} (${response.status}). Opening the plan's pull request needs contents: write ` +
          'and pull-requests: write on this job. The plan is in the run summary.',
      );
      throw new Refusal(skipped('token-refused'));
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      warn(`Could not ${what} (${response.status}). ${detail.slice(0, 200)}`);
      throw new Refusal(skipped(`http-${response.status}`));
    }
    return response.json();
  };
  const post = (what, path, payload) => call(what, `${base}${path}`, { method: 'POST', body: JSON.stringify(payload) });

  try {
    const repo = await call('read the repository', base);
    const defaultBranch = repo?.default_branch;
    if (typeof defaultBranch !== 'string' || defaultBranch === '') {
      warn('The repository has no default branch to propose against; nothing opened.');
      return skipped('no-default-branch');
    }
    if (branch === defaultBranch) return skipped('branch-is-default');

    // Once per plan: a pull request from this branch, in any state, is the
    // answer already given. Asked before anything is created.
    const head = encodeURIComponent(`${owner}:${branch}`);
    const existing = await call('look for this plan\'s pull request', `${base}/pulls?state=all&head=${head}&per_page=100`);
    const mine = Array.isArray(existing) ? existing.filter((pr) => pr?.head?.ref === branch) : [];
    const open = mine.find((pr) => pr.state === 'open');
    if (open) {
      notice(`This plan's pull request is already open: #${open.number}. Nothing new opened.`);
      return { action: 'reused', number: open.number };
    }
    if (mine.length > 0) {
      notice(`This plan's pull request (#${mine[0].number}) was closed. It is not opened again: that was an answer.`);
      return skipped('closed-before');
    }
    const branchRef = await request(`${base}/git/ref/heads/${branch}`);
    if (branchRef.ok) {
      warn(`The branch ${branch} exists with no pull request; it is left alone, and nothing opened. Delete it to try again.`);
      return skipped('branch-exists');
    }
    if (branchRef.status !== 404) {
      warn(`Could not tell whether ${branch} exists (${branchRef.status}); nothing opened, so as not to open it twice.`);
      return skipped(`ref-${branchRef.status}`);
    }

    const tip = await call('read the default branch', `${base}/git/ref/heads/${encodeURIComponent(defaultBranch)}`);
    const baseSha = tip?.object?.sha;
    const commit = await call('read the default branch\'s commit', `${base}/git/commits/${baseSha}`);
    const baseTree = commit?.tree?.sha;
    if (typeof baseSha !== 'string' || typeof baseTree !== 'string') {
      warn('The default branch could not be read; nothing opened.');
      return skipped('no-base');
    }

    // Each file as the default branch holds it, found by walking its tree, so
    // its mode is kept: the edit changes text and nothing else about a file.
    const entryOf = async (path) => {
      const parts = path.split('/');
      let tree = baseTree;
      for (const [index, part] of parts.entries()) {
        const listing = await call(`read ${path}`, `${base}/git/trees/${tree}`);
        const entry = (listing?.tree ?? []).find((item) => item.path === part);
        if (entry === undefined) return null;
        if (index === parts.length - 1) return entry.type === 'blob' && (entry.mode === '100644' || entry.mode === '100755') ? entry : null;
        if (entry.type !== 'tree') return null;
        tree = entry.sha;
      }
      return null;
    };

    const changes = [];
    for (const edit of edits) {
      const entry = await entryOf(edit.path);
      if (entry === null) {
        warn(`${edit.path} is not a file on ${defaultBranch}; the plan was made against another tree. Nothing opened.`);
        return skipped('file-not-on-base');
      }
      const blob = await call(`read ${edit.path}`, `${base}/git/blobs/${entry.sha}`);
      const text = Buffer.from(String(blob?.content ?? ''), blob?.encoding === 'base64' ? 'base64' : 'utf8').toString('utf8');
      const made = applyPlanEdit(edit, text, sha256);
      if (!made.ok) {
        warn(
          made.why === 'not-the-planned-file'
            ? `${edit.path} on ${defaultBranch} is not the file the plan was made against. Make the plan again; nothing opened.`
            : `${edit.path}: the plan's edit could not be made again as planned (${made.why}); nothing opened.`,
        );
        return skipped(made.why);
      }
      if (made.changed) changes.push({ path: edit.path, mode: entry.mode, text: made.text });
    }
    if (changes.length === 0) {
      notice(`Every edit in this plan is already on ${defaultBranch}; no pull request opened.`);
      return skipped('no-change');
    }

    const tree = await post('write the edited files', '/git/trees', {
      base_tree: baseTree,
      tree: changes.map((change) => ({ path: change.path, mode: change.mode, type: 'blob', content: change.text })),
    });
    if (typeof tree?.sha !== 'string' || tree.sha === baseTree) {
      notice(`The edits leave ${defaultBranch}'s tree as it is; no pull request opened.`);
      return skipped('no-change');
    }
    const paths = changes.map((change) => change.path);
    const made = await post('commit the edits', '/git/commits', {
      message: `Apply the Trazum plan's edits to ${paths.join(', ')}\n\nMade by the safe rules of trazum plan --edits; the pull request body is the plan.`,
      tree: tree.sha,
      parents: [baseSha],
    });
    await post('create the plan\'s branch', '/git/refs', { ref: `refs/heads/${branch}`, sha: made.sha });

    let text = body.trimEnd();
    if (text.length > MAX_BODY) text = `${text.slice(0, MAX_BODY - 400).trimEnd()}\n\n_(cut: GitHub accepts at most 65,536 characters)_`;
    const pr = await post('open the plan\'s pull request', '/pulls', {
      title: `Trazum plan: edit ${paths.length === 1 ? paths[0] : `${paths.length} prompt files`}`,
      head: branch,
      base: defaultBranch,
      body: `${text}\n\n${marker}\n`,
    });
    notice(`Opened the plan's pull request #${pr?.number} from ${branch} into ${defaultBranch}. It is not merged: that is the owner's to do.`);
    return { action: 'created', number: pr?.number };
  } catch (error) {
    if (error instanceof Refusal) return error.result;
    throw error;
  }
}

/* c8 ignore start: the CLI wrapper; the logic above is what the tests drive. */
const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  try {
    await openPlanPullRequest({ env: process.env, log: (line) => console.log(line) });
  } catch (error) {
    console.log(`::warning title=Trazum::Opening the plan's pull request failed: ${error?.message ?? error}. The plan is in the run summary.`);
  }
  await new Promise((resolve) => process.stdout.write('', resolve));
  process.exit(0);
}
/* c8 ignore stop */
