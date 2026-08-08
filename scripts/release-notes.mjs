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

// Nothing below treats this as a pattern, so this is not a safety check — it is
// so `release-notes.mjs "1.0.0 --notes-file /etc/passwd"` fails with a sentence
// instead of reporting that the notes are missing.
if (!/^[0-9A-Za-z][0-9A-Za-z.\-+]*$/.test(version)) {
  console.error(`"${version}" is not a version number.`);
  process.exit(2);
}

const releases = readFileSync(join(repoRoot, 'RELEASES.md'), 'utf8');

/**
 * The heading for a version, and everything until the next one.
 *
 * Compared as strings, line by line, rather than by building a pattern from the
 * argument. The first version did
 * `new RegExp('^## ' + version.replace(/\./g, '\\.'))`, and CodeQL raised three
 * alerts on it that were all correct:
 *
 * - **Regex injection.** `version` is `process.argv[2]`. A value like `(((((`
 *   throws before the file is even read, and `(a+)+$` is a ReDoS pattern handed
 *   to a matcher. The operator supplies it, which is a reason it is unlikely and
 *   not a reason it is safe.
 * - **Incomplete escaping, twice.** Escaping `.` and not `\` is the classic
 *   half-done job: a version containing a backslash escapes the wrong thing.
 *
 * The real mistake was upstream of all three. A version number is not a pattern
 * and never needed to be one. This also makes the `1.0.0` versus `1.0.10`
 * boundary something you can see — the character after the version must be a
 * space or the end of the line — rather than a lookahead you have to trust.
 */
const HEADING = '## ';
const lines = releases.split('\n');
const wanted = lines.findIndex(
  (line) => line === `${HEADING}${version}` || line.startsWith(`${HEADING}${version} `),
);

if (wanted === -1) {
  console.error(`RELEASES.md has no section for ${version}.`);
  console.error('Write the notes before tagging — see the top of that file for why.');
  process.exit(1);
}

let end = lines.length;
for (let i = wanted + 1; i < lines.length; i++) {
  if (lines[i].startsWith(HEADING)) {
    end = i;
    break;
  }
}
const section = lines.slice(wanted, end).join('\n');

// The `---` rule before the next section belongs to the layout of the file, not
// to these notes.
process.stdout.write(`${section.replace(/\n+---\s*$/, '').trimEnd()}\n`);
