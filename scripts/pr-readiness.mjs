#!/usr/bin/env node
/**
 * Three rules a pull request is expected to keep, checked rather than asked for.
 *
 * 1. **It names the issue it resolves.** The description carries a closing
 *    keyword and a reference: `Fixes #639`. A change with no issue has no record
 *    of the problem apart from the solution. Exempt: Dependabot, and a pull
 *    request a maintainer labels `no-issue`.
 *
 * 2. **That issue was accepted.** It carries the `accepted` label, which a
 *    maintainer puts on when the work is agreed to. Until 2026-11-18 any issue
 *    would do: a pull request could name one its own author had opened a
 *    minute earlier, still `needs-triage`, and pass. That was fine while every
 *    pull request came from the owner. On the day somebody outside first
 *    offered work it stopped being fine (#718). The same two exemptions apply.
 *    An issue that cannot be read is not taken as accepted: the check refuses
 *    to judge.
 *
 * 3. **It adds its changelog entry as a file in `changes/`, and edits no
 *    entry in `CHANGELOG.md`.** Since #847 an entry is one file per change,
 *    `changes/<issue>.<kind>.md`, and the release folds them in. The history
 *    below is why the rule exists at all; the folder is how it stopped
 *    conflicting.
 *
 *    Before #847, the line went under `## Unreleased`.
 *    `changelog-coverage.test.js` can only ask whether `Unreleased` is empty
 *    after the newest tag. On 2026-11-17 a branch merged `main` after the 2.7.9
 *    and 2.7.10 releases, git applied the merge without a conflict, and the
 *    branch's entry landed inside `## 2.7.9`, a version already published
 *    without it (#666). Nothing failed; it was found by reading the diff. So
 *    this compares `CHANGELOG.md` at the merge base with the pull request's head:
 *    a line added inside a released version's section is refused, and so is a
 *    pull request that adds no line under `Unreleased`. A release pull request,
 *    the one that adds a new `## x.y.z` heading, is exempt from both, and so is
 *    Dependabot from the second. A maintainer who means to correct a released
 *    entry labels the pull request `changelog-history`.
 *
 * The decision is `readiness()`, a pure function; `main()` is the I/O, which
 * now includes asking GitHub for each linked issue's labels, run by
 * .github/workflows/pr-readiness.yml. packages/core/test/pr-readiness.test.js
 * holds the decision, including the 2.7.9 misplacement as it happened.
 */
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { CHANGES_DIR, POINTER, fragmentProblem } from './changes.mjs';

const CLOSING = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s+((?:[\w.-]+\/[\w.-]+)?#\d+)/gi;
const VERSION_HEADING = /^\d+\.\d+\.\d+\b/;
const BOTS = new Set(['dependabot[bot]']);

/**
 * Whether the pull request is excused from naming an accepted issue:
 * Dependabot's, and one a maintainer labelled `no-issue`.
 */
export function exempt(author, labels = []) {
  return BOTS.has(author) || labels.includes('no-issue');
}

/** Issue references a merge would close, in body order, without repeats. */
export function linkedIssues(body) {
  const seen = [];
  for (const [, ref] of (body ?? '').matchAll(CLOSING)) {
    if (!seen.includes(ref)) seen.push(ref);
  }
  return seen;
}

/** The label a maintainer puts on an issue when the work is agreed to. */
export const ACCEPTED = 'accepted';

/**
 * What stands between the linked issues and "a maintainer agreed to this",
 * one sentence for each that falls short. `issues` is what GitHub answered
 * for each reference: `{ ref, labels, pullRequest, closed }`, or
 * `{ ref, missing }` when there is no such issue. A closed issue does not
 * count, whatever it carries: hundreds of closed issues here were accepted
 * once, and naming any of them would otherwise open the gate. A reference to another repository cannot be
 * looked up with this repository's token, and is not taken on trust.
 */
export function unaccepted(linked, issues = []) {
  const problems = [];
  for (const ref of linked) {
    if (!ref.startsWith('#')) {
      problems.push(`${ref} is in another repository, so nothing here can say it was accepted. Name an issue of this repository.`);
      continue;
    }
    const issue = issues.find((candidate) => candidate.ref === ref);
    if (issue === undefined) {
      problems.push(`Issue ${ref} was not read, so nothing says it was accepted. Re-run this check.`);
    } else if (issue.missing === true) {
      problems.push(`Issue ${ref} does not exist in this repository. Name the issue this resolves.`);
    } else if (issue.pullRequest === true) {
      problems.push(`${ref} is a pull request, not an issue. Name the issue this resolves.`);
    } else if (issue.closed === true) {
      problems.push(`Issue ${ref} is closed. A pull request resolves an open issue: name the one this is for, or ask for ${ref} to be reopened.`);
    } else if (!issue.labels.includes(ACCEPTED)) {
      const carries = issue.labels.length === 0 ? 'no label' : issue.labels.map((label) => `\`${label}\``).join(', ');
      problems.push(
        `Issue ${ref} is not accepted yet: it carries ${carries}. A pull request is for work a maintainer has agreed to (CONTRIBUTING.md › Issue first). Once the issue is labelled \`${ACCEPTED}\`, re-run this check or edit the description.`,
      );
    }
  }
  return problems;
}

/** `CHANGELOG.md` split at its `## ` headings: [{ heading, lines }], preamble first. */
export function sections(markdown) {
  const out = [{ heading: null, lines: [] }];
  for (const line of (markdown ?? '').split('\n')) {
    const match = /^## (.+)$/.exec(line);
    if (match) out.push({ heading: match[1].trim(), lines: [] });
    else out[out.length - 1].lines.push(line);
  }
  return out;
}

/** The version a heading names (`2.7.9` from `2.7.9 — 2026-11-17`), or null. */
function versionOf(heading) {
  return heading && VERSION_HEADING.test(heading) ? VERSION_HEADING.exec(heading)[0] : null;
}

/** Non-blank lines in `after` that `before` does not account for, counting repeats. */
export function addedLines(before, after) {
  const pool = new Map();
  for (const line of before) pool.set(line, (pool.get(line) ?? 0) + 1);
  const added = [];
  for (const line of after) {
    if (line.trim() === '') continue;
    const left = pool.get(line) ?? 0;
    if (left > 0) pool.set(line, left - 1);
    else added.push(line);
  }
  return added;
}

/** What a pull request did to the changelog, between its merge base and its head. */
export function changelogChanges(before, after) {
  const was = sections(before);
  const now = sections(after);
  const released = new Map(
    was.filter((s) => versionOf(s.heading)).map((s) => [versionOf(s.heading), s.lines]),
  );
  const unreleasedBefore = was.find((s) => s.heading === 'Unreleased')?.lines ?? [];
  const unreleasedAfter = now.find((s) => s.heading === 'Unreleased')?.lines ?? [];

  const release = now.some((s) => versionOf(s.heading) && !released.has(versionOf(s.heading)));
  const misplaced = [];
  for (const s of now) {
    const version = versionOf(s.heading);
    if (!version || !released.has(version)) continue;
    const added = addedLines(released.get(version), s.lines);
    if (added.length > 0) misplaced.push({ version, lines: added });
  }
  const underUnreleased = addedLines(unreleasedBefore, unreleasedAfter).filter(
    (line) => line.trim() !== 'No changes yet.' && line.trim() !== POINTER,
  );
  return { release, misplaced, underUnreleased };
}

/**
 * The verdict for one pull request. Returns the problems, each a sentence that
 * says what to do; an empty list means ready.
 */
export function readiness({ body, author, labels = [], issues = [], changelogBefore, changelogAfter, added = [] }) {
  const problems = [];
  const bot = BOTS.has(author);
  const excused = exempt(author, labels);
  if (!excused && linkedIssues(body).length === 0) {
    problems.push(
      'Name the issue this resolves: put `Fixes #<n>` in the description. Open the issue first if there is none; a maintainer can label a pull request `no-issue` when it truly needs none.',
    );
  }
  if (!excused) problems.push(...unaccepted(linkedIssues(body), issues));
  const changes = changelogChanges(changelogBefore, changelogAfter);
  if (!changes.release && !labels.includes('changelog-history')) {
    for (const { version, lines } of changes.misplaced) {
      problems.push(
        `CHANGELOG.md: ${lines.length} line(s) added inside \`## ${version}\`, a released version. Move them under \`## Unreleased\`. A merge of \`main\` after a release can put them there without a conflict. First line: ${lines[0].trim()}`,
      );
    }
  }
  if (!changes.release && !labels.includes('changelog-history') && changes.underUnreleased.length > 0) {
    problems.push(
      `CHANGELOG.md: ${changes.underUnreleased.length} line(s) added under \`## Unreleased\`. Put the entry in a file in \`${CHANGES_DIR}/\` instead, named <issue>.<kind>.md; the release folds it in (${CHANGES_DIR}/README.md). First line: ${changes.underUnreleased[0].trim()}`,
    );
  }
  const misnamed = added.map(fragmentProblem).filter((problem) => typeof problem === 'string');
  problems.push(...misnamed);
  const fragments = added.filter((path) => fragmentProblem(path) === null);
  if (!changes.release && !bot && fragments.length === 0) {
    problems.push(
      `Add the changelog entry as a file in \`${CHANGES_DIR}/\`, named <issue>.<kind>.md (for example ${CHANGES_DIR}/847.added.md). Every merged change gets one, a test or a document included (CONTRIBUTING.md › Pull requests, ${CHANGES_DIR}/README.md).`,
    );
  }
  return { problems, release: changes.release, linked: linkedIssues(body) };
}

function git(...args) {
  // Node stops reading a child's output at 1 MiB unless told otherwise, and
  // `CHANGELOG.md` is larger than that (#754).
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 256 * 1024 * 1024 });
}

/**
 * A file as a commit has it, or `''` when that commit does not have the file.
 *
 * Those are the two answers. Anything else is thrown, and the run ends with
 * the code for "could not judge". It used to return `''` for every failure:
 * when the changelog passed 1 MiB the read failed, both sides came back
 * empty, and a pull request with twenty-two lines under `Unreleased` was told
 * to add one (#754). What could not be read is not the author's mistake.
 */
export function fileAt(sha, path, run = git) {
  try {
    return run('show', `${sha}:${path}`);
  } catch (error) {
    const said = String(error?.stderr ?? '');
    if (/does not exist in '|exists on disk, but not in '/.test(said)) return '';
    throw new Error(`${path} could not be read at ${String(sha).slice(0, 12)} (${error?.code ?? said.trim().split('\n')[0] ?? 'git show failed'}); refusing to judge without it.`);
  }
}

/**
 * What GitHub says of each linked issue of this repository: its labels,
 * whether it is closed, and whether it is in fact a pull request. A number with no issue behind it is
 * `missing`. Any other answer throws: an issue that could not be read must
 * not come back looking like one with no labels.
 */
export async function readIssues(refs, { repository, token, api = 'https://api.github.com', fetcher = fetch }) {
  const read = [];
  for (const ref of refs.filter((candidate) => candidate.startsWith('#'))) {
    const response = await fetcher(`${api}/repos/${repository}/issues/${ref.slice(1)}`, {
      headers: { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    });
    if (response.status === 404 || response.status === 410) {
      read.push({ ref, missing: true });
      continue;
    }
    if (!response.ok) throw new Error(`GitHub answered ${response.status} for issue ${ref}`);
    const issue = await response.json();
    read.push({ ref, labels: (issue.labels ?? []).map((label) => (typeof label === 'string' ? label : label.name)), pullRequest: issue.pull_request !== undefined, closed: issue.state === 'closed' });
  }
  return read;
}

async function main() {
  const { PR_BODY, PR_AUTHOR, PR_LABELS, BASE_SHA, HEAD_SHA, GH_TOKEN, GITHUB_REPOSITORY, GITHUB_API_URL } = process.env;
  if (!BASE_SHA || !HEAD_SHA) {
    // A gate that cannot see the pull request must not report it ready.
    console.error('pr-readiness: BASE_SHA and HEAD_SHA are required; refusing to judge without them.');
    return 2;
  }
  const labels = PR_LABELS ? JSON.parse(PR_LABELS) : [];
  let issues = [];
  try {
    // Not asked for a pull request that is excused: Dependabot's description
    // quotes other projects' changelogs, "fixes #12" and all, and its pull
    // request must not wait on an answer nobody will use.
    if (!exempt(PR_AUTHOR, labels)) {
      if (!GITHUB_REPOSITORY) throw new Error('GITHUB_REPOSITORY is not set');
      issues = await readIssues(linkedIssues(PR_BODY), { repository: GITHUB_REPOSITORY, token: GH_TOKEN, ...(GITHUB_API_URL ? { api: GITHUB_API_URL } : {}) });
    }
  } catch (error) {
    // The same rule: what cannot be read is not reported as fine.
    console.error(`pr-readiness: the linked issue could not be read (${error.message}); refusing to judge without it.`);
    return 2;
  }
  const mergeBase = git('merge-base', BASE_SHA, HEAD_SHA).trim();
  const verdict = readiness({
    body: PR_BODY,
    author: PR_AUTHOR,
    labels,
    issues,
    changelogBefore: fileAt(mergeBase, 'CHANGELOG.md'),
    changelogAfter: fileAt(HEAD_SHA, 'CHANGELOG.md'),
    added: git('diff', '--name-only', '--diff-filter=A', mergeBase, HEAD_SHA).split('\n').filter(Boolean),
  });
  console.log(`Linked issue: ${verdict.linked.join(', ') || 'none'}`);
  console.log(`Release pull request: ${verdict.release ? 'yes' : 'no'}`);
  if (verdict.problems.length === 0) {
    console.log(`Ready: the issue is named and accepted, and the changelog entry is a file in ${CHANGES_DIR}/.`);
    return 0;
  }
  for (const problem of verdict.problems) console.log(`::error::${problem}`);
  return 1;
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedDirectly) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      console.error(`pr-readiness: ${error.message}`);
      process.exitCode = 2;
    },
  );
}
