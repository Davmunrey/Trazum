#!/usr/bin/env node
/**
 * Posts the weekly summary `trazum weekly` wrote, to the one place the
 * repository's owner named, and nowhere else (#757).
 *
 * The owner picks in the Action's inputs, and there are exactly two answers:
 *
 * - `issue`: one issue for the week, opened by this run, in this repository;
 * - `comment`: one comment for the week on the standing issue the owner gave
 *   by number.
 *
 * Nothing else is a destination. The repository is the runner's own
 * `GITHUB_REPOSITORY`, never an input and never read from the event payload,
 * and the issue number comes from the input and from nowhere else. A pull
 * request's title or branch cannot move where this writes.
 *
 * **A week is posted once.** The summary ends in a marker naming its last day,
 * and a run looks for that marker before it writes: found, it replaces what it
 * wrote the first time; not found, it writes. Only something written by a Bot
 * counts as found, so a contributor who pastes the marker into their own issue
 * can neither capture the summary nor have their text overwritten by it.
 * The price is stated in docs/ci.md: with a personal access token in place of
 * the workflow's own, the author is a User and a re-run cannot recognise its
 * own post.
 *
 * The endpoints are the four it needs and no more: list the repository's
 * issues or one issue's comments, create an issue or a comment, and edit the
 * one it created. It sets no label, no assignee and no milestone: those are
 * the owner's decisions. The token is the one the workflow gave it, read from
 * the environment, and the CLI never sees it: `trazum weekly` writes a file
 * and this decides where the file goes.
 *
 * Like `post-comment.mjs` it never fails the build. A token too narrow, an
 * issue that is not there, an API that refuses: each records a notice and
 * ends, because the summary is also in the run summary and a red build for
 * "could not post a note" is how an Action gets removed from a pipeline.
 * Plain ESM outside the workspaces for the same reason as its sibling: the
 * core may not mention `fetch` and the CLI has no dependency to reach for.
 */

import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

/** GitHub rejects a body over 65,536 characters. */
const MAX_BODY = 65_000;
/** A title GitHub accepts is at most 256 characters. */
const MAX_TITLE = 250;
/** Pages of issues or comments to look through for the week's marker. */
const MAX_PAGES = 5;

const MARKER = /<!-- trazum-weekly:(\d{4}-\d{2}-\d{2}) -->/;

/** The standing issue's number: a plain positive integer, or nothing. */
const issueNumber = (value) => (/^[1-9]\d{0,9}$/.test(String(value ?? '').trim()) ? Number(String(value).trim()) : null);

/** What a weekly summary is called: its first heading, without the hashes. */
const titleOf = (report) => {
  const heading = /^#{1,3} +(.+)$/m.exec(report);
  const title = (heading?.[1] ?? '').replace(/\s+/g, ' ').trim();
  return title === '' ? null : title.slice(0, MAX_TITLE);
};

/**
 * The item this run wrote before, in `items`: the one carrying the marker and
 * authored by a Bot, the oldest if there are several.
 */
const ownPost = (items, marker) =>
  items
    .filter((item) => typeof item?.body === 'string' && item.body.includes(marker) && item?.user?.type === 'Bot')
    .filter((item) => item.pull_request === undefined)
    .sort((a, b) => (a.number ?? a.id) - (b.number ?? b.id))[0] ?? null;

/**
 * @returns {Promise<{action: string, detail?: string}>} what it did, for the
 *   tests and the caller's log. Never throws for an expected condition.
 */
export async function postWeekly({
  env = {},
  fetchImpl = globalThis.fetch,
  readFileImpl = (path) => readFile(path, 'utf8'),
  log = () => {},
} = {}) {
  const notice = (message) => log(`::notice title=Trazum::${message}`);
  const warn = (message) => log(`::warning title=Trazum::${message}`);

  const target = env.TRAZUM_SUMMARY_TARGET;
  const token = env.TRAZUM_GITHUB_TOKEN;
  const repository = env.GITHUB_REPOSITORY;
  const apiBase = env.GITHUB_API_URL || 'https://api.github.com';
  const bodyPath = env.TRAZUM_BODY_PATH;

  if (target !== 'issue' && target !== 'comment') {
    warn(`weekly-summary is "${target ?? ''}", and the only places it posts are "issue" and "comment"; nothing posted.`);
    return { action: 'skipped', detail: 'unknown-target' };
  }
  const standing = target === 'comment' ? issueNumber(env.TRAZUM_SUMMARY_ISSUE) : null;
  if (target === 'comment' && standing === null) {
    warn('weekly-summary is "comment" and weekly-summary-issue is not the number of an issue; nothing posted.');
    return { action: 'skipped', detail: 'no-standing-issue' };
  }
  if (!bodyPath) {
    warn('post-weekly invoked without a summary path; nothing posted.');
    return { action: 'skipped', detail: 'no-body-path' };
  }
  if (!token) {
    notice(
      'No token available, so the weekly summary was not posted. It is in the workflow run summary. ' +
        'To post it, pass github-token and grant issues: write.',
    );
    return { action: 'skipped', detail: 'no-token' };
  }
  if (!repository) {
    warn('GITHUB_REPOSITORY is unset; not running inside GitHub Actions?');
    return { action: 'skipped', detail: 'no-repository' };
  }

  let report;
  try {
    report = await readFileImpl(bodyPath);
  } catch (error) {
    warn(`Could not read the summary at ${bodyPath}: ${error.message}`);
    return { action: 'skipped', detail: 'unreadable-report' };
  }
  const found = MARKER.exec(report);
  if (found === null) {
    // Not something `trazum weekly` wrote: an empty file, or a check's report.
    // Posting it would put somebody else's text under this Action's name.
    warn('The file is not a weekly summary (it carries no week marker); nothing posted.');
    return { action: 'skipped', detail: 'not-a-weekly-summary' };
  }
  const marker = found[0];
  const title = titleOf(report) ?? `Trazum weekly summary ${found[1]}`;

  let body = report;
  if (body.length > MAX_BODY) {
    // The marker has to survive, or the next run cannot find this post.
    body = `${report.slice(0, MAX_BODY - 400).trimEnd()}\n\n_(cut: GitHub accepts at most 65,536 characters)_\n\n${marker}\n`;
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

  const where = target === 'comment' ? `the standing issue #${standing}` : 'a new issue';
  const tokenRefused = (status) => {
    notice(
      `The token cannot post the weekly summary to ${where} (${status}). It needs issues: write. ` +
        'The summary is in the run summary.',
    );
    return { action: 'skipped', detail: 'token-refused' };
  };

  // What the list endpoint is asked for: this repository's issues, or the
  // comments of the one issue the owner named. Never a search, never another
  // repository, never an issue found by its text.
  const listUrl = (page) =>
    target === 'comment'
      ? `${base}/issues/${standing}/comments?per_page=100&page=${page}`
      : `${base}/issues?state=all&per_page=100&page=${page}`;

  let existing = null;
  try {
    for (let page = 1; page <= MAX_PAGES && existing === null; page++) {
      const response = await request(listUrl(page));
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) return tokenRefused(response.status);
        warn(`Could not look for this week's summary (${response.status}); nothing posted, so as not to post it twice.`);
        return { action: 'skipped', detail: `list-${response.status}` };
      }
      const batch = await response.json();
      if (!Array.isArray(batch) || batch.length === 0) break;
      existing = ownPost(batch, marker);
      if (batch.length < 100) break;
    }
  } catch (error) {
    warn(`Could not reach the API (${error?.message ?? error}). The summary is in the run summary.`);
    return { action: 'skipped', detail: 'api-unreachable' };
  }

  const write =
    target === 'issue'
      ? existing
        ? { url: `${base}/issues/${existing.number}`, method: 'PATCH', payload: { title, body } }
        : { url: `${base}/issues`, method: 'POST', payload: { title, body } }
      : existing
        ? { url: `${base}/issues/comments/${existing.id}`, method: 'PATCH', payload: { body } }
        : { url: `${base}/issues/${standing}/comments`, method: 'POST', payload: { body } };

  let response;
  try {
    response = await request(write.url, { method: write.method, body: JSON.stringify(write.payload) });
  } catch (error) {
    warn(`Could not reach the API (${error?.message ?? error}). The summary is in the run summary.`);
    return { action: 'skipped', detail: 'api-unreachable' };
  }
  if (response.ok) {
    notice(`${write.method === 'PATCH' ? 'Updated' : 'Posted'} the weekly summary for ${found[1]} on ${where}.`);
    return { action: write.method === 'PATCH' ? 'updated' : 'created' };
  }
  if (response.status === 401 || response.status === 403) return tokenRefused(response.status);
  const detail = await response.text().catch(() => '');
  warn(`Could not post the weekly summary to ${where} (${response.status}). ${detail.slice(0, 200)}`);
  return { action: 'skipped', detail: `http-${response.status}` };
}

/* c8 ignore start — the CLI wrapper; the logic above is what the tests drive. */
const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  try {
    await postWeekly({ env: process.env, log: (line) => console.log(line) });
  } catch (error) {
    console.log(`::warning title=Trazum::Posting the weekly summary failed: ${error?.message ?? error}. It is in the run summary.`);
  }
  await new Promise((resolve) => process.stdout.write('', resolve));
  process.exit(0);
}
/* c8 ignore stop */
