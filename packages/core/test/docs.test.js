import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, relative, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { sectionOf } from '../../../test-utils/section.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');

/**
 * The documentation, checked the way the code is.
 *
 * Prose is the part of this repository nothing compiles. A link that stops
 * resolving because a file moved, or an index that stops listing a document
 * because somebody added one, fails silently and stays wrong for as long as
 * nobody clicks it — the same shape as every other bug this suite exists to
 * catch, with a slower feedback loop.
 */

/**
 * Every Markdown file this repository actually owns.
 *
 * `--others --exclude-standard` is not decoration: with plain `ls-files` this
 * guard was blind to a file that had been written but not yet committed, which
 * is exactly when a new document's links are most likely to be wrong. The probe
 * that proved this test caught the index half and sailed past the link half,
 * because the file it had just broken was untracked.
 */
const MARKDOWN = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '*.md'],
  { cwd: repoRoot, encoding: 'utf8' },
)
  .split('\n')
  .filter(Boolean)
  // `.agents/skills/**` is vendored third party. Its links are not ours to fix.
  .filter((path) => !path.startsWith('.agents/'))
  .sort();

/** Fenced blocks are examples, not references — a `](...)` inside one is text. */
const withoutCodeBlocks = (text) => text.replace(/```[\s\S]*?```/g, '');

/**
 * Relative targets only.
 *
 * `http`, `mailto` and a bare `#anchor` are somebody else's to keep alive; a
 * path is ours, and it is the only kind that breaks when a file is renamed.
 */
const linksIn = (text) => {
  const targets = [];
  for (const [, target] of withoutCodeBlocks(text).matchAll(/]\(([^)\s]+)\)/g)) targets.push(target);
  for (const [, target] of withoutCodeBlocks(text).matchAll(/<img[^>]+src="([^"]+)"/g))
    targets.push(target);
  return targets.filter(
    (target) => !/^(https?:|mailto:|#|data:)/.test(target) && target.trim() !== '',
  );
};

describe('the documentation links resolve', () => {
  for (const file of MARKDOWN) {
    it(`${file} points only at files that exist`, async () => {
      const text = await readFile(join(repoRoot, file), 'utf8');
      const broken = [];
      for (const target of linksIn(text)) {
        // An anchor is not checked — heading text drifts for good reasons, and a
        // guard that fails on a renamed section would be answered by deleting it.
        const path = target.split('#')[0];
        if (path === '') continue;
        const resolved = resolve(dirname(join(repoRoot, file)), path);
        // A link out of the repository is a link this guard cannot speak for.
        if (relative(repoRoot, resolved).startsWith('..')) continue;
        if (!existsSync(resolved)) broken.push(target);
      }
      assert.deepEqual(broken, [], `${file} links to files that do not exist: ${broken.join(', ')}`);
    });
  }
});

describe('the documentation index lists the documentation', () => {
  /**
   * An index is only worth having if adding a document to `docs/` is not
   * enough to leave it out of it. The previous arrangement had no index at
   * all, which is the same failure with the discovery cost paid by every
   * reader instead of by this test.
   */
  it('names every file in docs/', async () => {
    const index = await readFile(join(repoRoot, 'docs', 'README.md'), 'utf8');
    const documents = MARKDOWN.filter(
      (path) => path.startsWith('docs/') && path !== 'docs/README.md',
    );
    assert.ok(documents.length > 0, 'docs/ has no documents — this guard is watching nothing');
    const missing = documents.filter(
      (path) => !index.includes(normalize(path).slice('docs/'.length)),
    );
    assert.deepEqual(
      missing,
      [],
      `docs/README.md does not link these, so nothing leads a reader to them: ${missing.join(', ')}`,
    );
  });
});

describe('the plan index says what became of each plan', () => {
  /**
   * `docs/README.md` indexes the plans, and a plan is a record that is not
   * rewritten, so the index is the one place that can say a plan was carried
   * out. Two rows said otherwise for as long as it took the work to land:
   * the 1.83 to 2.0 plan read *"Written, nothing delivered yet"* after 2.0.0
   * had shipped, and the 2.4 plan read *"In progress"* after 2.4.0 had.
   *
   * The release a plan ends at is read off its file name and looked up in
   * `CHANGELOG.md`. A row that still says nothing has been delivered, or that
   * the plan is in progress, while the changelog has the heading of the
   * release the plan ends at, is out of date. A plan that has not reached its
   * last release may say either, and is not asked to say more.
   */
  const SAYS_UNFINISHED = /^(Written\b|In progress\b|Not started\b)/i;

  const rows = async () => {
    const index = await readFile(join(repoRoot, 'docs', 'README.md'), 'utf8');
    const table = sectionOf(index, '## The arcs, as they were planned');
    return [...table.matchAll(/^\| \[([^\]]+)\]\((plan-[^)]+\.md)\) \|[^|]*\|\s*(.+?)\s*\|$/gm)].map(
      ([, label, file, landed]) => {
        const named = /^plan-(\d+)\.(\d+)(?:-(\d+)\.(\d+))?\.md$/.exec(file);
        assert.ok(named, `${file} is not a plan file name this guard can read`);
        const [, major, minor, laterMajor, laterMinor] = named;
        return { label, landed, last: `${laterMajor ?? major}.${laterMinor ?? minor}.0` };
      },
    );
  };

  const released = async () => {
    const changelog = await readFile(join(repoRoot, 'CHANGELOG.md'), 'utf8');
    return new Set([...changelog.matchAll(/^## (\d+\.\d+\.\d+)\b/gm)].map((match) => match[1]));
  };

  it('reads the plans it claims to read', async () => {
    const found = await rows();
    assert.ok(found.length >= 20, `only ${found.length} plan rows read from docs/README.md`);
    assert.ok(found.some((row) => row.label.startsWith('2.4')), 'the 2.4 plan is not in the index');
    assert.ok(
      (await released()).has('2.4.0'),
      'CHANGELOG.md has no 2.4.0 heading, so this guard would pass every row',
    );
  });

  it('does not call a plan unfinished once the release it ends at is in the changelog', async () => {
    const shipped = await released();
    const stale = (await rows())
      .filter((row) => SAYS_UNFINISHED.test(row.landed) && shipped.has(row.last))
      .map((row) => `${row.label} ends at ${row.last}, which CHANGELOG.md has, and its row says "${row.landed.slice(0, 40)}"`);
    assert.deepEqual(stale, [], `the plan index is behind the changelog: ${stale.join('; ')}`);
  });
});

describe('the outside instrument, and the sentence it changed', () => {
  /**
   * `our-own-medicine.md` used to say every miss on it had been found by the
   * same process that made it. Five were not: CodeQL found them, and the page
   * now names the releases.
   *
   * A list of releases in prose is a claim like any other. This checks each
   * named release actually carries the evidence, so the list cannot quietly
   * grow past what happened.
   */
  const medicine = () => readFile(join(repoRoot, 'docs', 'our-own-medicine.md'), 'utf8');
  const releases = () => readFile(join(repoRoot, 'RELEASES.md'), 'utf8');

  /**
   * A release's own notes, bounded by the next heading and not by a named
   * neighbour — `sectionOf` exists precisely so this file does not reinvent
   * that, and the guard in `publish.test.js` caught this test doing it.
   */
  const sectionFor = (text, version) => {
    const heading = [...text.matchAll(/^## .+$/gm)]
      .map((match) => match[0])
      .find((line) => line.startsWith(`## ${version} —`));
    return heading === undefined ? null : sectionOf(text, heading);
  };

  it('names releases that really do carry an outside finding', async () => {
    const page = await medicine();
    // Bounded by the next heading, whatever it is: slicing to the end of the
    // file is the same class of mistake one document over.
    const claim = sectionOf(page, '## The one sentence that stopped being true');

    const named = [...claim.matchAll(/^\| (\d+\.\d+\.\d+) \|/gm)].map((match) => match[1]);
    assert.ok(named.length >= 3, `only ${named.length} releases named — has the table moved?`);

    const notes = await releases();
    const unevidenced = [];
    for (const version of named) {
      const section = sectionFor(notes, version);
      if (section === null || !section.includes('CodeQL')) unevidenced.push(version);
    }
    assert.deepEqual(
      unevidenced,
      [],
      `these releases are named as outside findings and their notes do not mention CodeQL: ${unevidenced.join(', ')}`,
    );
  });

  it('and the check is not one that can never fire', () => {
    // Handed a release whose notes say nothing of the sort.
    const notes = '\n## 9.9.9 — "Nothing external here"\n\nA release with no outside finding.\n';
    const start = notes.indexOf('\n## 9.9.9 —');
    assert.equal(notes.slice(start).includes('CodeQL'), false);
  });

  it('still says the other two admissions are untouched', async () => {
    /**
     * The arc asked for one sentence of three to stop being true, with a
     * measurement. A page that quietly let the other two lapse would be
     * claiming more than was measured.
     */
    const page = await medicine();
    assert.match(page, /no usage log of (its|this project's) own/);
    assert.match(page, /no outcome (is )?recorded/i);
  });
});

describe('the arc closes on a scoreboard that matches the page', () => {
  /**
   * The closing section grades three admissions. A grade that drifted from what
   * the page below still says would be this document claiming credit it did not
   * earn — the one failure it exists to catch, on its own last section.
   */
  const medicine = () => readFile(join(repoRoot, 'docs', 'our-own-medicine.md'), 'utf8');

  const rows = (text) => {
    const table = sectionOf(text, '## The arc closes on the number it could not produce');
    return [...table.matchAll(/^\| ([^|]+) \| \*\*([^*]+)\*\*/gm)].map((match) => ({
      admission: match[1].trim(),
      verdict: match[2].trim(),
    }));
  };

  it('grades exactly the three admissions, and exactly one has fallen', async () => {
    const graded = rows(await medicine());
    assert.equal(graded.length, 3, `the scoreboard grades ${graded.length} admissions, not three`);
    const fallen = graded.filter((row) => row.verdict.startsWith('No longer true'));
    assert.equal(
      fallen.length,
      1,
      `the arc claims ${fallen.length} admissions fell: ${fallen.map((r) => r.admission).join('; ')}`,
    );
  });

  it('and the two that stand are still stated below, not quietly dropped', async () => {
    const page = await medicine();
    const standing = sectionOf(page, '## What we cannot say about ourselves');
    assert.match(standing, /no usage log of (its|this project's) own/);
    assert.match(standing, /No outcome is recorded/i);
  });

  it('would notice a scoreboard that had promoted a second admission', () => {
    // Handed a table claiming two fell, the count must reject it.
    const table = [
      '## The arc closes on the number it could not produce',
      '',
      '| Admission | After the arc |',
      '|---|---|',
      '| One | **No longer true.** |',
      '| Two | **No longer true.** |',
      '| Three | **Still true, in full** |',
      '',
      '## Next',
    ].join('\n');
    const graded = [...sectionOf(table, '## The arc closes on the number it could not produce')
      .matchAll(/^\| ([^|]+) \| \*\*([^*]+)\*\*/gm)];
    assert.equal(graded.filter((m) => m[2].startsWith('No longer true')).length, 2);
  });
});
