#!/usr/bin/env node
/**
 * The Homebrew formula for the CLI, written from what npm serves and never by
 * hand.
 *
 *   node scripts/homebrew-formula.mjs --version 2.7.12           fetch, check, write
 *   node scripts/homebrew-formula.mjs --version 2.7.12 --tarball cli-2.7.12.tgz
 *                                                                 use a file you already have
 *   node scripts/homebrew-formula.mjs --version 2.7.12 --stdout   print instead of writing
 *
 * The formula lives in `packaging/homebrew/trazum.rb` and is copied by the
 * owner into the tap repository, `Davmunrey/homebrew-trazum`, under
 * `Formula/trazum.rb`. Nothing in this repository pushes it there: that would
 * need a token `docs/compliance/secret-rotation.md` does not cover, and
 * #781 forbids asking for one. `RELEASES.md` names the manual step.
 *
 * **Exact, not "latest".** The formula names one version, the registry's own
 * URL for that version's tarball, and the SHA-256 of that tarball. The pattern
 * is the one `docs.brew.sh` gives npm CLIs: `depends_on "node"` and
 * `std_npm_args`, which installs the package into `libexec` with install
 * scripts off. It adds no dependency of its own: the tarball's one
 * dependency is `@trazum/core`, which npm resolves at the exact version the
 * CLI pins.
 *
 * **The checksum is computed here, from the bytes.** When the tarball is
 * fetched, its `sha512` integrity is compared with the one the registry's
 * metadata publishes for that version first, so a truncated or substituted
 * download stops the script instead of becoming a formula.
 * `test/homebrew-formula.test.mjs` holds the text to a fixture tarball without
 * a network.
 *
 * **Not before npm's packages are a day old.** Homebrew's `std_npm_args` runs
 * npm with `--min-release-age=1`, so npm refuses any version published less
 * than a day before the install. The formula's own tarball is downloaded by
 * Homebrew, but `@trazum/core` is resolved by npm, and on 2026-11-19 the 3.0.1
 * formula failed on a Mac with `ETARGET: No matching version found for
 * @trazum/core@3.0.1 with a date before ...`: the tap had moved to 3.0.1 seven
 * hours after npm published it. When it fetches from the registry, the script
 * reads the publish time of the CLI and of every `@trazum/` dependency it pins,
 * and refuses to write a formula before the youngest is a day old, naming the
 * moment it can.
 *
 * No dependencies, like everything else here.
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const FORMULA_PATH = 'packaging/homebrew/trazum.rb';

const PACKAGE = '@trazum/cli';
/** The CLI's own `homepage`, read from its manifest rather than written here a second time. */
const HOMEPAGE = JSON.parse(readFileSync(join(ROOT, 'packages/cli/package.json'), 'utf8')).homepage;
const REGISTRY = 'https://registry.npmjs.org';

/** What `x.y.z` may be: three plain numbers, so nothing floating gets into a URL or a version line. */
export const EXACT = /^(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3})$/;

/** The registry's address for one version's tarball. */
export const tarballUrl = (version) => `${REGISTRY}/${PACKAGE}/-/cli-${version}.tgz`;

export const sha256Of = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const integrityOf = (bytes) => `sha512-${createHash('sha512').update(bytes).digest('base64')}`;

/** How old every npm package the formula installs must be: Homebrew's `--min-release-age=1`, one day. */
export const MIN_RELEASE_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Why a formula may not be written yet, or `null` when it may. `published`
 * lists each package the install resolves from npm, with its publish time;
 * the answer names the youngest and the moment it turns a day old.
 */
export function tooYoung(published, now = Date.now()) {
  let youngest = null;
  for (const entry of published) {
    const at = Date.parse(entry.time);
    if (Number.isNaN(at)) return `npm gives no publish time for ${entry.name}@${entry.version}`;
    if (youngest === null || at > youngest.at) youngest = { ...entry, at };
  }
  if (youngest === null || now - youngest.at >= MIN_RELEASE_AGE_MS) return null;
  const ready = new Date(youngest.at + MIN_RELEASE_AGE_MS).toISOString();
  return `${youngest.name}@${youngest.version} was published at ${new Date(youngest.at).toISOString()}; Homebrew installs with npm --min-release-age=1, so the formula cannot install before ${ready}. Run this again after then.`;
}

/** The formula for `version`, whose tarball hashes to `sha256`. Throws on anything that is not exact. */
export function formula({ version, sha256 }) {
  if (!EXACT.test(version)) throw new Error(`${JSON.stringify(version)} is not an exact version`);
  if (!/^[0-9a-f]{64}$/.test(sha256)) throw new Error(`${JSON.stringify(sha256)} is not a SHA-256 digest`);
  return `# Written by scripts/homebrew-formula.mjs from the tarball npm serves. Not edited by hand.
class Trazum < Formula
  desc "Prices AI agent usage from the logs on this machine, offline"
  homepage "${HOMEPAGE}"
  url "${tarballUrl(version)}"
  sha256 "${sha256}"
  license "MIT"

  depends_on "node"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink libexec.glob("bin/*")
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/trazum --version")
  end
end
`;
}

/** The two facts a formula states, read back from its text; `null` for a field it does not carry once. */
export function readFormula(text) {
  const once = (pattern) => {
    const found = [...text.matchAll(pattern)];
    return found.length === 1 ? found[0][1] : null;
  };
  const url = once(/^ {2}url "([^"]+)"$/gm);
  return { url, sha256: once(/^ {2}sha256 "([^"]+)"$/gm), version: url === null ? null : (/\/cli-([^/]+)\.tgz$/.exec(url)?.[1] ?? null) };
}

/** The formula for a tarball you hold: its digest is computed here, from the bytes. */
export function formulaFromTarball({ version, bytes }) {
  return formula({ version, sha256: sha256Of(bytes) });
}

/** When npm published `name@version`, from the package document's `time` map. */
async function publishTime(name, version) {
  const response = await fetch(`${REGISTRY}/${name.replaceAll('/', '%2f')}`);
  if (!response.ok) throw new Error(`npm has no ${name} (${response.status})`);
  return (await response.json()).time?.[version];
}

async function fetchTarball(version) {
  const meta = await fetch(`${REGISTRY}/${PACKAGE}/${version}`);
  if (!meta.ok) throw new Error(`npm has no ${PACKAGE}@${version} (${meta.status})`);
  const published = await meta.json();
  if (published.dist?.tarball !== tarballUrl(version)) {
    throw new Error(`npm serves ${PACKAGE}@${version} from ${published.dist?.tarball}, not from ${tarballUrl(version)}`);
  }
  const ages = [{ name: PACKAGE, version, time: await publishTime(PACKAGE, version) }];
  for (const [name, range] of Object.entries(published.dependencies ?? {})) {
    if (name.startsWith('@trazum/')) ages.push({ name, version: range, time: await publishTime(name, range) });
  }
  const refusal = tooYoung(ages);
  if (refusal !== null) throw new Error(refusal);
  const response = await fetch(published.dist.tarball);
  if (!response.ok) throw new Error(`the tarball is not served (${response.status})`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (integrityOf(bytes) !== published.dist.integrity) {
    throw new Error(`the tarball's sha512 is ${integrityOf(bytes)} and the registry says ${published.dist.integrity}`);
  }
  return bytes;
}

async function main() {
  const args = process.argv.slice(2);
  const value = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
  const version = value('--version');
  if (version === undefined) {
    console.error('usage: node scripts/homebrew-formula.mjs --version X.Y.Z [--tarball FILE] [--stdout]');
    process.exit(2);
  }
  const tarball = value('--tarball');
  const bytes = tarball === undefined ? await fetchTarball(version) : readFileSync(tarball);
  const text = formulaFromTarball({ version, bytes });
  if (args.includes('--stdout')) {
    process.stdout.write(text);
    return;
  }
  writeFileSync(join(ROOT, FORMULA_PATH), text);
  console.error(`${FORMULA_PATH}: ${PACKAGE}@${version}, sha256 ${sha256Of(bytes)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
