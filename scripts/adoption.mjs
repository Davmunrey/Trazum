#!/usr/bin/env node
/**
 * The adoption figures, read at release time and written beside the version.
 *
 * `docs/plan-2.4.md` opened from a number — about two hundred downloads a
 * month behind forty-nine commands — and closed with the rule that the next
 * plan should start from a number too. This is how the number gets there:
 * three public counters, asked once, printed as one line for `RELEASES.md`.
 *
 * Three sources, each asked and each allowed to fail by name:
 *
 * - npm's download counts, `GET https://api.npmjs.org/downloads/point/last-month/@trazum/cli`
 * - GitHub's repository record, `GET https://api.github.com/repos/Davmunrey/Trazum` (`stargazers_count`)
 * - the MCP registry, `GET https://registry.modelcontextprotocol.io/v0/servers?search=io.github.Davmunrey/trazum&version=latest`
 *
 * **A counter that could not be read is printed as unavailable, never as
 * zero.** A zero would say the product has no users, which is a claim; an
 * unavailable is a fact about this run. The exit code is zero either way,
 * because a release is not made or unmade by whether npm answered.
 *
 * Usage: node scripts/adoption.mjs            prints the line
 *        node scripts/adoption.mjs --json     prints the figures as JSON
 *
 * No credential is read or sent: all three endpoints are public.
 */

const SOURCES = {
  downloads: 'https://api.npmjs.org/downloads/point/last-month/@trazum/cli',
  stars: 'https://api.github.com/repos/Davmunrey/Trazum',
  registry:
    'https://registry.modelcontextprotocol.io/v0/servers?search=io.github.Davmunrey/trazum&version=latest',
};

/** One counter, or the reason it is not a counter today. */
async function ask(url, pick, fetchImpl) {
  try {
    const response = await fetchImpl(url, { headers: { accept: 'application/json' } });
    if (!response.ok) return { value: null, reason: `HTTP ${response.status}` };
    const value = pick(await response.json());
    return typeof value === 'number' && Number.isFinite(value) && value >= 0
      ? { value, reason: null }
      : typeof value === 'string' && value !== ''
        ? { value, reason: null }
        : { value: null, reason: 'the answer had no such field' };
  } catch (error) {
    return { value: null, reason: error instanceof Error ? error.message : String(error) };
  }
}

/** The three figures, each with its reason when it is not a figure. */
export async function adoptionFigures(fetchImpl = fetch) {
  const [downloads, stars, registry] = await Promise.all([
    ask(SOURCES.downloads, (body) => body?.downloads, fetchImpl),
    ask(SOURCES.stars, (body) => body?.stargazers_count, fetchImpl),
    ask(
      SOURCES.registry,
      (body) => body?.servers?.[0]?.server?.version,
      fetchImpl,
    ),
  ]);
  return { downloads, stars, registry, readAt: new Date().toISOString().slice(0, 10) };
}

/**
 * The line `RELEASES.md` carries under a version heading. Pure, so the
 * shape is tested without a network.
 */
export function adoptionLine({ downloads, stars, registry, readAt }) {
  const figure = (reading, unit) =>
    reading.value === null ? `${unit}: unavailable (${reading.reason})` : `${reading.value} ${unit}`;
  return (
    `**Adoption, read ${readAt}:** `
    + `${figure(downloads, 'downloads of @trazum/cli in the last 30 days')}, `
    + `${figure(stars, 'GitHub stars')}, `
    + `MCP registry latest ${registry.value === null ? `unavailable (${registry.reason})` : registry.value}.`
  );
}

const invokedDirectly = process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (invokedDirectly) {
  const figures = await adoptionFigures();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(figures, null, 2));
  } else {
    console.log(adoptionLine(figures));
  }
}
