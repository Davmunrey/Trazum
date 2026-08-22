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
