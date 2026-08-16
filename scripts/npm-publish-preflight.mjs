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

import { appendFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
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
    // Validated here, once, so nothing downstream has to remember to. A manifest
    // that does not look like one stops the release rather than being sent to a
    // registry to find out.
    .map((manifest) => checkedPackage({ name: manifest.name, version: manifest.version }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** GitHub Actions annotations, so a finding surfaces without opening the log. */
const notice = (message) => console.log(`::notice::${message}`);
const warn = (message) => console.log(`::warning::${message}`);
const fail = (message) => console.log(`::error::${message}`);

/**
 * The job summary, which is where this actually gets read.
 *
 * **stdout was not enough and that was found the hard way.** This step runs
 * before `verify`, and `verify` prints thousands of lines of TAP output after
 * it — so the per-package verdicts and the token claims, the whole point of the
 * diagnostic, sit above a wall of test results. The GitHub logs API returns the
 * *tail* of a job, and thirty thousand lines of it still did not reach this
 * step. A diagnosis nobody can retrieve is not a diagnosis.
 *
 * The summary is a separate document, rendered at the top of the run page and
 * fetchable on its own. Same content, somewhere it can be found.
 *
 * Silently a no-op outside Actions, so the script still runs locally.
 */
function summary(markdown) {
  const path = process.env.GITHUB_STEP_SUMMARY;
  if (!path) return;
  try {
    appendFileSync(path, `${markdown}\n`);
  } catch {
    // A summary that cannot be written is not worth failing a release over.
  }
}

/**
 * A step output, for a decision the workflow has to make from what was found.
 *
 * Only ever called with values this file wrote — never with anything from the
 * registry — because a step output becomes a shell condition in the caller and
 * a value crossing that boundary is an injection surface, not a string.
 */
function output(key, value) {
  const path = process.env.GITHUB_OUTPUT;
  if (!path) return;
  try {
    appendFileSync(path, `${key}=${value}\n`);
  } catch {
    // Outside Actions, or a read-only path. The caller defaults to publishing.
  }
}

/**
 * A package name and a version, checked before either reaches a URL.
 *
 * **Both values come out of a file**, which is what CodeQL flagged and it was
 * right to. A manifest is trusted here by convention rather than by anything
 * enforced — it is whatever is on disk when the release runs — and this script
 * turns its contents into a request to a host that holds publish rights. So the
 * values are validated rather than assumed, on the same principle as
 * `checkedEndpoint` in `net.ts`: the boundary is where the check goes, and it
 * fails closed.
 *
 * These are deliberately narrower than npm's own rules. This repository
 * publishes three lower-case scoped packages at plain semver, and a preflight
 * that accepts more than it will ever see is surface for no benefit.
 */
const NPM_NAME = /^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function checkedPackage({ name, version }) {
  if (typeof name !== 'string' || !NPM_NAME.test(name)) {
    throw new Error(`refusing to build a URL from an implausible package name: ${JSON.stringify(name)}`);
  }
  if (typeof version !== 'string' || !SEMVER.test(version)) {
    throw new Error(`refusing to build a URL from an implausible version: ${JSON.stringify(version)}`);
  }
  return { name, version };
}

/**
 * The name as a single path segment.
 *
 * This was `name.replace('/', '%2f')`, which encodes the *first* slash and
 * leaves any others — the incomplete-escaping shape CodeQL raised as high, and
 * the same mistake `release-notes.mjs` made by building a regex out of a version
 * string. A scoped name has exactly one slash today, so it worked; hand-rolled
 * encoding that happens to be right is still hand-rolled encoding.
 *
 * `encodeURIComponent` encodes the `@` too. Both endpoints accept that — checked
 * against the live registry, `%40trazum%2Fcore` and `@trazum%2fcore` answer
 * identically — so there is nothing to preserve by being clever.
 *
 * **No test fails if you put the old version back**, and that is deliberate
 * rather than a gap. `checkedPackage` rejects any name with a second slash
 * before it gets here, so the two forms are equivalent for every input that
 * reaches them — a test that failed on the hand-rolled one would be enforcing a
 * preference, not a requirement. What guards this is CodeQL, which raised it as
 * high and runs on every pull request.
 */
const registryName = (name) => encodeURIComponent(name);

/**
 * Every URL this script fetches, built one way.
 *
 * The segments are encoded and the result is checked back against the
 * registry's own origin before it is returned. That second half is the part
 * worth having: encoding already stops a name reaching the path structure, and
 * the assertion means that if it ever did, the request does not leave rather
 * than leaving for somewhere else. A preflight that can be steered by a file
 * would be a worse bug than the one it exists to catch.
 */
function registryUrl(...segments) {
  const base = new URL(REGISTRY);
  const url = new URL(`${base.pathname.replace(/\/$/, '')}/${segments.join('/')}`, base);
  if (url.origin !== base.origin) {
    throw new Error(`refusing to fetch ${url.origin}, which is not ${base.origin}`);
  }
  return url;
}

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
 * What to type into npm, and whether the token agrees.
 *
 * "A claim does not match" names a category rather than a field and leaves the
 * reader comparing four settings against nothing. So the four fields npm matches
 * on get reported — but **the values printed come from the runner's own
 * environment, not from the token**, and that is the second thing CodeQL was
 * right about.
 *
 * The first fix sanitised the claim strings before writing them. That addressed
 * how they could rearrange a rendered summary and not the plainer fact underneath:
 * a value fetched over HTTP was being written to a file, and the check exists to
 * tell somebody what to configure. `GITHUB_REPOSITORY` and `GITHUB_WORKFLOW_REF`
 * answer that question from the runner, which is the authority on what this job
 * *is*; the token is a statement about it made elsewhere.
 *
 * So the token is reduced to one word per field — `agrees`, `differs`, `absent` —
 * computed here and never quoted. A disagreement is the interesting case and it is
 * still visible; what is not written is a string this process did not author.
 *
 * `absent` on `environment` is the single most useful line in the block: the claim
 * exists only when the job declares an environment, so an npm rule requiring
 * `release` can never match a token without it.
 *
 * **The token itself is never printed either way.** It is a bearer credential npm
 * would accept, and a public log is forever.
 */
const CLAIM_SAFE = /[^A-Za-z0-9/._@:+-]/g;

/** Environment values are this process's own, but a summary is still markdown. */
function safeClaim(value) {
  if (value === undefined || value === null || value === '') return '(unset)';
  const cleaned = String(value).replace(CLAIM_SAFE, '?');
  return cleaned.length > 200 ? `${cleaned.slice(0, 200)}…(truncated)` : cleaned;
}

/**
 * The fields npm matches on, each with where its expected value comes from.
 *
 * `environment` has no environment variable — GitHub does not expose one — so it
 * is reported by presence alone, which is the diagnostic that matters anyway.
 */
const MATCHED_FIELDS = [
  { claim: 'repository', from: 'GITHUB_REPOSITORY', label: 'Repository' },
  { claim: 'repository_owner', from: 'GITHUB_REPOSITORY_OWNER', label: 'Organization or user' },
  { claim: 'workflow_ref', from: 'GITHUB_WORKFLOW_REF', label: 'Workflow filename (inside this)' },
  { claim: 'environment', from: null, label: 'Environment' },
];

function describeToken(idToken) {
  let claims;
  try {
    const [, payload] = idToken.split('.');
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    // A token that will not decode is not a reason to say nothing about the rest.
    return '  (could not read the token claims)';
  }

  const lines = MATCHED_FIELDS.map(({ claim, from, label }) => {
    const present = claims[claim] !== undefined && claims[claim] !== null && claims[claim] !== '';
    if (!from) {
      // Presence only: computed here, so nothing from the token is quoted.
      return `    ${label}: ${present ? 'the token carries one' : 'ABSENT — a rule requiring it cannot match'}`;
    }
    const expected = process.env[from];
    // One word, computed. Never the claim's own text.
    const agreement = !present ? 'absent from the token' : claims[claim] === expected ? 'agrees' : 'DIFFERS from this run';
    return `    ${label}: ${safeClaim(expected)}  (token ${agreement})`;
  });

  return `  What npm must match, from this run's own environment:\n${lines.join('\n')}`;
}

/**
 * How npm answered, as one of a fixed set of words this file chose.
 *
 * **Nothing from the response is interpolated, and that is the point.** The
 * previous version built `rejected (${res.status})`, which put a number that
 * arrived over HTTP into a string that ends up in a rendered file — CodeQL's
 * "network data written to file", raised twice, and the second time after a fix
 * that had only addressed the claims. Narrowing it to an integer was not enough
 * and should not have been: the flow is the finding, not the shape of the value.
 *
 * So the status selects a label rather than becoming one. The unknown case keeps
 * its number, on stdout only, because a status nobody can see is a dead end for
 * whoever has to work out what happened — and stdout is a log, not a document
 * this file is composing.
 */
const VERDICT = {
  configured: 'configured',
  unauthorized: 'rejected (401)',
  forbidden: 'rejected (403)',
  notFound: 'rejected (404)',
  unknown: 'unknown',
};

/** Ask npm whether this token may publish one package. */
async function exchangeFor(name, idToken) {
  const endpoint = registryUrl('-', 'npm', 'v1', 'oidc', 'token', 'exchange', 'package', registryName(name));
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { authorization: `Bearer ${idToken}`, 'content-type': 'application/json' },
    body: '{}',
  });

  if (res.ok) return VERDICT.configured;
  // 404 is the one that misleads. npm answers a write you are not authorised for
  // with "not found", which reads as a missing package and is an auth failure.
  if (res.status === 401) return VERDICT.unauthorized;
  if (res.status === 403) return VERDICT.forbidden;
  if (res.status === 404) return VERDICT.notFound;
  // The number goes to the log, never into what gets written.
  console.log(`  npm answered ${String(Number(res.status) || 0)} for this package`);
  return VERDICT.unknown;
}

/**
 * Three outcomes, and the third is the point.
 *
 * `configured` — npm accepted the token for every package. The next tag publishes.
 * `rejected`   — npm refused at least one. The settings are wrong.
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

  /**
   * Every package, not the first one alphabetically.
   *
   * That was the original shape, on the reasoning that a misconfiguration is
   * all-or-nothing. It is not: the trusted publisher is configured per package,
   * on three separate settings pages, and doing two of them is the easiest
   * mistake available. Reporting `@trazum/cli` while saying nothing about the
   * other two answers the wrong question — and the release publishes core first,
   * so the package that fails first is not the one that was asked about.
   */
  const packages = publishablePackages();
  const verdicts = [];
  for (const { name } of packages) {
    try {
      verdicts.push([name, await exchangeFor(name, idToken)]);
    } catch (error) {
      warn(`Could not reach npm to verify ${name}: ${error.message}`);
      verdicts.push([name, VERDICT.unknown]);
    }
  }

  for (const [name, verdict] of verdicts) console.log(`  ${verdict.padEnd(22)}${name}`);
  summary(
    ['### npm trusted publishing', '', '| package | verdict |', '|---|---|']
      .concat(verdicts.map(([name, verdict]) => `| \`${name}\` | ${verdict} |`))
      .join('\n'),
  );

  const rejected = verdicts.filter(([, v]) => v.startsWith('rejected')).map(([name]) => name);
  const unknown = verdicts.filter(([, v]) => v === VERDICT.unknown).map(([name]) => name);

  if (rejected.length > 0) {
    warn(
      `npm refused the OIDC token for ${rejected.join(', ')}. ` +
        (rejected.length < packages.length
          ? 'Some packages are configured and some are not — the trusted publisher is set per ' +
            'package, on a separate settings page each. '
          : 'Trusted publishing is not configured, or a claim does not match. ') +
        'For each one: npm settings -> Publishing access -> Trusted publisher, with ' +
        'GitHub Actions, org Davmunrey, repo Trazum, workflow release.yml, environment ' +
        'release. The block below prints those values as this run sees them, and whether ' +
        'the token agrees with each. See docs/releasing.md. ' +
        'This check uses an endpoint npm does not document, so it only warns rather ' +
        'than blocking the release. It has been tested against a real publish once, ' +
        'on v1.9.1: it said rejected, the settings had just been filled in, and the ' +
        'publish failed the same way. Treat a rejection as real until it is wrong.',
    );
    const claims = describeToken(idToken);
    console.log(claims);
    summary(`\n**Compare these against what npm has:**\n\n\`\`\`\n${claims}\n\`\`\``);
    return 'rejected';
  }

  if (unknown.length > 0) {
    warn(`Could not verify trusted publishing for ${unknown.join(', ')}.`);
    return 'unknown';
  }

  notice(`npm trusted publishing is configured for all ${packages.length} packages. A tag will publish.`);
  return 'configured';
}

/** Whether `version` of `name` is already on the registry. */
async function alreadyPublished(name, version) {
  const res = await fetch(registryUrl(registryName(name), encodeURIComponent(version)), {
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

  /**
   * Every version already on the registry is a **finished** release, not a
   * collision.
   *
   * That state is reachable and 1.10.0 reached it: the trusted publisher refused
   * this workflow three tags running, the packages went out by hand, and the tag
   * was then the only thing missing. Failing here would have refused to create the
   * GitHub release for a version that had shipped, and — worse — the failure step
   * would have printed the authentication diagnosis, telling the reader to go fix
   * credentials that were not the problem. A wrong diagnosis is more expensive than
   * none.
   *
   * So the publish steps are skipped and the release goes ahead. Loudly: a release
   * that quietly did not publish is the flattering silence this repository refuses,
   * and these tarballs carry **no provenance attestation**, because provenance is
   * signed by the workflow that uploads and this workflow did not upload them.
   */
  if (spent.length === packages.length) {
    output('publish', 'false');
    notice(
      `All ${packages.length} versions are already on the registry, so this tag has nothing to ` +
        'upload and the publish steps are skipped. Those tarballs were published outside this ' +
        'workflow and therefore carry NO provenance attestation — a consumer cannot verify they ' +
        'were built from this repository. Record that in RELEASES.md. The GitHub release is still ' +
        'created, because the tag is what was missing.',
    );
    summary(
      '\n### Nothing to publish\n\nEvery version in this tag is already on the registry, so the ' +
        'publish steps were skipped and the GitHub release was created on its own.\n\n' +
        '> **These tarballs have no provenance attestation.** They did not come from this ' +
        'workflow, and provenance is signed by whatever uploads. `RELEASES.md` should say so.\n',
    );
    return 0;
  }

  /**
   * Some spent and some free is the dangerous shape, and the only one that fails.
   * The packages publish in dependency order, so this is what a half-finished
   * release looks like from the next tag: whatever uploaded has spent its number
   * for good, and npm never reuses one.
   */
  if (spent.length > 0) {
    fail(
      `Already on the registry, and npm never reuses a version: ${spent.join(', ')}. ` +
        `The other ${packages.length - spent.length} are free, so this is a half-finished release ` +
        'rather than a repeated tag. Bump every manifest to the next patch and tag again. ' +
        'Nothing was published.',
    );
    return 1;
  }

  output('publish', 'true');
  notice(`All ${packages.length} versions are free to publish.`);
  return 0;
}

const mode = process.argv[2];

if (mode === 'auth') {
  // Never non-zero: see the header. A dry run reports, a release publishes.
  await checkAuth();
  process.exit(0);
} else if (mode === 'claims') {
  /**
   * The same block again, at the end of a failed job.
   *
   * The auth check runs before `verify`, and `verify` prints thousands of lines
   * after it. GitHub's logs API returns the *tail* of a job, so the diagnosis was
   * unreachable three separate times while a release was actually failing — the
   * job summary fixed that for anyone on the run page and not for anyone reading
   * the log, which is where a failure gets read.
   *
   * So the failure step repeats it. A diagnosis printed where the reader is not
   * looking is the same as no diagnosis, and this one costs four lines.
   */
  let idToken = null;
  try {
    idToken = await githubIdToken();
  } catch {
    // Nothing to add; the publish error above is the story.
  }
  if (idToken) console.log(describeToken(idToken));
  process.exit(0);
} else if (mode === 'versions') {
  process.exit(await checkVersions());
} else {
  console.error('usage: npm-publish-preflight.mjs <auth|claims|versions>');
  process.exit(2);
}
