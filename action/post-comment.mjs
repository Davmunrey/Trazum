#!/usr/bin/env node
/**
 * Posts a Trazum report as a pull request comment, replacing its own previous
 * one rather than adding another.
 *
 * Deliberately outside the npm workspaces and written in plain ESM. Two reasons,
 * both structural rather than stylistic:
 *
 * 1. `@trazum/core` asserts in CI that only `llm.ts` and `tokenizer.ts` may
 *    mention `fetch`, and `@trazum/cli` carries zero runtime dependencies so
 *    there is no octokit to reach for. A file here needs neither invariant
 *    relaxed — the alternative was editing a security test for convenience,
 *    which is not a reason.
 * 2. Nothing about the CLI should know what a pull request is. `trazum` writes a
 *    markdown file; this decides where that file goes.
 *
 * **It never fails the build.** Every failure path — no pull request, a
 * read-only token, comments disabled, the API refusing — records a notice and
 * resolves. The budget verdict is the Action's exit code and is raised in a
 * separate step. A tool that turns "could not comment" into a red build is a
 * tool that gets deleted from the pipeline rather than configured.
 *
 * The work lives in `postComment`, which takes its environment, its `fetch` and
 * its logger as arguments. That is what makes it testable without a socket, and
 * the tests need that: a real HTTP round trip would only ever exercise the happy
 * path, while the paths worth pinning are the four different ways this declines
 * to post.
 */

import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { commentMarker, wrapForComment } from '../packages/cli/dist/markdown.js';
import { detectLocale, getCliMessages } from '../packages/cli/dist/i18n/index.js';

/** GitHub rejects a body over 65,536 characters. */
const MAX_BODY = 65_000;

/** How many pages of comments to look through before giving up on a match. */
const MAX_PAGES = 10;

/**
 * The pull request number for this run, or null.
 *
 * Read from the event payload rather than from an input, so there is nothing for
 * a caller to get wrong and nothing derived from a branch name. A push to a
 * branch with no pull request has no number, and that is a skip, not an error.
 */
async function pullRequestNumber(eventPath, readEvent) {
  if (!eventPath) return null;
  try {
    const event = JSON.parse(await readEvent(eventPath));
    const number = event?.pull_request?.number ?? event?.issue?.number;
    return Number.isInteger(number) ? number : null;
  } catch {
    return null;
  }
}

/**
 * Finds the comment this run should replace.
 *
 * Matched on the invisible marker in the body, **not on the author**: `gh pr
 * comment --edit-last` matches by author, so any other step in the same job that
 * comments as `github-actions[bot]` would have its comment edited instead.
 *
 * Ties break towards a Bot author and then the lowest id — the oldest — so a run
 * that somehow created two keeps converging on one rather than alternating. The
 * Bot preference makes a comment planted by a contributor to squat the marker
 * lose. It does not make squatting impossible; SECURITY.md says so.
 */
async function findExisting(request, base, number, marker) {
  const candidates = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    const response = await request(
      `${base}/issues/${number}/comments?per_page=100&page=${page}`,
    );
    if (!response.ok) {
      return { error: `${response.status} listing comments`, status: response.status };
    }

    const batch = await response.json();
    if (!Array.isArray(batch) || batch.length === 0) break;

    for (const comment of batch) {
      if (typeof comment?.body === 'string' && comment.body.includes(marker)) {
        candidates.push(comment);
      }
    }
    if (batch.length < 100) break;
  }

  if (candidates.length === 0) return { comment: null };

  const bots = candidates.filter((c) => c?.user?.type === 'Bot');
  const pool = bots.length > 0 ? bots : candidates;
  pool.sort((a, b) => a.id - b.id);
  return { comment: pool[0] };
}

/**
 * @returns {Promise<{action: string, detail?: string}>} what it did, for tests
 *   and for the caller's log. Never throws for an expected condition.
 */
export async function postComment({
  env = {},
  fetchImpl = globalThis.fetch,
  readFileImpl = (path) => readFile(path, 'utf8'),
  log = () => {},
} = {}) {
  const notice = (message) => log(`::notice title=Trazum::${message}`);
  const warn = (message) => log(`::warning title=Trazum::${message}`);

  const token = env.TRAZUM_GITHUB_TOKEN;
  const bodyPath = env.TRAZUM_BODY_PATH;
  const marker = commentMarker(env.TRAZUM_MARKER_KEY || 'default');
  const repository = env.GITHUB_REPOSITORY;
  const apiBase = env.GITHUB_API_URL || 'https://api.github.com';
  const t = getCliMessages(detectLocale(env.TRAZUM_REPORT_LOCALE, env));

  // The check step's exit code is the only signal for "is anything wrong", which
  // is exactly what it means. A missing value counts as not-ok, so a report whose
  // status nobody established is never hidden behind a green disclosure triangle.
  const ok = env.TRAZUM_OUTCOME === '0';

  if (!bodyPath) {
    warn('post-comment invoked without a report path; nothing posted.');
    return { action: 'skipped', detail: 'no-body-path' };
  }
  if (!token) {
    notice(
      'No token available, so no comment was posted. The report is in the workflow run summary. ' +
        'To enable comments, pass github-token and grant pull-requests: write.',
    );
    return { action: 'skipped', detail: 'no-token' };
  }
  if (!repository) {
    warn('GITHUB_REPOSITORY is unset; not running inside GitHub Actions?');
    return { action: 'skipped', detail: 'no-repository' };
  }

  const number = await pullRequestNumber(env.GITHUB_EVENT_PATH, readFileImpl);
  if (number === null) {
    notice('Not a pull request, so no comment was posted. The report is in the run summary.');
    return { action: 'skipped', detail: 'no-pull-request' };
  }

  let report;
  try {
    report = await readFileImpl(bodyPath);
  } catch (error) {
    warn(`Could not read the report at ${bodyPath}: ${error.message}`);
    return { action: 'skipped', detail: 'unreadable-report' };
  }
  if (report.trim() === '') {
    warn('The report was empty; nothing posted.');
    return { action: 'skipped', detail: 'empty-report' };
  }

  let body = wrapForComment(report, {
    marker,
    ok,
    title: t.markdown.commentTitle(),
    collapsedNote: t.markdown.collapsedNote(),
    trimNotice: t.markdown.trimNotice(),
  });
  if (body.length > MAX_BODY) {
    // The marker has to survive the trim, or the next push cannot find this
    // comment and starts posting a new one every time.
    body = `${marker}\n\n${report.slice(0, MAX_BODY - 400)}\n\n${t.markdown.trimNotice()}`;
  }

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

  // 401 and 403 mean the token, not the request — and on a pull request from a
  // fork that is the expected case rather than a bug, because GITHUB_TOKEN is
  // read-only there by design. Naming which case it is, in one line, is the
  // difference between a reader fixing their permissions block and a reader
  // concluding the action is broken. It can happen on either call, so it is
  // handled in one place: a token too narrow to list is the same problem as one
  // too narrow to write.
  const tokenRefused = (status) => {
    notice(
      `The token cannot comment on #${number} (${status}). This is expected on a pull request ` +
        'from a fork, where GITHUB_TOKEN is read-only. The report is in the run summary. ' +
        'Do not reach for pull_request_target to work around it — that runs a writable token ' +
        'against code the contributor controls.',
    );
    return { action: 'skipped', detail: 'read-only-token' };
  };

  let found;
  try {
    found = await findExisting(request, base, number, marker);
  } catch (error) {
    warn(`Could not reach the API (${error?.message ?? error}). The report is in the run summary.`);
    return { action: 'skipped', detail: 'api-unreachable' };
  }
  if (found.error) {
    if (found.status === 401 || found.status === 403) return tokenRefused(found.status);
    warn(`Could not list existing comments (${found.error}). The report is in the run summary.`);
    return { action: 'skipped', detail: 'list-failed' };
  }

  const target = found.comment
    ? { url: `${base}/issues/comments/${found.comment.id}`, method: 'PATCH', verb: 'Updated' }
    : { url: `${base}/issues/${number}/comments`, method: 'POST', verb: 'Posted' };

  let response;
  try {
    response = await request(target.url, { method: target.method, body: JSON.stringify({ body }) });
  } catch (error) {
    warn(`Could not reach the API (${error?.message ?? error}). The report is in the run summary.`);
    return { action: 'skipped', detail: 'api-unreachable' };
  }

  if (response.ok) {
    notice(`${target.verb} the report on #${number}.`);
    return { action: target.method === 'PATCH' ? 'updated' : 'created' };
  }

  if (response.status === 401 || response.status === 403) return tokenRefused(response.status);

  const detail = await response.text().catch(() => '');
  warn(
    `Could not post the comment on #${number} (${response.status}). ` +
      `The report is in the run summary. ${detail.slice(0, 200)}`,
  );
  return { action: 'skipped', detail: `http-${response.status}` };
}

/* c8 ignore start — the CLI wrapper; the logic above is what the tests drive. */
const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  try {
    await postComment({ env: process.env, log: (line) => console.log(line) });
  } catch (error) {
    // Even an unexpected throw must not fail the caller's build.
    console.log(
      `::warning title=Trazum::Reporting failed: ${error?.message ?? error}. ` +
        'The report is in the run summary.',
    );
  }

  // Undici keeps its sockets pooled after the response is read, and those handles
  // keep the event loop alive — a one-shot script that has said everything it has
  // to say would otherwise sit there until the pool times out. Flush first, then
  // leave: `process.exit` can drop a buffered write to a pipe, and a CI log is a
  // pipe.
  await new Promise((resolve) => process.stdout.write('', resolve));
  process.exit(0);
}
/* c8 ignore stop */
