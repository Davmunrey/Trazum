#!/usr/bin/env node
/**
 * Prints one version's section of RELEASES.md.
 *
 *   node scripts/release-notes.mjs 1.0.0
 *
 * Used by `.github/workflows/release.yml` to build the GitHub release body, so
 * the notes are written and reviewed in a pull request like everything else
 * rather than typed into a web form at the moment of releasing — which is the
 * moment least suited to writing anything carefully.
 *
 * Exits non-zero when the version has no section. That is deliberate: a release
 * whose notes were never written should fail loudly at the point of release, and
 * `publish.test.js` already refuses the same thing at the point of commit.
 *
 * No dependencies, like everything else here.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const version = process.argv[2]?.replace(/^v/, '');
if (!version) {
  console.error('usage: release-notes.mjs <version>');
  process.exit(2);
}

const releases = readFileSync(join(repoRoot, 'RELEASES.md'), 'utf8');

/**
 * The heading for a version, and everything until the next one.
 *
 * Headings look like `## 1.0.0 — "A stable contract"`, so the version is matched
 * with a boundary after it: without one, `1.0.0` would also match `1.0.10`.
 */
const heading = new RegExp(`^## ${version.replace(/\./g, '\\.')}(?![\\d.])`, 'm');
const start = releases.search(heading);
if (start === -1) {
  console.error(`RELEASES.md has no section for ${version}.`);
  console.error('Write the notes before tagging — see the top of that file for why.');
  process.exit(1);
}

const rest = releases.slice(start);
const nextHeading = rest.slice(1).search(/^## /m);
const section = nextHeading === -1 ? rest : rest.slice(0, nextHeading + 1);

// The `---` rule before the next section belongs to the layout of the file, not
// to these notes.
process.stdout.write(`${section.replace(/\n+---\s*$/, '').trimEnd()}\n`);
