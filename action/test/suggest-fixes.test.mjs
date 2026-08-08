import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  changedRanges,
  coversWholeFile,
  lineCount,
  suggestFixes,
  suggestionBody,
  suggestionMarker,
} from '../suggest-fixes.mjs';

/**
 * Suggested changes, and the two things that decide whether one is honest.
 *
 * 1. **A suggestion must cover the whole file.** Trazum's rules operate on a whole
 *    prompt, not on lines. A suggestion anchored to part of a file would replace
 *    those lines with the optimisation of the *whole* prompt — different text,
 *    produced by no rule, applied with one click.
 *
 * 2. **It must decline out loud.** "Trazum suggested nothing" and "Trazum could
 *    not suggest here" look identical from an empty pull request, and only one of
 *    them is about the prompt.
 */

const PADDED = 'Please kindly note that you should always be very brief. Thank you very much!\n';

/** A pull request whose files and responses are exactly these. */
function harness({ files = [], onPost = () => ({ ok: true, status: 201 }), workspace = {} } = {}) {
  const posts = [];
  const lines = [];

  const fetchImpl = async (url, init = {}) => {
    if (url.includes('/files')) {
      const page = Number(new URL(url).searchParams.get('page'));
      return { ok: true, status: 200, json: async () => (page === 1 ? files : []) };
    }
    if (url.endsWith('/comments') && init.method === 'POST') {
      posts.push(JSON.parse(init.body));
      return onPost(JSON.parse(init.body));
    }
    throw new Error(`unexpected request: ${url}`);
  };

  const readFileImpl = async (path) => {
    if (path === '/event.json') {
      return JSON.stringify({ pull_request: { number: 7, head: { sha: 'a'.repeat(40) } } });
    }
    if (path in workspace) return workspace[path];
    throw new Error(`ENOENT ${path}`);
  };

  const env = {
    TRAZUM_GITHUB_TOKEN: 'token',
    GITHUB_REPOSITORY: 'owner/repo',
    GITHUB_EVENT_PATH: '/event.json',
    GITHUB_API_URL: 'https://api.github.test',
  };

  return { env, fetchImpl, readFileImpl, log: (l) => lines.push(l), posts, lines };
}

/** A patch whose hunk covers exactly lines 1..n of the new file. */
const wholeFilePatch = (n) => `@@ -0,0 +1,${n} @@\n${'+x\n'.repeat(n)}`;

describe('counting the lines git counts', () => {
  it('does not invent a line for the trailing newline', () => {
    /**
     * `"abc\n".split("\n")` is `["abc", ""]`. Anchoring to that phantom last line
     * puts `line` past the end of the file and GitHub answers 422 — and since
     * almost every text file ends in a newline, the feature would have failed on
     * essentially all of them as a quietly declined API call. It did, until this.
     */
    assert.equal(lineCount('abc\n'), 1);
    assert.equal(lineCount('a\nb\n'), 2);
    assert.equal(lineCount('a\nb'), 2, 'a file with no trailing newline still has both lines');
    assert.equal(lineCount(''), 0);
    assert.equal(lineCount('\n'), 1);
  });
});

describe('which lines a suggestion may anchor to', () => {
  it('reads the new-file range out of each hunk header', () => {
    assert.deepEqual(changedRanges('@@ -1,3 +1,5 @@\n@@ -20,2 +22,4 @@'), [
      [1, 5],
      [22, 25],
    ]);
  });

  it('handles a hunk header with the count omitted', () => {
    /**
     * `@@ -3 +3 @@` is legal and means one line. A parser assuming the comma is
     * always present reads the count as NaN and covers nothing — which looks
     * exactly like "this file is not fully in the diff" and would disable
     * suggestions with no visible reason.
     */
    assert.deepEqual(changedRanges('@@ -3 +3 @@'), [[3, 3]]);
    assert.deepEqual(changedRanges('@@ -1,0 +5 @@'), [[5, 5]]);
  });

  it('ignores anything that is not a hunk header', () => {
    assert.deepEqual(changedRanges('+ @@ -1,3 +1,5 @@ inside a line'), []);
    assert.deepEqual(changedRanges(undefined), []);
    assert.deepEqual(changedRanges(''), []);
  });

  it('accepts a file whose every line is in the diff', () => {
    assert.equal(coversWholeFile('@@ -0,0 +1,10 @@', 10), true);
    assert.equal(coversWholeFile('@@ -1,4 +1,6 @@\n@@ -8,2 +7,4 @@', 10), true);
  });

  it('refuses a file with a gap, or one that stops short', () => {
    assert.equal(coversWholeFile('@@ -1,2 +1,2 @@\n@@ -8,2 +8,2 @@', 10), false, 'gap at 3..7');
    assert.equal(coversWholeFile('@@ -1,3 +1,3 @@', 10), false, 'stops at 3 of 10');
    assert.equal(coversWholeFile('@@ -5,2 +5,2 @@', 10), false, 'does not start at 1');
    assert.equal(coversWholeFile('', 10), false);
    assert.equal(coversWholeFile('@@ -0,0 +1,3 @@', 0), false);
  });
});

describe('posting a suggestion', () => {
  it('suggests the optimised prompt for a fully-changed file', async () => {
    const h = harness({
      files: [{ filename: 'prompts/a.txt', status: 'added', patch: wholeFilePatch(1) }],
      workspace: { 'prompts/a.txt': PADDED },
    });
    const result = await suggestFixes(h);

    assert.equal(result.posted, 1);
    const [post] = h.posts;
    assert.equal(post.path, 'prompts/a.txt');
    assert.equal(post.start_line, 1);
    assert.equal(post.side, 'RIGHT');
    assert.match(post.body, /```suggestion\n/);
    assert.match(post.body, /Trazum/);
    // The suggestion is the optimised text, not the original.
    assert.equal(post.body.includes('Thank you very much'), false);
  });

  it('uses the safe level and nothing else', async () => {
    // The aggressive level is defensible when a human reads the diff it produced.
    // A one-click apply is not that moment, so this is not configurable here.
    const source = await import('node:fs/promises').then((fs) =>
      fs.readFile(new URL('../suggest-fixes.mjs', import.meta.url), 'utf8'),
    );
    assert.match(source, /level: 'safe'/);
    assert.equal(/level:\s*env\./.test(source), false, 'the level is taken from the environment');
  });

  it('does not suggest merely deleting a trailing newline', async () => {
    /**
     * `optimize` returns text with no trailing newline even when no rule fires, so
     * a plain inequality is true for virtually every file on disk. The first
     * version posted a suggestion for every prompt in the pull request, each one
     * proposing to delete that file's final newline and nothing else.
     */
    const h = harness({
      files: [{ filename: 'prompts/lean.txt', status: 'added', patch: wholeFilePatch(1) }],
      workspace: { 'prompts/lean.txt': 'Classify {{t}}.\n' },
    });
    const result = await suggestFixes(h);

    assert.equal(result.posted, 0, `suggested a no-op:\n${JSON.stringify(h.posts, null, 1)}`);
  });

  it('leaves the trailing newline out of the suggestion block', async () => {
    // Inside a fence the lines are the replacement lines; a terminator in the text
    // would add an empty line to the file.
    const h = harness({
      files: [{ filename: 'prompts/a.txt', status: 'added', patch: wholeFilePatch(1) }],
      workspace: { 'prompts/a.txt': PADDED },
    });
    await suggestFixes(h);

    const block = h.posts[0].body.split('```suggestion\n')[1].split('\n```')[0];
    assert.equal(block.endsWith('\n'), false, JSON.stringify(block));
    assert.ok(block.length > 0);
  });

  it('says nothing when the rules find nothing', async () => {
    const h = harness({
      files: [{ filename: 'prompts/lean.txt', status: 'added', patch: wholeFilePatch(1) }],
      workspace: { 'prompts/lean.txt': 'Classify {{t}}.\n' },
    });
    const result = await suggestFixes(h);

    assert.equal(result.posted, 0);
    assert.equal(h.posts.length, 0);
    assert.ok(h.lines.some((l) => l.includes('found nothing to take out')));
  });
});

describe('it declines out loud', () => {
  it('names a file whose diff covers only part of it', async () => {
    const h = harness({
      files: [
        { filename: 'prompts/a.txt', status: 'modified', patch: '@@ -1,1 +1,1 @@\n+x\n' },
      ],
      workspace: { 'prompts/a.txt': `${PADDED}${PADDED}${PADDED}` },
    });
    const result = await suggestFixes(h);

    assert.equal(result.posted, 0);
    assert.equal(h.posts.length, 0, 'a partial suggestion was posted');
    assert.ok(
      h.lines.some((l) => l.includes('only part of it is in the diff')),
      `no explanation was logged:\n${h.lines.join('\n')}`,
    );
  });

  it('names a prompt too large to paste into a review comment', async () => {
    // Distinct paragraphs: 600 identical ones collapse to 42 characters, because
    // the duplicate-blocks rule removes them all, and the size guard never fires.
    const huge = Array.from({ length: 600 }, (_, i) => `Item ${i}: ${PADDED}`).join('');
    const h = harness({
      files: [{ filename: 'prompts/huge.txt', status: 'added', patch: wholeFilePatch(600) }],
      workspace: { 'prompts/huge.txt': huge },
    });
    const result = await suggestFixes(h);

    assert.equal(result.posted, 0);
    assert.ok(h.lines.some((l) => l.includes('too large')));
  });

  it('skips a file that is not a prompt', async () => {
    const h = harness({
      files: [{ filename: 'src/index.ts', status: 'modified', patch: wholeFilePatch(1) }],
      workspace: { 'src/index.ts': PADDED },
    });
    assert.equal((await suggestFixes(h)).posted, 0);
    assert.equal(h.posts.length, 0);
  });

  it('skips a deleted file', async () => {
    const h = harness({
      files: [{ filename: 'prompts/gone.txt', status: 'removed', patch: '@@ -1,1 +0,0 @@' }],
      workspace: {},
    });
    assert.equal((await suggestFixes(h)).posted, 0);
  });
});

describe('it never fails the build', () => {
  it('declines without a token', async () => {
    const h = harness();
    const result = await suggestFixes({ ...h, env: { ...h.env, TRAZUM_GITHUB_TOKEN: '' } });
    assert.equal(result.skipped, 'no-token');
    assert.ok(h.lines.some((l) => l.includes('No github-token')));
  });

  it('declines when the run is not a pull request', async () => {
    const h = harness();
    const result = await suggestFixes({
      ...h,
      readFileImpl: async () => JSON.stringify({}),
    });
    assert.equal(result.skipped, 'no-pull-request');
  });

  it('declines when the API refuses to list the files', async () => {
    // The ordinary case on a fork, where the token is read-only.
    const h = harness();
    const result = await suggestFixes({
      ...h,
      fetchImpl: async () => ({ ok: false, status: 403, json: async () => ({}) }),
    });
    assert.equal(result.skipped, 'status-403');
    assert.ok(h.lines.some((l) => l.includes('403')));
  });

  it('carries on when one suggestion is refused', async () => {
    const h = harness({
      files: [
        { filename: 'prompts/a.txt', status: 'added', patch: wholeFilePatch(1) },
        { filename: 'prompts/b.txt', status: 'added', patch: wholeFilePatch(1) },
      ],
      workspace: { 'prompts/a.txt': PADDED, 'prompts/b.txt': PADDED },
      onPost: (body) =>
        body.path === 'prompts/a.txt'
          ? { ok: false, status: 422, json: async () => ({}) }
          : { ok: true, status: 201 },
    });
    const result = await suggestFixes(h);

    assert.equal(result.posted, 1, 'one refusal stopped the other file');
    assert.ok(h.lines.some((l) => l.includes('422')));
  });

  it('resolves rather than throwing when fetch itself fails', async () => {
    const h = harness();
    const result = await suggestFixes({
      ...h,
      fetchImpl: async () => {
        throw new Error('socket');
      },
    });
    assert.equal(result.skipped, 'fetch-failed');
  });
});

describe('the marker', () => {
  it('reduces a path to something safe inside an HTML comment', () => {
    assert.equal(suggestionMarker('prompts/a.txt'), '<!-- trazum-suggestion:prompts-a-txt -->');
    assert.equal(suggestionMarker('---').includes('-->'), true);
    assert.equal(suggestionMarker('---'), '<!-- trazum-suggestion:default -->');
  });

  it('leaves no double dash to close the comment early', () => {
    for (const path of ['a--b.txt', '../../etc/passwd', 'a  b/c.txt']) {
      const marker = suggestionMarker(path);
      assert.equal(marker.slice(4, -3).includes('--'), false, marker);
    }
  });

  it('puts the marker first so a re-run can find its own', () => {
    const body = suggestionBody('<!-- m -->', 12, 'short');
    assert.ok(body.startsWith('<!-- m -->'));
    assert.match(body, /~12 tokens/);
  });
});
