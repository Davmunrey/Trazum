import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

/**
 * Properties every route has to have, checked against every route there is.
 *
 * The other files in this directory test the routes that exist. This one tests
 * the routes that do not exist yet — the shape of the next one somebody adds.
 * Five API subsystems landed in five consecutive merges, each correct, each
 * getting its rules right by the author remembering them. Nothing was checking,
 * and "the author remembered five times" is not a property.
 *
 * Read from source rather than by sending requests, deliberately. What is being
 * asserted is that the *code* reaches a check, not that one request was refused
 * — a test that sends a hostile `Origin` to the four routes it knows about is a
 * test that says nothing about the fifth.
 *
 * **The two layers, and which mutant each one kills.** Mutation-testing this
 * file established the split rather than assuming it:
 *
 * - Deleting the same-origin check from `DELETE /api/prompts/[id]` passed the
 *   entire pre-existing web suite. Every write funnels through one
 *   `requireCaller`, so the behavioural tests prove that function refuses a
 *   hostile `Origin` — and prove nothing about whether a given handler asked it
 *   to. Five such mutants survive everything except this file.
 * - Changing `requireCaller`'s condition to `if (false)` survives *this* file,
 *   because `sameOrigin(` is still there to be matched, and is killed by the
 *   behavioural tests in `prompts.test.mjs` and `auth-routes.test.mjs`.
 *
 * Neither layer is redundant and neither covers the other's mutant. A guard
 * that reads source can see every route including the ones with no test; it
 * cannot see whether the call it found does anything.
 */

const apiDir = new URL('../app/api', import.meta.url).pathname;

/** Every `route.ts` under `app/api`, with its path and text. */
function routeFiles(dir = apiDir, prefix = '/api') {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...routeFiles(path, `${prefix}/${entry.name}`));
    } else if (entry.name === 'route.ts') {
      found.push({ route: prefix, path, source: readFileSync(path, 'utf8') });
    }
  }
  return found;
}

const ROUTES = routeFiles();
const METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

/**
 * The body of one exported handler.
 *
 * Bounded at the next `export ` rather than running to end of file, which is a
 * mistake this repository has now made three times: an unbounded slice makes
 * every later function's text count as this one's, so a guard passes because
 * some *other* handler in the file does the right thing.
 */
function handlerBody(source, method) {
  const start = source.indexOf(`export async function ${method}(`);
  if (start === -1) return null;
  const rest = source.slice(start + 1);
  const end = rest.indexOf('\nexport ');
  return end === -1 ? rest : rest.slice(0, end);
}

/**
 * Does this route read ambient credentials?
 *
 * The exemption is derived rather than listed. `/api/optimize` and
 * `/api/compare` take a prompt, compute, and answer; they read no cookie and no
 * session, so there is nothing for a forged cross-site request to ride on — an
 * attacker who wants that answer can call the endpoint themselves. A hardcoded
 * exemption list would have to be maintained; this asks the question that makes
 * the exemption true, so a route that starts reading a session stops being
 * exempt the moment it does.
 */
function readsCredentials(source) {
  return /requireCaller|currentUser|parseCookies|sessionCookieName/.test(source);
}

describe('every route that trusts a cookie refuses a forged one', () => {
  it('finds the routes at all', () => {
    // Guards derived from a directory walk fail open when the walk finds
    // nothing, and a green run over zero files looks exactly like a green run.
    assert.ok(ROUTES.length >= 8, `only ${ROUTES.length} routes found — has app/api moved?`);
    const paths = ROUTES.map((r) => r.route);
    assert.ok(paths.includes('/api/prompts'), `unexpected route set: ${paths.join(', ')}`);
  });

  it('every state-changing handler goes through a same-origin check', () => {
    /**
     * `SameSite=Lax` already stops a cross-site `POST` from carrying the session
     * cookie, and this is the second lock rather than the first. The two fail
     * differently: `SameSite` is enforced by the browser and absent in anything
     * that is not one, and this check is enforced here and absent when a client
     * sends no `Origin` at all. Neither covers the other's gap.
     */
    const unguarded = [];

    for (const { route, source } of ROUTES) {
      if (!readsCredentials(source)) continue;
      for (const method of METHODS) {
        const body = handlerBody(source, method);
        if (body === null) continue;
        if (/write:\s*true/.test(body) || /sameOrigin\(/.test(body)) continue;
        unguarded.push(`${method} ${route}`);
      }
    }

    assert.deepEqual(unguarded, [], `no same-origin check: ${unguarded.join(', ')}`);
  });

  it('and the derivation actually found handlers to check', () => {
    // The test above passes trivially if `handlerBody` stops matching — an
    // empty list of findings and an empty list of subjects look the same from
    // the outside, which is the failure mode of every derived guard.
    const checked = ROUTES.filter(({ source }) => readsCredentials(source)).flatMap(
      ({ route, source }) =>
        METHODS.filter((method) => handlerBody(source, method) !== null).map(
          (method) => `${method} ${route}`,
        ),
    );

    assert.ok(checked.length >= 5, `only ${checked.length} write handlers found: ${checked}`);
    assert.ok(checked.includes('DELETE /api/prompts/[id]'), checked.join(', '));
    assert.ok(checked.includes('POST /api/shares'), checked.join(', '));
  });

  it('the two endpoints exempt from it read no credentials', () => {
    // Named here so the exemption is visible, but asserted the other way round:
    // the test does not grant them an exemption, it checks that the property
    // granting it still holds.
    for (const route of ['/api/optimize', '/api/compare']) {
      const found = ROUTES.find((r) => r.route === route);
      assert.ok(found, `${route} has moved`);
      assert.equal(
        readsCredentials(found.source),
        false,
        `${route} now reads a session and is no longer exempt from the same-origin check`,
      );
    }
  });
});

describe('nothing private is cacheable', () => {
  it('privateJson forbids storing', () => {
    /**
     * A `cache-control` a shared cache can act on is how one account's prompt
     * ends up served to a stranger. Next sets `no-store` on dynamic routes by
     * default — this asserts the intent is written down rather than inherited,
     * because a default is a thing that changes in a minor version.
     */
    const api = readFileSync(new URL('../lib/prompts/api.ts', import.meta.url).pathname, 'utf8');
    const body = api.slice(api.indexOf('export function privateJson'));
    assert.match(body.slice(0, body.indexOf('\n}')), /no-store/);
  });

  it('a route that builds its own response sets it too', () => {
    /**
     * Most routes answer through `privateJson` and inherit the header. One does
     * not: `/api/auth/session` builds its two responses by hand, and sets
     * `no-store` on both — including the signed-out branch, which is the one
     * somebody would skip.
     *
     * The first version of this test asked the wrong question. It checked that
     * a route *used the helpers*, which is a proxy for the property and not the
     * property — so it failed on a route that sets the header correctly without
     * them. The premise underneath it was false as well: `jsonError` and
     * `redirect` set no cache-control at all, and the test's own comment claimed
     * they did. They carry no session data, so that is fine; asserting it
     * without checking was not.
     *
     * So this counts instead. Every hand-built `Response.json` in a route that
     * reads credentials must have a `no-store` to go with it.
     */
    const offenders = [];

    for (const { route, source } of ROUTES) {
      if (!readsCredentials(source)) continue;
      const handBuilt = source.match(/Response\.json\(/g)?.length ?? 0;
      if (handBuilt === 0) continue;
      const noStore = source.match(/no-store/g)?.length ?? 0;
      if (noStore < handBuilt) {
        offenders.push(`${route}: ${handBuilt} hand-built responses, ${noStore} no-store`);
      }
    }

    assert.deepEqual(offenders, [], offenders.join('; '));
  });

  it('and that check has something to check', () => {
    // `/api/auth/session` is the only route that hand-builds. If it stops, this
    // says so rather than the test above passing over an empty set forever.
    const handBuilding = ROUTES.filter(
      ({ source }) => readsCredentials(source) && /Response\.json\(/.test(source),
    ).map((r) => r.route);

    assert.deepEqual(handBuilding, ['/api/auth/session']);
  });
});
