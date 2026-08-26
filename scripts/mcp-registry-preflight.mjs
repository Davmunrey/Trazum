#!/usr/bin/env node
/**
 * Waits until npm actually serves the version the MCP registry is about to be
 * told about.
 *
 * The registry hosts metadata, not artefacts. It verifies a listing by fetching
 * the package from npm and reading `mcpName` out of the manifest it finds
 * there. So publishing to the registry is only meaningful *after* npm serves
 * the new version, and npm does not serve it the instant `npm publish` returns:
 * `docs/releasing.md` has recorded since the first manual release that the
 * packument 404s for several minutes while `+ @trazum/mcp@x.y.z` is already on
 * screen. Chaining the two publishes without this wait produces exactly the
 * failure this repository already paid for by hand:
 *
 *     400 NPM package '@trazum/mcp' is missing required 'mcpName' field
 *
 * which reads like a manifest bug and is a propagation race.
 *
 * A fixed sleep would be the obvious fix and the wrong one: too short and the
 * race comes back on a slow day, too long and every release waits for the worst
 * case. This asks npm the question directly and stops as soon as the answer is
 * yes.
 *
 * **It checks the field, not just the status code.** A 200 proves the version
 * exists; it does not prove that version carries `mcpName`, and a version
 * without it is refused by the registry with the same 400. The two facts
 * propagate together, but only one of them is the thing the registry reads.
 *
 * Usage: node scripts/mcp-registry-preflight.mjs
 *
 * Environment:
 *   MCP_PREFLIGHT_TIMEOUT_MS   how long to keep asking (default 300000)
 *   MCP_PREFLIGHT_INTERVAL_MS  how long to wait between asks (default 10000)
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => JSON.parse(readFileSync(join(repoRoot, path), 'utf8'));

const manifest = read('packages/mcp/package.json');
const registry = read('packages/mcp/server.json');

/**
 * The same lockstep `publish.test.js` holds, asserted once more at the point of
 * use. Not redundant: `verify` runs against the commit, this runs against the
 * checkout the release job is about to publish from, and a job that skipped
 * verify (a re-run, a hand-pushed tag) would otherwise contact the registry
 * with two files that disagree.
 */
if (registry.name !== manifest.mcpName) {
  console.error(
    `::error::server.json says "${registry.name}", package.json's mcpName says "${manifest.mcpName}".` +
      ' The registry checks the second against npm and the first against the request, so they must match.',
  );
  process.exit(1);
}
if (registry.version !== manifest.version) {
  console.error(
    `::error::server.json advertises ${registry.version}, the package is ${manifest.version}.`,
  );
  process.exit(1);
}

const timeout = Number(process.env.MCP_PREFLIGHT_TIMEOUT_MS ?? 300_000);
const interval = Number(process.env.MCP_PREFLIGHT_INTERVAL_MS ?? 10_000);

/**
 * The per-version document, which propagates ahead of the aggregated packument.
 *
 * `encodeURIComponent` rather than replacing the slash. The first version of
 * this line was `.replace('/', '%2f')`, which CodeQL flagged as incomplete
 * escaping and was right to: a string pattern replaces the first occurrence
 * only, so the encoding is correct for `@scope/name` by luck of that shape
 * rather than by construction. Both spellings answer 200 from npm today
 * (`@trazum%2fmcp` and `%40trazum%2Fmcp`); only one of them is an encoder.
 */
const url = `https://registry.npmjs.org/${encodeURIComponent(manifest.name)}/${manifest.version}`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** @returns {Promise<{ ok: true } | { ok: false, why: string }>} */
async function ask() {
  let response;
  try {
    response = await fetch(url, { redirect: 'error', headers: { accept: 'application/json' } });
  } catch (error) {
    return { ok: false, why: error instanceof Error ? error.message : String(error) };
  }
  if (!response.ok) return { ok: false, why: `${response.status} ${response.statusText}` };

  let body;
  try {
    body = await response.json();
  } catch (error) {
    return { ok: false, why: `unreadable body: ${error instanceof Error ? error.message : String(error)}` };
  }

  if (body?.mcpName !== manifest.mcpName) {
    return { ok: false, why: `serving mcpName ${JSON.stringify(body?.mcpName ?? null)}` };
  }
  return { ok: true };
}

const started = Date.now();
console.log(`Waiting for npm to serve ${manifest.name}@${manifest.version} with mcpName ${manifest.mcpName}`);

for (let attempt = 1; ; attempt += 1) {
  const answer = await ask();
  const elapsed = Math.round((Date.now() - started) / 1000);

  if (answer.ok) {
    console.log(`npm is serving it after ${elapsed}s (${attempt} ${attempt === 1 ? 'ask' : 'asks'}).`);
    process.exit(0);
  }

  if (Date.now() - started + interval > timeout) {
    console.error(`::error::npm still is not serving ${manifest.name}@${manifest.version} after ${elapsed}s.`);
    console.error(`::error::Last answer from ${url}: ${answer.why}`);
    console.error('::error::Nothing was sent to the MCP registry. The npm publish itself is unaffected:');
    console.error('::error::re-run this job once npm catches up, or publish the listing by hand as');
    console.error('::error::docs/releasing.md describes.');
    process.exit(1);
  }

  console.log(`  ${elapsed}s: ${answer.why}`);
  await sleep(interval);
}
