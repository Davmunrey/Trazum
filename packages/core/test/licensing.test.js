import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { sectionOf } from '../../../test-utils/section.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const licensing = readFileSync(join(repoRoot, 'docs/licensing.md'), 'utf8');

/**
 * docs/licensing.md answers, for somebody deciding whether to depend on this,
 * what is open and what is not. The list of what is open is the part that goes
 * stale, and this repository has the receipts for that: 1.51.2, 1.53.2, 1.53.3
 * and 1.60.3 were each a hand-typed fact drifting away from the code.
 *
 * So the list is derived here rather than trusted there. A package added to
 * this repository and not named on that page fails the build, which is the
 * only version of this promise that survives contact with a year of commits.
 */

/** Every package under `packages/` that npm would actually publish. */
const publishablePackages = () =>
  readdirSync(join(repoRoot, 'packages'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(repoRoot, 'packages', entry.name, 'package.json'))
    .filter((path) => existsSync(path))
    .map((path) => JSON.parse(readFileSync(path, 'utf8')))
    .filter((manifest) => manifest.private !== true);

/**
 * The surfaces that ship without being npm packages. Each is a directory this
 * repository publishes some other way: a GitHub Action consumed by SHA, a
 * deployed site, a Claude Code plugin installed from a marketplace. The
 * existence assertion below is what stops this list becoming a list of
 * directories that used to be here.
 */
const SHIPPING_SURFACES = ['action', 'apps/web', 'plugin'];

describe('docs/licensing.md names everything this repository ships', () => {
  it('finds packages at all, so this guard cannot pass by finding none', () => {
    const found = publishablePackages();
    assert.ok(
      found.length >= 3,
      `expected the published packages, found ${found.length}. Has the layout changed?`,
    );
  });

  it('names every publishable package', () => {
    const missing = publishablePackages()
      .map((manifest) => manifest.name)
      .filter((name) => !licensing.includes(name));
    assert.deepEqual(
      missing,
      [],
      `published but not named in docs/licensing.md: ${missing.join(', ')}. A reader deciding whether to depend on this would not learn it exists.`,
    );
  });

  it('names every shipping surface, and every named surface exists', () => {
    for (const surface of SHIPPING_SURFACES) {
      assert.ok(
        existsSync(join(repoRoot, surface)),
        `${surface} is named here and is not in the repository. Remove it from this guard, and from the page.`,
      );
      assert.ok(
        licensing.includes(surface),
        `${surface} ships and is not named in docs/licensing.md`,
      );
    }
  });

  it('every publishable package really declares the licence the page claims', () => {
    // The page says MIT. That has to be a fact about the manifests, not about
    // somebody's memory of them, or the page is telling a stranger something
    // `npm install` does not agree with.
    for (const manifest of publishablePackages()) {
      assert.equal(
        manifest.license,
        'MIT',
        `${manifest.name} declares ${manifest.license ?? 'no licence'}, and docs/licensing.md says MIT`,
      );
    }
    assert.ok(licensing.includes('MIT'), 'docs/licensing.md no longer names a licence');
  });

  it('keeps the three promises that make the page worth reading', () => {
    /**
     * A page that lists packages and stops is an inventory. The reason this
     * one exists is the three sentences a reader cannot get from LICENSE:
     * what will not move out, what was never in, and what the licence never
     * covered. Each is pinned by the shape of its claim rather than by its
     * wording, so the prose can be rewritten and the promise cannot quietly
     * disappear with it.
     */
    assert.match(
      licensing,
      /will move out of the open\s+set/i,
      'the page no longer promises that today\'s analysis stays open',
    );
    assert.match(
      licensing,
      /ships proprietary from its first commit/i,
      'the page no longer says a hosted service would be new code rather than code moved out',
    );
    assert.match(
      licensing,
      /has never covered the right\s+to call something else Trazum/i,
      'the page no longer reserves the name',
    );
  });

  it('is reachable from the section a deciding reader actually reads', () => {
    /**
     * docs.test.js already asserts every file in docs/ is linked from the
     * index. This asserts the stronger thing: that it is linked from the
     * section for somebody deciding whether to depend on this, who is the
     * only reader who comes looking for it.
     *
     * Bounded with `sectionOf`, not by naming the heading that follows. The
     * first draft of this test named it, and publish.test.js caught that on
     * the commit that tracked the file: `git ls-files` is what that guard
     * walks, so an untracked test is invisible to it and the rule only bites
     * once the file is staged. The failure it prevents has now recurred ten
     * times in this repository, and this is the tenth.
     */
    const index = readFileSync(join(repoRoot, 'docs/README.md'), 'utf8');
    const section = sectionOf(index, '## I am deciding whether to use this');
    assert.ok(
      section.includes('licensing.md'),
      'docs/licensing.md is not linked from the section for somebody deciding whether to depend on this',
    );
  });
});
