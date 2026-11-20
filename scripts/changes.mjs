/**
 * The changelog's pending entries: one file per change under `changes/`.
 *
 * `CHANGELOG.md` passed a megabyte in 2026, and every pull request edited the
 * same `## Unreleased` section of it. Two open pull requests always met there,
 * and a merge of `main` after a release could drop an entry inside a released
 * version without a conflict (#666). A file per change cannot conflict with
 * another, and cannot land in a version that is already out (#847).
 *
 * **A fragment is `changes/<name>.<kind>.md`.** `<name>` is the issue it
 * resolves (`847`), with `-2`, `-3` for a second entry on the same issue, or a
 * short slug when there is no issue (`session-hook`). `<kind>` is one of
 * `KINDS`. The body is the entry as it will read in the changelog, without the
 * leading `- `: a bold first sentence, then what changed.
 *
 * **A release folds them in.** `scripts/prepare-release.mjs` writes them under
 * the new version's heading, grouped by kind in `KINDS` order and newest issue
 * first, and deletes the files. The site's changelog page shows the same fold
 * as what is pending. Nothing else writes `CHANGELOG.md`.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The folder, relative to the repository root. */
export const CHANGES_DIR = 'changes';

/** The kinds a fragment may have, in the order a release lists them, and the heading each gets. */
export const KINDS = [
  ['added', 'Added'],
  ['changed', 'Changed'],
  ['deprecated', 'Deprecated'],
  ['removed', 'Removed'],
  ['fixed', 'Fixed'],
  ['security', 'Security'],
];

const KIND_NAMES = KINDS.map(([kind]) => kind);

/** A fragment's file name: an issue number or a slug, an optional `-n`, a kind, `.md`. */
export const FRAGMENT = new RegExp(`^(?:(\\d+)(?:-(\\d+))?|([a-z][a-z0-9-]*))\\.(${KIND_NAMES.join('|')})\\.md$`);

/** What `CHANGELOG.md` says under `## Unreleased`, instead of the entries themselves. */
export const POINTER =
  'Pending changes are files in [`changes/`](changes/), one per change, and a release folds them in under its version. See [changes/README.md](changes/README.md).';

/**
 * Whether a path in the repository is a fragment, and if not, why.
 * `null` for a fragment; a sentence for a file in `changes/` that is not one;
 * `undefined` for a path outside `changes/`, or its README.
 */
export function fragmentProblem(path) {
  if (!path.startsWith(`${CHANGES_DIR}/`)) return undefined;
  const name = path.slice(CHANGES_DIR.length + 1);
  if (name === 'README.md') return undefined;
  if (name.includes('/')) return `${path}: a fragment sits directly in ${CHANGES_DIR}/, not in a folder below it`;
  if (!FRAGMENT.test(name)) {
    return `${path}: name it <issue>.<kind>.md, for example 847.added.md, where <kind> is one of ${KIND_NAMES.join(', ')}`;
  }
  return null;
}

/** What is wrong with a fragment's text, or `null`. */
export function bodyProblem(path, text) {
  const body = text.trim();
  if (body === '') return `${path}: the entry is empty`;
  if (/^#{1,6} /m.test(body)) return `${path}: an entry has no headings; the release writes the version and kind headings`;
  if (body.startsWith('- ')) return `${path}: write the entry without the leading "- "; the release adds it`;
  return null;
}

/** One fragment's parts, from its file name. */
export function parseName(name) {
  const match = FRAGMENT.exec(name);
  if (match === null) return null;
  const [, issue, nth, slug, kind] = match;
  return { name, kind, issue: issue === undefined ? null : Number(issue), nth: nth === undefined ? 1 : Number(nth), slug: slug ?? null };
}

/** Every fragment in the folder, parsed, with its text. Throws on a file that is not one. */
export function readFragments(root) {
  let names;
  try {
    names = readdirSync(join(root, CHANGES_DIR));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const fragments = [];
  for (const name of names.sort()) {
    if (name === 'README.md' || name.startsWith('.')) continue;
    const path = `${CHANGES_DIR}/${name}`;
    const problem = fragmentProblem(path);
    if (problem) throw new Error(problem);
    const text = readFileSync(join(root, path), 'utf8');
    const wrong = bodyProblem(path, text);
    if (wrong) throw new Error(wrong);
    fragments.push({ ...parseName(name), path, body: text.trim() });
  }
  return fragments;
}

/**
 * The fragments as a changelog section body: a `### Kind` heading per kind that
 * has any, in `KINDS` order, then one `- ` entry per fragment, newest issue
 * first, a slug after every issue, ties by name. Continuation lines keep their
 * own indentation, so a list inside an entry stays inside it. `''` for none.
 */
export function fold(fragments) {
  const order = (a, b) => {
    if (a.issue !== null && b.issue !== null && a.issue !== b.issue) return b.issue - a.issue;
    if (a.issue !== null && b.issue === null) return -1;
    if (a.issue === null && b.issue !== null) return 1;
    if (a.nth !== b.nth) return a.nth - b.nth;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  };
  const sections = [];
  for (const [kind, heading] of KINDS) {
    const entries = fragments.filter((fragment) => fragment.kind === kind).sort(order);
    if (entries.length === 0) continue;
    const lines = entries.map((fragment) => {
      const [first, ...rest] = fragment.body.split('\n');
      return [`- ${first}`, ...rest.map((line) => (line === '' ? '' : `  ${line}`))].join('\n');
    });
    sections.push(`### ${heading}\n\n${lines.join('\n')}`);
  }
  return sections.join('\n\n');
}
