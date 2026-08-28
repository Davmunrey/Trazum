#!/usr/bin/env node
/**
 * Waits until npm actually serves every package this release just published.
 *
 * ## The gap this closes, found the hard way
 *
 * 1.83.0's release job reported success. `npm publish` printed
 * `+ @trazum/cli@1.83.0`, signed a provenance statement and wrote it to the
 * transparency log. Fifteen minutes later `@trazum/core` and `@trazum/mcp` --
 * published seconds apart in the same job -- were both being served at 1.83.0,
 * and `@trazum/cli` was still 1.82.0 on every endpoint the registry has.
 *
 * Nothing noticed, because nothing was looking. The workflow already waits for
 * npm to serve `@trazum/mcp`, and only because the MCP registry refuses a
 * listing whose package it cannot fetch. Core and the CLI had no such
 * downstream, so a release could report success while `npm install @trazum/cli`
 * gave a stranger the previous version and `RELEASES.md` told them otherwise.
 *
 * **A release is not the moment `npm publish` returns.** It is the moment a
 * stranger typing `npm install` gets what the notes say they will, and that is
 * what this asks.
 *
 * ## Why it waits rather than checks once
 *
 * `docs/releasing.md` has recorded since the first manual release that the
 * packument 404s for several minutes while `+ @trazum/x@1.2.3` is already on
 * screen. A single check right after publishing would fail on an ordinary day.
 * A fixed sleep would be the obvious fix and the wrong one: too short and the
 * race comes back on a slow day, too long and every release waits for the worst
 * case. This asks the registry directly and stops as soon as the answer is yes.
 *
 * ## What it checks, and what it deliberately does not
 *
 * That the **dist-tag** `latest` names the version being published, per
 * package, read from the registry rather than from the packument's cache-prone
 * `versions` map. A version that exists but is not `latest` is not what a
 * stranger installs, and that distinction is the whole point of the check.
 *
 * It does not verify the tarball's contents. `publish.test.js` does that
 * against the commit, before anything is uploaded, which is the only moment it
 * can still be changed.
 *
 * Usage: node scripts/npm-serves.mjs
 *
 * Environment:
 *   NPM_SERVES_TIMEOUT_MS   how long to keep asking (default 600000)
 *   NPM_SERVES_INTERVAL_MS  how long to wait between asks (default 15000)
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Every workspace npm would upload, expanded from the root `workspaces` globs.
 *
 * Derived rather than listed, for the reason `publish.test.js` derives the same
 * set: a fourth package added later and not added here would be a package this
 * check is silently blind to, which is the shape of defect the check exists to
 * catch.
 */
export function publishablePackages(root = repoRoot) {
  const rootManifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  return rootManifest.workspaces
    .flatMap((pattern) => {
      const parent = pattern.replace(/\/\*$/, '');
      return readdirSync(join(root, parent), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => join(parent, entry.name))
        .filter((dir) => existsSync(join(root, dir, 'package.json')));
    })
    .map((dir) => JSON.parse(readFileSync(join(root, dir, 'package.json'), 'utf8')))
    .filter((manifest) => manifest.private !== true)
    .map((manifest) => ({ name: manifest.name, version: manifest.version }));
}

/** What the registry currently calls `latest` for one package, or `null`. */
export async function servedVersion(name, fetchImpl = fetch) {
  /*
   * The dist-tags endpoint rather than the packument. It is small, it is the
   * value `npm install` resolves, and it is not the document that stays cached
   * with a stale `versions` map after a publish.
   */
  const url = `https://registry.npmjs.org/-/package/${encodeURIComponent(name)}/dist-tags`;
  const response = await fetchImpl(url, { headers: { 'cache-control': 'no-cache' } });
  if (!response.ok) return null;
  const tags = await response.json();
  return typeof tags.latest === 'string' ? tags.latest : null;
}

/**
 * The wait itself, behind a main check.
 *
 * Without one, importing this file to test the two functions above **runs the
 * whole loop and talks to the registry** -- which the first version did, and
 * which the suite caught by finishing suspiciously fast with the script's own
 * output in it. This repository promises its tests reach no network, and a
 * test file that quietly made three HTTPS calls is that promise broken in the
 * place least likely to be looked at.
 */
async function main() {
  const timeoutMs = Number(process.env.NPM_SERVES_TIMEOUT_MS ?? 600_000);
  const intervalMs = Number(process.env.NPM_SERVES_INTERVAL_MS ?? 15_000);

  const wanted = publishablePackages();
  if (wanted.length === 0) {
    console.error('::error::no publishable packages found — has the workspace layout moved?');
    process.exit(1);
  }

  const deadline = Date.now() + timeoutMs;
  const pending = new Map(wanted.map((pkg) => [pkg.name, pkg.version]));

  console.log(`Waiting for npm to serve ${wanted.map((p) => `${p.name}@${p.version}`).join(', ')}`);

  while (pending.size > 0) {
    for (const [name, version] of [...pending]) {
      const served = await servedVersion(name).catch(() => null);
      if (served === version) {
        console.log(`  ${name} is served at ${version}`);
        pending.delete(name);
      } else {
        console.log(`  ${name} is served at ${served ?? 'nothing'}, waiting for ${version}`);
      }
    }
    if (pending.size === 0) break;

    if (Date.now() >= deadline) {
      for (const [name, version] of pending) {
        /*
         * An error rather than a warning, and the job fails. The packages are
         * already uploaded and cannot be taken back after 72 hours, so the only
         * useful thing left is that somebody is told: `RELEASES.md` now claims
         * a version is on npm that a stranger cannot install.
         */
        console.error(
          `::error::npm is not serving ${name}@${version} as latest after ${Math.round(timeoutMs / 1000)}s.` +
            ' The publish was accepted and the registry has not made it installable.',
        );
      }
      process.exit(1);
    }

    await new Promise((resolve_) => setTimeout(resolve_, intervalMs));
  }

  console.log('Every published package is being served.');
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedDirectly) await main();
