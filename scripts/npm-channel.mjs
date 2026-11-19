#!/usr/bin/env node
/**
 * Which npm dist-tag a release run publishes under: `latest` or `next`.
 *
 *   node scripts/npm-channel.mjs        decide from package.json and the run
 *
 * Two channels, one rule each. A plain `MAJOR.MINOR.PATCH` publishes to
 * `latest`, which is what `npm install @trazum/cli` resolves. A
 * `MAJOR.MINOR.PATCH-next.N` publishes to `next`, which nobody gets without
 * asking for it (`npm install @trazum/cli@next`). Anything else is refused:
 * a version with another prerelease word, or build metadata, has no channel,
 * and guessing one is how a prerelease reaches everybody.
 *
 * **Why it is a script and not an expression in the workflow.** `npm publish`
 * with no `--tag` moves `latest` to whatever it uploads, prerelease or not,
 * and npm allows unpublishing for 72 hours and then the number is spent. The
 * decision is the one line between a test build and every stranger's install,
 * so it lives where a test can call it with every kind of input
 * (`npm-channel.test.js`), and `release.yml` reads its answer rather than
 * working one out again.
 *
 * **And a prerelease is never published from `main`.** A merge to main that
 * names a version the registry does not have publishes, with no further human
 * step; that is the stable release path. A `next` is cut on a branch and
 * published from its tag, so `main`'s manifests always name a stable version
 * and the record on main (CHANGELOG.md, RELEASES.md) always describes `latest`.
 * A prerelease version arriving on main is refused here, before the job that
 * holds the npm token starts.
 *
 * The answer is written to `GITHUB_OUTPUT` as `channel=latest` or
 * `channel=next`, one of two words this file wrote, never a value read from
 * the run.
 */
import { appendFileSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The two dist-tags this repository publishes under, and no others. */
export const CHANNELS = Object.freeze(['latest', 'next']);

const STABLE = /^\d+\.\d+\.\d+$/;
const NEXT = /^(\d+\.\d+\.\d+)-next\.(\d+)$/;

/** `latest` for a stable version, `next` for `X.Y.Z-next.N`; throws for anything else. */
export function channelOf(version) {
  if (typeof version !== 'string') throw new Error(`not a version: ${JSON.stringify(version)}`);
  if (STABLE.test(version)) return 'latest';
  if (NEXT.test(version)) return 'next';
  throw new Error(
    `${JSON.stringify(version)} has no channel: a release is MAJOR.MINOR.PATCH (latest) or MAJOR.MINOR.PATCH-next.N (next), and nothing else is published`,
  );
}

/** The stable version a `next` prerelease leads up to: `3.1.0` for `3.1.0-next.2`. */
export function baseOf(version) {
  const match = NEXT.exec(version);
  if (match) return match[1];
  if (STABLE.test(version)) return version;
  throw new Error(`${JSON.stringify(version)} is neither a release nor a next prerelease`);
}

/**
 * The version the repository's record describes, for a tree whose manifests
 * name `version`.
 *
 * On a release, the record and the manifests are the same number: the merge
 * that moves the manifests folds the changelog, writes the release notes and
 * the pricing dataset, and moves the install table. A `next` is cut on a
 * branch that never merges, so its tree keeps the record of the release on
 * `latest` (the newest `## X.Y.Z` heading of CHANGELOG.md) while its
 * manifests name the prerelease. The tests that hold a document to "the
 * current version" ask this, so a next's tree passes the same `verify` a
 * release's does, and a document is never moved to name a prerelease.
 */
export function recordedVersion(version, root = ROOT) {
  if (channelOf(version) === 'latest') return version;
  const released = readFileSync(join(root, 'CHANGELOG.md'), 'utf8').match(/^## (\d+\.\d+\.\d+)(?: |$)/m)?.[1];
  if (released === undefined) throw new Error('CHANGELOG.md names no released version for a next to follow');
  return released;
}

/**
 * The channel for one run, or a refusal.
 *
 * - `event`: `GITHUB_EVENT_NAME`. `workflow_dispatch` is a dry run and gets
 *   the channel it would publish to, so a dry run from a `next` branch says so.
 * - `ref`: `GITHUB_REF`. A push to `refs/heads/main` may only carry a stable
 *   version. A tag must name the version exactly, so `v3.1.0` cannot publish
 *   `3.1.0-next.1` and `v3.1.0-next.1` cannot publish `3.1.0`; the release job
 *   checks the same again before `verify`, and this answer comes first.
 */
export function decideChannel({ version, event, ref }) {
  const channel = channelOf(version);
  if (event === 'push' && ref === 'refs/heads/main' && channel !== 'latest') {
    throw new Error(
      `main names ${version}, a prerelease. A next is cut on a branch and published from its tag; main's manifests name the stable release. Nothing was published.`,
    );
  }
  if (event === 'push' && typeof ref === 'string' && ref.startsWith('refs/tags/')) {
    const tag = ref.slice('refs/tags/'.length);
    if (tag !== `v${version}`) {
      throw new Error(`the tag is ${tag} and the manifests name ${version}. Nothing was published.`);
    }
  }
  if (event === 'push' && ref !== 'refs/heads/main' && !(typeof ref === 'string' && ref.startsWith('refs/tags/'))) {
    throw new Error(`a push to ${ref} publishes nothing: only main and a v* tag release`);
  }
  return channel;
}

function main() {
  const version = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
  let channel;
  try {
    channel = decideChannel({ version, event: process.env.GITHUB_EVENT_NAME, ref: process.env.GITHUB_REF });
  } catch (error) {
    console.log(`::error::${error.message}`);
    return 1;
  }
  // Only ever one of CHANNELS: the value becomes `--tag` in a step that holds the npm token.
  if (!CHANNELS.includes(channel)) return 1;
  const path = process.env.GITHUB_OUTPUT;
  if (path) appendFileSync(path, `channel=${channel}\n`);
  console.log(
    channel === 'latest'
      ? `${version} publishes to latest: what npm install gives everybody.`
      : `${version} publishes to next only: npm install <package>@next. latest is not moved, and no GitHub release, files or MCP listing are made.`,
  );
  return 0;
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedDirectly) process.exit(main());
