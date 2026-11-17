#!/usr/bin/env node
/**
 * Two rules a pull request is expected to keep, checked rather than asked for.
 *
 * 1. **It names the issue it resolves.** The description carries a closing
 *    keyword and a reference: `Fixes #639`. A change with no issue has no record
 *    of the problem apart from the solution. Exempt: Dependabot, and a pull
 *    request a maintainer labels `no-issue`.
 *
 * 2. **Its changelog line lands under `## Unreleased`, and it has one.**
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
 * The decision is `readiness()`, a pure function; `main()` is the I/O, run by
 * .github/workflows/pr-readiness.yml. packages/core/test/pr-readiness.test.js
 * holds the decision, including the 2.7.9 misplacement as it happened.
 */
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const CLOSING = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s+((?:[\w.-]+\/[\w.-]+)?#\d+)/gi;
const VERSION_HEADING = /^\d+\.\d+\.\d+\b/;
const BOTS = new Set(['dependabot[bot]']);

/** Issue references a merge would close, in body order, without repeats. */
export function linkedIssues(body) {
  const seen = [];
  for (const [, ref] of (body ?? '').matchAll(CLOSING)) {
    if (!seen.includes(ref)) seen.push(ref);
  }
  return seen;
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
    (line) => line.trim() !== 'No changes yet.',
  );
  return { release, misplaced, underUnreleased };
}

/**
 * The verdict for one pull request. Returns the problems, each a sentence that
 * says what to do; an empty list means ready.
 */
export function readiness({ body, author, labels = [], changelogBefore, changelogAfter }) {
  const problems = [];
  const bot = BOTS.has(author);
  if (!bot && !labels.includes('no-issue') && linkedIssues(body).length === 0) {
    problems.push(
      'Name the issue this resolves: put `Fixes #<n>` in the description. Open the issue first if there is none; a maintainer can label a pull request `no-issue` when it truly needs none.',
    );
  }
  const changes = changelogChanges(changelogBefore, changelogAfter);
  if (!changes.release && !labels.includes('changelog-history')) {
    for (const { version, lines } of changes.misplaced) {
      problems.push(
        `CHANGELOG.md: ${lines.length} line(s) added inside \`## ${version}\`, a released version. Move them under \`## Unreleased\`. A merge of \`main\` after a release can put them there without a conflict. First line: ${lines[0].trim()}`,
      );
    }
  }
  if (!changes.release && !bot && changes.underUnreleased.length === 0) {
    problems.push(
      'CHANGELOG.md: add a line under `## Unreleased`. Every merged change gets one, a test or a document included (CONTRIBUTING.md › Pull requests).',
    );
  }
  return { problems, release: changes.release, linked: linkedIssues(body) };
}

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function fileAt(sha, path) {
  try {
    return git('show', `${sha}:${path}`);
  } catch {
    return '';
  }
}

function main() {
  const { PR_BODY, PR_AUTHOR, PR_LABELS, BASE_SHA, HEAD_SHA } = process.env;
  if (!BASE_SHA || !HEAD_SHA) {
    // A gate that cannot see the pull request must not report it ready.
    console.error('pr-readiness: BASE_SHA and HEAD_SHA are required; refusing to judge without them.');
    return 2;
  }
  const mergeBase = git('merge-base', BASE_SHA, HEAD_SHA).trim();
  const verdict = readiness({
    body: PR_BODY,
    author: PR_AUTHOR,
    labels: PR_LABELS ? JSON.parse(PR_LABELS) : [],
    changelogBefore: fileAt(mergeBase, 'CHANGELOG.md'),
    changelogAfter: fileAt(HEAD_SHA, 'CHANGELOG.md'),
  });
  console.log(`Linked issue: ${verdict.linked.join(', ') || 'none'}`);
  console.log(`Release pull request: ${verdict.release ? 'yes' : 'no'}`);
  if (verdict.problems.length === 0) {
    console.log('Ready: the issue is named and the changelog line is under Unreleased.');
    return 0;
  }
  for (const problem of verdict.problems) console.log(`::error::${problem}`);
  return 1;
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedDirectly) process.exitCode = main();
