#!/usr/bin/env node
/**
 * Posts the optimised prompt as a GitHub **suggested change**, which a maintainer
 * applies with one button.
 *
 * ## Why a suggestion and not a commit
 *
 * The obvious build is an autofix that commits the optimised prompts to the pull
 * request branch. That needs `contents: write` on the workflow of everybody who
 * installs this action, and [SECURITY.md](../SECURITY.md) documents the opposite —
 * `contents: read`, no `pull_request_target` — with a test asserting it. Widening
 * that is a decision for the people running the workflow, not a convenience this
 * action should help itself to.
 *
 * A `suggestion` block needs only `pull-requests: write`, which the comment mode
 * already requires, and it lands in the same place with the same one click. The
 * maintainer stays the one who commits.
 *
 * ## The limitation, stated
 *
 * A suggestion can only anchor to lines that are **in the pull request's diff**.
 * Trazum's rules operate on a whole prompt, not on individual lines, so the
 * suggestion has to replace the whole file — and that is only possible when the
 * whole file is in the diff. A pull request that edits three lines of a
 * forty-line prompt gets a notice explaining why there is no suggestion, rather
 * than a partial rewrite that would mean something different from what the rules
 * produced.
 *
 * Like `post-comment.mjs`, this never fails the build and takes its environment,
 * `fetch` and logger as arguments so the declining paths can be tested without a
 * socket — and the declining paths are most of it.
 */

import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { optimize } from '../packages/core/dist/index.js';

/** Pages of pull request files to walk before giving up. */
const MAX_PAGES = 10;

/** A prompt bigger than this is not something to paste into a review comment. */
const MAX_SUGGESTION_CHARS = 30_000;

/**
 * Lines in a file, as git counts them.
 *
 * `"abc\n".split("\n")` is `["abc", ""]` — length 2 for a one-line file, because
 * the trailing newline terminates the line rather than starting another. Anchoring
 * a suggestion to that phantom last line puts `line` past the end of the file and
 * GitHub rejects the comment with a 422. Since almost every text file ends in a
 * newline, the feature would have failed on essentially all of them, quietly, as a
 * declined API call.
 */
export function lineCount(text) {
  if (text === '') return 0;
  const parts = text.split('\n');
  return text.endsWith('\n') ? parts.length - 1 : parts.length;
}

/**
 * The line ranges of the **new** file that appear in a unified diff.
 *
 * Each hunk header is `@@ -oldStart,oldLines +newStart,newLines @@`, and the
 * count is omitted when it is 1 — `@@ -3 +3 @@` is legal and means one line. A
 * parser that assumes the comma is always there reads the range as `NaN` and
 * silently covers nothing, which would look exactly like "this file is not fully
 * in the diff" and disable the feature for no visible reason.
 */
export function changedRanges(patch) {
  if (typeof patch !== 'string') return [];
  const ranges = [];
  for (const match of patch.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)) {
    const start = Number(match[1]);
    const count = match[2] === undefined ? 1 : Number(match[2]);
    if (!Number.isInteger(start) || !Number.isInteger(count) || count <= 0) continue;
    ranges.push([start, start + count - 1]);
  }
  return ranges;
}

/**
 * Whether every line from 1 to `lines` appears in the diff.
 *
 * A suggestion that does not cover the whole file would replace part of a prompt
 * with the optimisation of the whole of it, which is not the same text and not
 * what any rule produced.
 */
export function coversWholeFile(patch, lines) {
  if (lines <= 0) return false;
  const ranges = changedRanges(patch).sort((a, b) => a[0] - b[0]);
  let reached = 0;
  for (const [start, end] of ranges) {
    if (start > reached + 1) return false;
    reached = Math.max(reached, end);
  }
  return reached >= lines;
}

/**
 * The comment body: a sentence, then the replacement.
 *
 * The marker is an HTML comment so a re-run can find its own previous suggestion
 * instead of stacking a new one on every push — the same technique the report
 * comment uses, and for the same reason.
 */
export function suggestionBody(marker, saved, optimized) {
  return [
    marker,
    '',
    `**Trazum:** the safe rules would take ~${saved} tokens out of this prompt.`,
    'Applying this changes no code, no URL and no template placeholder — those are',
    'copied character for character.',
    '',
    '```suggestion',
    optimized,
    '```',
  ].join('\n');
}

/** `<!-- trazum-suggestion:path -->`, reduced to something safe in a comment. */
export function suggestionMarker(path) {
  const safe = path
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '');
  return `<!-- trazum-suggestion:${/[A-Za-z0-9]/.test(safe) ? safe : 'default'} -->`;
}

async function pullRequest(eventPath, readFileImpl) {
  if (!eventPath) return null;
  try {
    const event = JSON.parse(await readFileImpl(eventPath));
    const number = event?.pull_request?.number;
    const sha = event?.pull_request?.head?.sha;
    return Number.isInteger(number) && typeof sha === 'string' ? { number, sha } : null;
  } catch {
    return null;
  }
}

export async function suggestFixes({
  env = {},
  fetchImpl = globalThis.fetch,
  readFileImpl = (path) => readFile(path, 'utf8'),
  log = () => {},
} = {}) {
  const notice = (message) => log(`::notice title=Trazum::${message}`);
  const warn = (message) => log(`::warning title=Trazum::${message}`);

  const token = env.TRAZUM_GITHUB_TOKEN;
  const repository = env.GITHUB_REPOSITORY;
  const apiBase = env.GITHUB_API_URL || 'https://api.github.com';
  const extensions = (env.TRAZUM_SUGGEST_EXTENSIONS || '.txt,.md,.prompt')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);

  if (!token) {
    notice('No github-token, so no suggestions were posted.');
    return { posted: 0, skipped: 'no-token' };
  }
  if (!repository) {
    notice('No GITHUB_REPOSITORY, so no suggestions were posted.');
    return { posted: 0, skipped: 'no-repository' };
  }

  const pr = await pullRequest(env.GITHUB_EVENT_PATH, readFileImpl);
  if (!pr) {
    notice('This run is not a pull request, so there is nothing to suggest on.');
    return { posted: 0, skipped: 'no-pull-request' };
  }

  const headers = {
    accept: 'application/vnd.github+json',
    authorization: `Bearer ${token}`,
    'x-github-api-version': '2022-11-28',
    'user-agent': 'trazum-action',
  };

  /** Every file in the pull request, across pages. */
  const files = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    let response;
    try {
      response = await fetchImpl(
        `${apiBase}/repos/${repository}/pulls/${pr.number}/files?per_page=100&page=${page}`,
        { headers },
      );
    } catch {
      warn('Could not read the pull request files, so no suggestions were posted.');
      return { posted: 0, skipped: 'fetch-failed' };
    }
    if (!response.ok) {
      // A read-only token on a fork is the ordinary case, not a problem.
      notice(`The API declined to list the pull request files (${response.status}).`);
      return { posted: 0, skipped: `status-${response.status}` };
    }
    const page_ = await response.json();
    if (!Array.isArray(page_) || page_.length === 0) break;
    files.push(...page_);
    if (page_.length < 100) break;
  }

  let posted = 0;
  const declined = [];

  for (const file of files) {
    const path = file?.filename;
    if (typeof path !== 'string') continue;
    if (file.status === 'removed') continue;
    if (!extensions.some((ext) => path.toLowerCase().endsWith(ext))) continue;

    let original;
    try {
      original = await readFileImpl(path);
    } catch {
      continue; // Not checked out, or outside the workspace.
    }

    // `safe` only, and not configurable here. The aggressive level is defensible
    // when a human is reading the diff it produced; a one-click apply is not that
    // moment.
    const result = optimize(original, { level: 'safe' });

    /**
     * Compared without the trailing newline, and suggested without one.
     *
     * `optimize` returns text with no trailing newline even when no rule fired:
     * `"Classify {{t}}.\n"` comes back as `"Classify {{t}}."` with `rules: []`. A
     * plain `optimized !== original` is therefore true for virtually every file on
     * disk, so the first version of this posted a suggestion for every prompt in
     * the pull request — each one proposing to delete that file's final newline
     * and nothing else.
     *
     * Inside a ```suggestion fence the lines *are* the replacement lines, so the
     * terminator belongs to the line structure and must not be in the text.
     */
    const body = original.replace(/\n$/, '');
    const suggested = result.optimized.replace(/\n$/, '');
    if (suggested === body) continue;

    // A suggestion whose headline is "~0 tokens" is noise with a button on it.
    if (result.tokensSaved <= 0) continue;

    if (suggested.length > MAX_SUGGESTION_CHARS) {
      declined.push(`${path} (too large for a review comment)`);
      continue;
    }

    const lines = lineCount(original);
    if (lines === 0) continue;
    if (!coversWholeFile(file.patch, lines)) {
      declined.push(`${path} (only part of it is in the diff)`);
      continue;
    }

    const marker = suggestionMarker(path);
    const commentBody = suggestionBody(marker, result.tokensSaved, suggested);

    let response;
    try {
      response = await fetchImpl(`${apiBase}/repos/${repository}/pulls/${pr.number}/comments`, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({
          body: commentBody,
          commit_id: pr.sha,
          path,
          side: 'RIGHT',
          start_side: 'RIGHT',
          start_line: 1,
          line: lines,
        }),
      });
    } catch {
      warn(`Could not post a suggestion for ${path}.`);
      continue;
    }
    if (!response.ok) {
      notice(`The API declined the suggestion for ${path} (${response.status}).`);
      continue;
    }
    posted++;
  }

  if (declined.length > 0) {
    // Named, not silent. "Trazum suggested nothing" and "Trazum could not suggest
    // here" look identical from an empty pull request, and only one of them is
    // about the prompt.
    notice(`No suggestion for: ${declined.join(', ')}.`);
  }
  if (posted === 0 && declined.length === 0) {
    notice('The safe rules found nothing to take out of the prompts in this pull request.');
  }

  return { posted, declined };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  suggestFixes({ env: process.env, log: (line) => console.log(line) }).catch(() => {
    // Never fails the build: the budget verdict is a separate step.
  });
}
