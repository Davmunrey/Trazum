#!/usr/bin/env node
/**
 * Prepare a release in one step: every version that moves in lockstep, the
 * changelog (the files in `changes/`, folded under the new version and
 * deleted), the pricing dataset and the Action pin.
 *
 *   node scripts/prepare-release.mjs 2.7.0            # write
 *   node scripts/prepare-release.mjs 2.7.0 --dry-run  # say what would change, change nothing
 *   node scripts/prepare-release.mjs --pin-only       # move the Action pin to the newest tag
 *   node scripts/prepare-release.mjs 3.1.0-next.1     # a `next` prerelease: the versions only
 *
 * Why it exists. `docs/releasing.md` listed these steps for a person to do by
 * hand, and each one has been missed at least once: a manifest left behind
 * (publish.test.js was written after the third), the MCP handshake version,
 * and the Action pin in the docs, which stayed at 2.5.1 through 2.5.2 and 2.6.0
 * until the docs-pin guard failed on every run and held every open pull
 * request red for three weeks. The pin cannot point at a release commit that
 * does not exist yet, but it can always point at the newest one that does,
 * and the guard allows exactly one release of lag: moving it to the newest
 * tag in every release PR keeps the docs inside that allowance forever,
 * with no follow-up PR to forget.
 *
 * It refuses rather than guesses: every replacement is counted, and a count
 * that differs from what the file is known to hold stops the run before
 * anything is written, naming the file. A layout that changed is a script to
 * update, not a release to cut with a version missing.
 *
 * It also refuses to prepare a release the npm token is recorded as unable
 * to upload. 2.7.10's release pull request merged on a day the token no
 * longer worked, and a merged release that cannot publish leaves `main`
 * naming a version npm does not have, with every later merge retrying the
 * upload. The date comes from `.github/release-credentials.json`; a dry run
 * says what a real run would refuse, and changes nothing either way.
 *
 * What stays a person's job, printed at the end: the RELEASES.md section (its
 * "on npm at" line is moved here, being a version and nothing else) and
 * the ROADMAP entry, moved into HISTORY.md (prose about what shipped), and the per-provider price
 * review (numbers only the providers' own pages can settle).
 *
 * A `next` prerelease (`MAJOR.MINOR.PATCH-next.N`, see `npm-channel.mjs`)
 * moves the versions that move in lockstep and nothing else. It is committed
 * on a branch and published from its tag under the `next` dist-tag; it never
 * merges, so the changelog, `RELEASES.md`, the pricing dataset and the Action
 * pin keep describing the release on `latest`, and this leaves them alone.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { POINTER, fold, readFragments } from './changes.mjs';
import { replaceBlock } from './install-snippets.mjs';
import { baseOf, channelOf, recordedVersion } from './npm-channel.mjs';
import { npmTokenStanding, recordedNpmTokenExpiry } from './npm-token-expiry.mjs';
import { datasetFiles, loadCatalogue } from './pricing-dataset.mjs';

// PREPARE_RELEASE_ROOT points the script at a copy of the repository: the tests
// run it there for real, so a write that moves the wrong thing is caught.
const ROOT = process.env.PREPARE_RELEASE_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..');
// The catalogue is always this checkout's, as built: a copy holds no build.
const CATALOGUE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const pinOnly = args.includes('--pin-only');
const next = args.find((arg) => !arg.startsWith('--'));

const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;
const parse = (version) => {
  const match = SEMVER.exec(version);
  if (match === null) return null;
  return match.slice(1).map(Number);
};
const newer = (a, b) => {
  for (let i = 0; i < 3; i += 1) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
};
/** `N` of `X.Y.Z-next.N`, or `null` for a stable version. */
const nextNumber = (version) => (/-next\.(\d+)$/.exec(version) ? Number(/-next\.(\d+)$/.exec(version)[1]) : null);
/**
 * Whether `to` comes after `from`, where either may be a `next` prerelease.
 * `3.1.0-next.1` comes after `3.0.1` and before `3.1.0`, as semver orders them.
 */
const after = (to, from) => {
  const [a, b] = [parse(baseOf(to)), parse(baseOf(from))];
  if (newer(a, b)) return true;
  if (newer(b, a)) return false;
  const [m, n] = [nextNumber(to), nextNumber(from)];
  if (m === null) return n !== null; // the release after its own prereleases
  return n !== null && m > n; // next.2 after next.1; never a prerelease of a version already released
};

/** Planned edits: path -> new text. Nothing is written until every one is computed. */
const edits = new Map();
const touched = [];
process.on('uncaughtException', (error) => {
  // A refusal is a sentence for the person preparing the release, not a stack trace.
  console.error(`prepare-release: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});

/** Files the release deletes: the changes it folded into the changelog. */
const removals = [];

function replace(path, from, to, expected) {
  const text = edits.get(path) ?? read(path);
  const count = text.split(from).length - 1;
  if (count !== expected) {
    throw new Error(`${path}: expected ${expected} occurrence(s) of ${JSON.stringify(from)}, found ${count}. The layout changed; update scripts/prepare-release.mjs rather than cutting a release with a version left behind.`);
  }
  edits.set(path, text.split(from).join(to));
  touched.push(`${path} (${expected}x ${from.trim()})`);
}

const current = JSON.parse(read('package.json')).version;
/** A `next` prerelease moves the lockstep versions and leaves the record alone. */
let prerelease = false;
const token = npmTokenStanding(recordedNpmTokenExpiry(ROOT));

if (!pinOnly) {
  if (next === undefined) {
    console.error('Usage: node scripts/prepare-release.mjs <version> [--dry-run] | --pin-only');
    process.exit(2);
  }
  let channel;
  try {
    channel = channelOf(next);
  } catch {
    throw new Error(`"${next}" is not a version: use MAJOR.MINOR.PATCH, e.g. 2.7.0, or MAJOR.MINOR.PATCH-next.N for the next channel.`);
  }
  if (!after(next, current)) throw new Error(`${next} is not newer than the current ${current}.`);
  prerelease = channel === 'next';

  // Before anything is planned: a release that cannot upload is not one to prepare.
  if (token.status === 'expired' || token.status === 'invalid') {
    const refusal = `${token.text}. A release merged now would verify, fail at the upload and leave main naming a version npm does not have.`;
    if (!dryRun) throw new Error(refusal);
    console.error(`A real run would stop here: ${refusal}`);
  }

  const version = (v) => `"version": "${v}"`;
  const core = (v) => `"@trazum/core": "${v}"`;
  // Every manifest that moves in lockstep, with how many times each holds the version.
  for (const path of ['package.json', 'packages/core/package.json', 'packages/tokenizer-openai/package.json', 'plugin/.claude-plugin/plugin.json']) {
    replace(path, version(current), version(next), 1);
  }
  for (const path of ['packages/cli/package.json', 'packages/mcp/package.json', 'apps/web/package.json', 'apps/vscode/package.json']) {
    replace(path, version(current), version(next), 1);
    replace(path, core(current), core(next), 1);
  }
  replace('packages/mcp/server.json', version(current), version(next), 2);
  replace('packages/mcp/src/index.ts', `version: '${current}'`, `version: '${next}'`, 1);
  // The Gemini CLI extension starts the server at the version the release publishes, and the install table in docs/agents.md says the same.
  replace('gemini-extension.json', version(current), version(next), 1);
  replace('gemini-extension.json', `@trazum/mcp@${current}`, `@trazum/mcp@${next}`, 1);
  // The install table tells a reader what to install, which a prerelease is not.
  if (!prerelease) {
    edits.set('docs/agents.md', replaceBlock(edits.get('docs/agents.md') ?? read('docs/agents.md'), { name: '@trazum/mcp', version: next }));
    touched.push('docs/agents.md (the install table, written by scripts/install-snippets.mjs)');
  }
  /*
    The lockfile is edited as JSON, entry by entry, never as text. A text
    replacement also moves any third-party package that happens to share the
    version: jiti sat at 2.7.0 on the day 2.7.0 was cut, so the next release
    would have rewritten a dependency nobody asked to change. npm writes the
    file as two-space JSON with a final newline, so the round trip is exact; a
    file that does not round-trip is refused rather than reformatted.
  */
  const lockText = read('package-lock.json');
  const lock = JSON.parse(lockText);
  if (`${JSON.stringify(lock, null, 2)}\n` !== lockText) {
    throw new Error('package-lock.json is not in the layout npm writes (two-space JSON, final newline); run npm install, then try again.');
  }
  if (lock.version !== current) throw new Error(`package-lock.json is at ${lock.version}, not ${current}.`);
  lock.version = next;
  let lockVersions = 1;
  let lockPins = 0;
  for (const [key, entry] of Object.entries(lock.packages ?? {})) {
    // The root's own entry and each workspace; never node_modules, never nested.
    if (key !== '' && !/^(packages|apps)\/[^/]+$/.test(key)) continue;
    if (entry.version !== current) throw new Error(`package-lock.json: ${key === '' ? 'the root entry' : key} is at ${entry.version}, not ${current}.`);
    entry.version = next;
    lockVersions += 1;
    if (entry.dependencies?.['@trazum/core'] !== undefined) {
      if (entry.dependencies['@trazum/core'] !== current) {
        throw new Error(`package-lock.json: ${key} pins @trazum/core ${entry.dependencies['@trazum/core']}, not ${current}.`);
      }
      entry.dependencies['@trazum/core'] = next;
      lockPins += 1;
    }
  }
  // The root twice and six workspaces; the four workspaces that pin core.
  if (lockVersions !== 8 || lockPins !== 4) {
    throw new Error(`package-lock.json: ${lockVersions} version(s) and ${lockPins} @trazum/core pin(s) found, 8 and 4 expected. The layout changed; update scripts/prepare-release.mjs rather than cutting a release with a version left behind.`);
  }
  edits.set('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);
  touched.push(`package-lock.json (${lockVersions}x version, ${lockPins}x @trazum/core, entry by entry)`);

  // The record below describes `latest`, and a prerelease never reaches main: see the header.
  if (!prerelease) await recordTheRelease();
}

/** CHANGELOG.md, RELEASES.md and the pricing dataset: what a release on `latest` adds to the record. */
async function recordTheRelease() {
  /*
    The changelog: the files in changes/ are folded under the new version's
    heading, below Unreleased, and deleted (#847). Unreleased keeps only its
    pointer to the folder; an entry written there instead is refused, since a
    release would otherwise publish it under the wrong version or drop it.
  */
  const changelog = read('CHANGELOG.md');
  const start = changelog.indexOf('\n## Unreleased\n');
  if (start === -1) throw new Error('CHANGELOG.md has no "## Unreleased" heading.');
  const end = changelog.indexOf('\n## ', start + 1);
  const body = changelog.slice(start + '\n## Unreleased\n'.length, end === -1 ? changelog.length : end).trim();
  if (body !== POINTER) {
    throw new Error('CHANGELOG.md has text under "## Unreleased" besides the pointer to changes/. Move each entry to a file in changes/ (changes/README.md) and run this again.');
  }
  const fragments = readFragments(ROOT);
  const day = new Date().toISOString().slice(0, 10);
  const notes = fragments.length === 0 ? 'No change was recorded in `changes/` for this release.' : fold(fragments);
  edits.set(
    'CHANGELOG.md',
    `${changelog.slice(0, start)}\n## Unreleased\n\n${POINTER}\n\n## ${next} — ${day}\n\n${notes}\n${end === -1 ? '' : changelog.slice(end)}`,
  );
  touched.push(`CHANGELOG.md (${fragments.length} change(s) from changes/ under ## ${next})`);
  for (const fragment of fragments) {
    removals.push(fragment.path);
    touched.push(`${fragment.path} (folded into CHANGELOG.md, deleted)`);
  }

  // The first line a stranger reads in the release notes names the version on npm.
  // From a next's tree the line names the release on latest, not the prerelease.
  replace('RELEASES.md', `**All four packages are on npm at ${recordedVersion(current, ROOT)}**`, `**All four packages are on npm at ${next}**`, 1);

  /*
    The pricing dataset the release publishes (#784): the catalogue as built,
    under the new version, with what changed since the last published one,
    and the changelog and schema beside it. From the built core, so a build
    older than the source is a document CI's test refuses; and never over a
    version already published with something else.
  */
  let catalogue;
  try {
    catalogue = await loadCatalogue(CATALOGUE_ROOT);
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : String(error)}: the pricing dataset of ${next} is written from it.`);
  }
  for (const [path, text] of Object.entries(datasetFiles(catalogue, { version: next, root: ROOT }))) {
    edits.set(path, text);
    touched.push(`${path} (the pricing dataset, written by scripts/pricing-dataset.mjs)`);
  }
}

/*
  The Action pin: every `TrazumAPP/Trazum@<sha>  # <version>` in Markdown moves
  to the newest tag that exists. It is the newest commit a reader can be told
  to pin, and the docs-pin guard in security.test.js allows one release of lag.
*/
const tags = execFileSync('git', ['tag', '--list', 'v*'], { cwd: ROOT, encoding: 'utf8' })
  .split('\n')
  .map((tag) => tag.trim())
  .filter((tag) => parse(tag.slice(1)) !== null)
  .sort((a, b) => (newer(parse(a.slice(1)), parse(b.slice(1))) ? -1 : 1));
const newest = tags[0];
if (prerelease) {
  // A prerelease is not a release a reader can be told to pin.
  console.error('A next prerelease leaves the Action pin where it is.');
} else if (newest === undefined) {
  console.error('No v* tag in this clone: run git fetch --tags first. The pin was left alone.');
} else {
  const sha = execFileSync('git', ['rev-parse', `${newest}^{commit}`], { cwd: ROOT, encoding: 'utf8' }).trim();
  const label = newest.slice(1);
  const files = execFileSync('git', ['ls-files', '*.md'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter((path) => path !== '' && path !== 'CHANGELOG.md' && path !== 'RELEASES.md' && !path.startsWith('wiki/') && !path.startsWith('changes/'));
  const PIN = /TrazumAPP\/Trazum@([0-9a-f]{40})( {2}# )(\d+\.\d+\.\d+)/g;
  let moved = 0;
  for (const path of files) {
    const text = edits.get(path) ?? read(path);
    let changed = false;
    const updated = text.replace(PIN, (whole, pinned, gap, at) => {
      const atVersion = parse(at);
      if (pinned === sha || (atVersion !== null && !newer(parse(label), atVersion))) return whole;
      changed = true;
      moved += 1;
      return `TrazumAPP/Trazum@${sha}${gap}${label}`;
    });
    if (changed) {
      edits.set(path, updated);
      touched.push(`${path} (Action pin -> ${label})`);
    }
  }
  if (moved === 0) console.error(`The Action pin already names ${newest} (${sha.slice(0, 7)}) wherever it appears.`);
}

for (const line of touched) console.error(`${dryRun ? 'would change' : 'changed'} ${line}`);
if (!dryRun) {
  for (const [path, text] of edits) {
    mkdirSync(dirname(join(ROOT, path)), { recursive: true });
    writeFileSync(join(ROOT, path), text, 'utf8');
  }
  for (const path of removals) rmSync(join(ROOT, path));
}

if (!pinOnly && prerelease) {
  console.error(`
${dryRun ? 'Dry run: nothing written.' : `Prepared ${current} -> ${next}, the versions only.`} A next is published from its tag and never merged:
  - npm run verify
  - commit on a branch that is not main (git switch -c next/${next}), signed off
  - git tag v${next} && git push origin v${next}
  - approve the Release run on the release environment; it publishes under the next dist-tag and leaves latest alone (docs/releasing.md, "A next prerelease")${token.status === 'ok' ? '' : `
  - ${token.text}`}`);
} else if (!pinOnly) {
  console.error(`
${dryRun ? 'Dry run: nothing written.' : `Prepared ${current} -> ${next}.`} Still yours, because they are prose or prices:
  - RELEASES.md: a "## ${next}" section (the "on npm at" line has moved)
  - ROADMAP.md and HISTORY.md: what shipped, moved from Next (ROADMAP.md) to Released (HISTORY.md)
  - Prices: re-read any provider whose review is older than 45 days (node scripts/freshness.mjs)
  - packaging/homebrew/trazum.rb: once npm serves the version, node scripts/homebrew-formula.mjs --version ${next}; it cannot be prepared before there is a tarball to hash (RELEASES.md)
  - node scripts/build-wiki.mjs && node scripts/build-plugin-skill.mjs, then npm run verify${token.status === 'ok' ? '' : `
  - ${token.text}`}`);
}
