#!/usr/bin/env node
/**
 * Prepare a release in one step: every version that moves in lockstep, the
 * changelog heading, and the Action pin.
 *
 *   node scripts/prepare-release.mjs 2.7.0            # write
 *   node scripts/prepare-release.mjs 2.7.0 --dry-run  # say what would change, change nothing
 *   node scripts/prepare-release.mjs --pin-only       # move the Action pin to the newest tag
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
 * What stays a person's job, printed at the end: the RELEASES.md section (its
 * "on npm at" line is moved here, being a version and nothing else) and
 * the ROADMAP entry (prose about what shipped), and the per-provider price
 * review (numbers only the providers' own pages can settle).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// PREPARE_RELEASE_ROOT points the script at a copy of the repository: the tests
// run it there for real, so a write that moves the wrong thing is caught.
const ROOT = process.env.PREPARE_RELEASE_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..');
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

/** Planned edits: path -> new text. Nothing is written until every one is computed. */
const edits = new Map();
const touched = [];
process.on('uncaughtException', (error) => {
  // A refusal is a sentence for the person preparing the release, not a stack trace.
  console.error(`prepare-release: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});

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

if (!pinOnly) {
  if (next === undefined) {
    console.error('Usage: node scripts/prepare-release.mjs <version> [--dry-run] | --pin-only');
    process.exit(2);
  }
  const from = parse(current);
  const to = parse(next);
  if (to === null) throw new Error(`"${next}" is not a version: use MAJOR.MINOR.PATCH, e.g. 2.7.0.`);
  if (from === null || !newer(to, from)) throw new Error(`${next} is not newer than the current ${current}.`);

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

  // The changelog: Unreleased becomes the version, and a fresh Unreleased opens above it.
  const changelog = read('CHANGELOG.md');
  if (!changelog.includes('\n## Unreleased\n')) throw new Error('CHANGELOG.md has no "## Unreleased" heading.');
  const day = new Date().toISOString().slice(0, 10);
  replace('CHANGELOG.md', '\n## Unreleased\n', `\n## Unreleased\n\nNo changes yet.\n\n## ${next} — ${day}\n`, 1);

  // The first line a stranger reads in the release notes names the version on npm.
  replace('RELEASES.md', `**All four packages are on npm at ${current}**`, `**All four packages are on npm at ${next}**`, 1);
}

/*
  The Action pin: every `Davmunrey/Trazum@<sha>  # <version>` in Markdown moves
  to the newest tag that exists. It is the newest commit a reader can be told
  to pin, and the docs-pin guard in security.test.js allows one release of lag.
*/
const tags = execFileSync('git', ['tag', '--list', 'v*'], { cwd: ROOT, encoding: 'utf8' })
  .split('\n')
  .map((tag) => tag.trim())
  .filter((tag) => parse(tag.slice(1)) !== null)
  .sort((a, b) => (newer(parse(a.slice(1)), parse(b.slice(1))) ? -1 : 1));
const newest = tags[0];
if (newest === undefined) {
  console.error('No v* tag in this clone: run git fetch --tags first. The pin was left alone.');
} else {
  const sha = execFileSync('git', ['rev-parse', `${newest}^{commit}`], { cwd: ROOT, encoding: 'utf8' }).trim();
  const label = newest.slice(1);
  const files = execFileSync('git', ['ls-files', '*.md'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter((path) => path !== '' && path !== 'CHANGELOG.md' && path !== 'RELEASES.md' && !path.startsWith('wiki/'));
  const PIN = /Davmunrey\/Trazum@([0-9a-f]{40})( {2}# )(\d+\.\d+\.\d+)/g;
  let moved = 0;
  for (const path of files) {
    const text = edits.get(path) ?? read(path);
    let changed = false;
    const updated = text.replace(PIN, (whole, pinned, gap, at) => {
      const atVersion = parse(at);
      if (pinned === sha || (atVersion !== null && !newer(parse(label), atVersion))) return whole;
      changed = true;
      moved += 1;
      return `Davmunrey/Trazum@${sha}${gap}${label}`;
    });
    if (changed) {
      edits.set(path, updated);
      touched.push(`${path} (Action pin -> ${label})`);
    }
  }
  if (moved === 0) console.error(`The Action pin already names ${newest} (${sha.slice(0, 7)}) wherever it appears.`);
}

for (const line of touched) console.error(`${dryRun ? 'would change' : 'changed'} ${line}`);
if (!dryRun) for (const [path, text] of edits) writeFileSync(join(ROOT, path), text, 'utf8');

if (!pinOnly) {
  console.error(`
${dryRun ? 'Dry run: nothing written.' : `Prepared ${current} -> ${next}.`} Still yours, because they are prose or prices:
  - RELEASES.md: a "## ${next}" section (the "on npm at" line has moved)
  - ROADMAP.md: what shipped, moved from Next to Released
  - Prices: re-read any provider whose review is older than 45 days (node scripts/freshness.mjs)
  - node scripts/build-wiki.mjs && node scripts/build-plugin-skill.mjs, then npm run verify`);
}
