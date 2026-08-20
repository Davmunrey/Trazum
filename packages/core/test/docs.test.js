import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, relative, resolve } from 'node:path';
import { describe, it } from 'node:test';

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
