import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { sectionOf } from '../../../test-utils/section.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path) => readFileSync(join(ROOT, path), 'utf8');

/**
 * ROADMAP.md is the roadmap, and the release history is its own file (#725).
 *
 * ROADMAP.md had grown to about 3,400 lines, and what comes next started
 * around line 2,920: somebody who opened it to learn where the project is
 * going read how 0.1.0 was built first. The reasoning behind each release,
 * told forwards, is worth keeping and is not a roadmap, so it moved to
 * `HISTORY.md` without a word changed.
 *
 * What holds that shape, and the guards that moved with the history:
 *
 * - here: the roadmap reaches `## Next` on the first screen, carries none of
 *   the history, links the history in one line, and the history's first run
 *   of versions still goes upward from 0.1.0;
 * - `publish.test.js`: every version the history calls released is in
 *   `CHANGELOG.md`, and no collapsed milestone is called released;
 * - `roadmap-forecast.test.js`, `roadmap-truth.test.js`: the forecast sections
 *   are still read where they are, and the record is read where it is now.
 */

const roadmap = read('ROADMAP.md');
const history = read('HISTORY.md');

/**
 * What "the first screen" means, so the test can measure it.
 *
 * A reader's first screen is about forty lines of Markdown. `## Next` has to
 * be on one of the first FIRST_SCREEN lines of ROADMAP.md: the title, the
 * product line, the two rules and the link to the history come before it, and
 * nothing else may.
 */
const FIRST_SCREEN = 40;

describe('ROADMAP.md opens with what comes next', () => {
  it(`reaches "## Next" within its first ${FIRST_SCREEN} lines`, () => {
    const line = roadmap.split('\n').findIndex((text) => text === '## Next') + 1;
    assert.notEqual(line, 0, 'ROADMAP.md has no "## Next" section');
    assert.ok(
      line <= FIRST_SCREEN,
      `"## Next" is on line ${line}; what comes next belongs on the first screen (line ${FIRST_SCREEN})`,
    );
  });

  it('keeps the sections the roadmap is, in order, and no history', () => {
    const headings = roadmap
      .replace(/```[\s\S]*?```/g, '')
      .split('\n')
      .filter((text) => /^## /.test(text));
    assert.deepEqual(
      headings,
      ['## Next', '## Under consideration', '## How versions are decided'],
      'ROADMAP.md is Next, Under consideration and how versions are decided; a release entry belongs in HISTORY.md',
    );
    const entries = roadmap.split('\n').filter((text) => /^#{2,3} \d+\.\d+\.\d+ /.test(text));
    assert.deepEqual(entries, [], 'ROADMAP.md carries release entries, which belong in HISTORY.md');
  });

  it('links the release history in one line, and the history is there', () => {
    // Before `## Next`: a later mention in prose is a reference, not the link.
    const all = roadmap.split('\n');
    const opening = all.slice(0, all.findIndex((text) => text === '## Next'));
    const lines = opening.filter((text) => text.includes('](HISTORY.md)'));
    assert.equal(lines.length, 1, 'ROADMAP.md must link HISTORY.md in exactly one line, before "## Next"');
    const tracked = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'HISTORY.md'], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    assert.equal(tracked.trim(), 'HISTORY.md', 'the file ROADMAP.md links is not in the repository');
  });
});

describe('HISTORY.md is the release history', () => {
  /** Numeric, because '1.9.0' sorts above '1.51.0' as a string and that is the trap. */
  const compare = (a, b) => {
    const left = a.split('.').map(Number);
    const right = b.split('.').map(Number);
    for (let i = 0; i < 3; i += 1) if (left[i] !== right[i]) return left[i] - right[i];
    return 0;
  };

  it('says what it is and where the other accounts are', () => {
    const opening = history.slice(0, history.indexOf('\n## Released'));
    assert.match(opening, /^# Release history\n/);
    for (const link of ['](CHANGELOG.md)', '](RELEASES.md)', '](ROADMAP.md)']) {
      assert.ok(opening.includes(link), `the opening of HISTORY.md does not link ${link.slice(2, -1)}`);
    }
  });

  it('names every version CHANGELOG.md released, or covers it with a range', () => {
    /*
      The other direction from `publish.test.js`, which holds that nothing the
      history calls released is missing from the changelog. A version is
      covered when it is named anywhere in the file, or sits inside an entry
      written as "X through Y" (1.10.0 through 1.25.0 is one entry).

      1.9.1 is the one release the history has never carried. It is named here
      so the gap is on the record, and the second assertion fails the day the
      history gains it, so the exception cannot outlive the fact.
    */
    const NOT_IN_HISTORY = new Set(['1.9.1']);
    // Below the opening, which says where the file starts and ends and so
    // names versions without being an entry for any of them.
    const entries = history.slice(history.indexOf('\n## Released'));
    const named = new Set([...entries.matchAll(/\b\d+\.\d+\.\d+\b/g)].map((match) => match[0]));
    const ranges = [...entries.matchAll(/\b(\d+\.\d+\.\d+) through (\d+\.\d+\.\d+)\b/g)].map(
      (match) => [match[1], match[2]],
    );
    const covered = (version) =>
      named.has(version)
      || ranges.some(([from, to]) => compare(from, version) <= 0 && compare(version, to) <= 0);

    const released = [...read('CHANGELOG.md').matchAll(/^## (\d+\.\d+\.\d+)\b/gm)].map((match) => match[1]);
    assert.ok(released.length >= 100, `only ${released.length} released versions found in CHANGELOG.md`);
    assert.ok(ranges.length >= 1, 'no "X through Y" entry found: the range reading is broken');

    const missing = released.filter((version) => !covered(version) && !NOT_IN_HISTORY.has(version));
    assert.deepEqual(missing, [], `CHANGELOG.md released these and HISTORY.md never mentions them: ${missing.join(', ')}`);
    const stale = [...NOT_IN_HISTORY].filter((version) => covered(version));
    assert.deepEqual(stale, [], `HISTORY.md now carries ${stale.join(', ')}: remove it from the exceptions`);
  });

  it('runs 0.1.0 upward through its first run of versions', () => {
    /*
      The first run of `###` entries, which is the stretch of the file that is
      one story told forwards. The entries after it carry `##` headings and
      were written in more than one pass, so what is held for them is that
      each is in the changelog (`publish.test.js`), not that they sit in one
      order. It broke once without notice, for twenty-four releases: entries
      were prepended, and the file ran upward, jumped, and counted backwards.
    */
    const run = [...sectionOf(history, '\n## Released').matchAll(/^### (\d+\.\d+\.\d+)/gm)].map(
      (match) => match[1],
    );
    assert.ok(run.length >= 40, `only ${run.length} versions found in the first run`);
    assert.equal(run[0], '0.1.0', 'the history no longer starts at 0.1.0');
    for (let i = 1; i < run.length; i += 1) {
      assert.ok(
        compare(run[i - 1], run[i]) < 0,
        `${run[i]} follows ${run[i - 1]}: the history is out of order`,
      );
    }
  });
});

describe('a link to a heading of ROADMAP.md or HISTORY.md arrives at one', () => {
  /**
   * `docs.test.js` checks that a link's file exists and leaves the anchor
   * alone, "because heading text drifts". These two files are the ones whose
   * headings moved, so an anchor into either is checked here: the repository's
   * Markdown, and the generated wiki, which copies sections and rewrites their
   * links to `blob/main` URLs.
   */
  const slugs = (text) => {
    const seen = new Map();
    const out = new Set();
    for (const line of text.replace(/```[\s\S]*?```/g, '').split('\n')) {
      const heading = /^#{1,6} (.+)$/.exec(line);
      if (heading === null) continue;
      const base = heading[1]
        .replace(/`/g, '')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s-]/gu, '')
        .trim()
        .replace(/\s/g, '-');
      const count = seen.get(base) ?? 0;
      seen.set(base, count + 1);
      out.add(count === 0 ? base : `${base}-${count}`);
    }
    return out;
  };

  const anchors = { 'ROADMAP.md': slugs(roadmap), 'HISTORY.md': slugs(history) };

  const markdown = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '*.md'], {
    cwd: ROOT,
    encoding: 'utf8',
  })
    .split('\n')
    .filter((path) => path !== '' && !path.startsWith('.agents/'));

  it('reads the pages it claims to read', () => {
    assert.ok(markdown.length >= 30, `only ${markdown.length} Markdown files walked`);
    assert.ok(markdown.includes('HISTORY.md'), 'HISTORY.md is not in the walk');
    assert.ok(anchors['ROADMAP.md'].has('open-work-as-issues'), 'the slug rule no longer finds a heading it should');
  });

  it('every such link resolves', () => {
    const broken = [];
    for (const file of markdown) {
      const text = read(file).replace(/```[\s\S]*?```/g, '');
      for (const [, target, anchor] of text.matchAll(/\]\(([^)\s#]*(?:ROADMAP|HISTORY)\.md)#([^)\s]+)\)/g)) {
        const name = target.endsWith('HISTORY.md') ? 'HISTORY.md' : 'ROADMAP.md';
        if (!anchors[name].has(anchor)) broken.push(`${file}: ${name}#${anchor}`);
      }
    }
    assert.deepEqual(broken, [], `these links point at a heading that is not there: ${broken.join('; ')}`);
  });
});
