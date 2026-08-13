#!/usr/bin/env node
/**
 * The two questions worth asking before `npm publish`, rather than after.
 *
 * **Why this exists.** 1.9.0 was tagged, ran every check green, and then failed
 * on the last step with `E404 Not Found - PUT https://registry.npmjs.org/@trazum%2fcore`.
 * The trusted publisher had not been configured, so the OIDC token had nothing
 * to authenticate against — and npm reports that as a 404, indistinguishable
 * from "no such package". Nothing was published, but the tag was spent and the
 * release went out by hand for the second time running, which means no
 * provenance for the second time running.
 *
 * Both of those were knowable before the publish, and neither was checked.
 *
 * ## `auth` — can this workflow authenticate at all?
 *
 * Asks npm's OIDC token-exchange endpoint the same question `npm publish` asks
 * it: here is a GitHub-signed token, would you let it publish this package? A
 * `200` means every claim matched — organisation, repository, workflow filename
 * and, the one people leave blank, the environment.
 *
 * **This never fails the job, on purpose, and the reason is worth stating.** The
 * exchange endpoint is npm's own internal plumbing rather than a documented API.
 * If npm moves it, a gate built on it would block releases that would have
 * worked, which is a worse failure than the one it prevents. So it reports:
 * green in a dry run means the next tag will publish, and a warning means look
 * at the settings before tagging. The authority on whether a publish works is
 * still the publish.
 *
 * The other half of its value is that `workflow_dispatch` can now answer this.
 * Before, a dry run proved the environment gate existed and nothing about npm,
 * so the only way to test a trusted publisher was to spend a version number on
 * it.
 *
 * ## `versions` — is any of these numbers already spent?
 *
 * npm allows unpublishing for 72 hours and then a version can never be reused,
 * even for identical content. The packages publish in dependency order, so a
 * half-finished release is the expensive shape: `@trazum/core` uploads, the CLI
 * fails, and core's number is gone — the whole set has to move to the next
 * patch.
 *
 * Checking all three first turns that into a clean abort. This one **does** fail
 * the job, because it reads the public registry API rather than internal
 * plumbing, and because a version that already exists is not a maybe.
 *
 * Both checks read the workspace list from the root `workspaces` globs rather
 * than a list typed here, for the same reason `publish.test.js` does: a list
 * typed once did not mention `packages/mcp` for the whole day that package
 * existed.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY = process.env.TRAZUM_NPM_REGISTRY ?? 'https://registry.npmjs.org';

/**
 * The audience npm's registry expects on a GitHub OIDC token.
 *
 * Overridable because it is the one value here that could change without this
 * repository noticing, and a wrong audience produces "could not verify" rather
 * than a false accusation — see `checkAuth`.
 */
const AUDIENCE = process.env.TRAZUM_NPM_OIDC_AUDIENCE ?? 'npm:registry.npmjs.org';

const manifestOf = (dir) => JSON.parse(readFileSync(join(repoRoot, dir, 'package.json'), 'utf8'));

/** Every workspace the root globs expand to, filtered to the ones npm uploads. */
function publishablePackages() {
  const workspaces = manifestOf('.').workspaces.flatMap((pattern) => {
    const parent = pattern.replace(/\/\*$/, '');
    return readdirSync(join(repoRoot, parent), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => `${parent}/${entry.name}`)
      .filter((pkg) => existsSync(join(repoRoot, pkg, 'package.json')));
  });

  return workspaces
    .map((dir) => manifestOf(dir))
    .filter((manifest) => manifest.private !== true)
    .map((manifest) => ({ name: manifest.name, version: manifest.version }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** GitHub Actions annotations, so a finding lands on the run summary. */
const notice = (message) => console.log(`::notice::${message}`);
const warn = (message) => console.log(`::warning::${message}`);
const fail = (message) => console.log(`::error::${message}`);

/** npm wants the scope slash encoded, and `encodeURIComponent` leaves it alone. */
const registryName = (name) => name.replace('/', '%2f');

/**
 * The GitHub-signed token, or `null` when this is not running with
 * `id-token: write`.
 *
 * Absence is a real finding rather than a reason to skip quietly: without it
 * `npm publish --provenance` cannot work either, so a workflow missing the
 * permission would fail at the publish step for a reason that looks like npm's
 * fault.
 */
async function githubIdToken() {
  const url = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const runnerToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!url || !runnerToken) return null;

  const res = await fetch(`${url}&audience=${encodeURIComponent(AUDIENCE)}`, {
    headers: { authorization: `Bearer ${runnerToken}` },
  });
  if (!res.ok) throw new Error(`GitHub refused to mint an OIDC token (${res.status})`);
  const body = await res.json();
  if (!body.value) throw new Error('GitHub returned no token value');
  return body.value;
}

/**
 * Three outcomes, and the third is the point.
 *
 * `configured` — npm accepted the token. The next tag publishes.
 * `rejected`   — npm refused it definitively. The settings are wrong.
 * `unknown`    — anything else. Say so; do not guess either way.
 */
async function checkAuth() {
  let idToken;
  try {
    idToken = await githubIdToken();
  } catch (error) {
    warn(`Could not verify npm trusted publishing: ${error.message}`);
    return 'unknown';
  }

  if (idToken === null) {
    warn(
      'No OIDC token available — this job is running without `id-token: write`. ' +
        'Trusted publishing and `--provenance` both need it.',
    );
    return 'rejected';
  }

  // Asked about the first package alphabetically rather than all three: the
  // trusted publisher is configured per package, but a misconfiguration is
  // almost always all-or-nothing, and one request is enough to answer "has this
  // been set up at all" — the question that actually goes unanswered.
  const [first] = publishablePackages();
  const endpoint = `${REGISTRY}/-/npm/v1/oidc/token/exchange/package/${registryName(first.name)}`;

  let res;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: { authorization: `Bearer ${idToken}`, 'content-type': 'application/json' },
      body: '{}',
    });
  } catch (error) {
    warn(`Could not reach npm to verify trusted publishing: ${error.message}`);
    return 'unknown';
  }

  if (res.ok) {
    notice(`npm trusted publishing is configured for ${first.name}. A tag will publish.`);
    return 'configured';
  }

  // 404 is the one that misleads. npm answers a write you are not authorised for
  // with "not found", which reads as a missing package and is an auth failure.
  if ([401, 403, 404].includes(res.status)) {
    warn(
      `npm refused the OIDC token for ${first.name} (${res.status}). ` +
        'Trusted publishing is not configured, or a claim does not match. On each of ' +
        'the published packages, npm settings -> Publishing access -> Trusted publisher: ' +
        'GitHub Actions, org Davmunrey, repo Trazum, workflow release.yml, ' +
        'environment release. The environment field is the one that is easy to leave ' +
        'blank and it is not optional. See docs/releasing.md.',
    );
    return 'rejected';
  }

  warn(`npm answered the token exchange with ${res.status}; could not verify trusted publishing.`);
  return 'unknown';
}

/** Whether `version` of `name` is already on the registry. */
async function alreadyPublished(name, version) {
  const res = await fetch(`${REGISTRY}/${registryName(name)}/${version}`, {
    headers: { accept: 'application/json' },
  });
  if (res.status === 404) return false;
  if (res.ok) return true;
  throw new Error(`registry answered ${res.status} for ${name}@${version}`);
}

async function checkVersions() {
  const packages = publishablePackages();
  const spent = [];

  for (const { name, version } of packages) {
    let taken;
    try {
      taken = await alreadyPublished(name, version);
    } catch (error) {
      // Unreachable registry is not evidence a version is free, and publishing
      // on that assumption is the mistake this exists to prevent.
      fail(`Could not check whether ${name}@${version} exists: ${error.message}`);
      return 1;
    }
    console.log(`  ${taken ? 'TAKEN' : 'free '}  ${name}@${version}`);
    if (taken) spent.push(`${name}@${version}`);
  }

  if (spent.length > 0) {
    fail(
      `Already on the registry, and npm never reuses a version: ${spent.join(', ')}. ` +
        'Bump every manifest to the next patch and tag again. Nothing was published.',
    );
    return 1;
  }

  notice(`All ${packages.length} versions are free to publish.`);
  return 0;
}

const mode = process.argv[2];

if (mode === 'auth') {
  // Never non-zero: see the header. A dry run reports, a release publishes.
  await checkAuth();
  process.exit(0);
} else if (mode === 'versions') {
  process.exit(await checkVersions());
} else {
  console.error('usage: npm-publish-preflight.mjs <auth|versions>');
  process.exit(2);
}
