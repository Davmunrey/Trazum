import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { register } from 'node:module';
import { join } from 'node:path';
import { before, describe, it } from 'node:test';

register('./helpers/loader.mjs', import.meta.url);

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

describe('the headers a page cannot set itself', () => {
  /**
   * Imported, not read as text. `next.config.mjs` is plain JavaScript, so the
   * test can ask the real object what it declares rather than matching on the
   * source that produces it.
   *
   * **What this cannot prove**, stated because the gap it replaces was exactly
   * this: it does not prove Next *sends* them, and it deliberately does not
   * reimplement Next's path matching to guess which rule applies where. A
   * constant asserted to have the right contents is what `SHARE_HEADERS` was,
   * and `SHARE_HEADERS` sent nothing for its whole life. This object is at
   * least the one Next reads — but "declared in the config Next reads" is one
   * step short of "observed on a response", and that step is taken by hand
   * against a built server, with the output recorded in the pull request.
   */
  const rules = async () => (await import(new URL('../next.config.mjs', import.meta.url).href))
    .default.headers();

  const ruleFor = (all, key) => all.find((rule) => rule.headers.some((h) => h.key === key));

  it('every page tells a browser never to speak plain HTTP to this host', async () => {
    /**
     * The last gap in a twenty-point hardening list, and the one that only
     * matters on the visit *before* the attack: without HSTS a returning
     * visitor's first request can be plain HTTP, and a network in between can
     * answer it. The redirect to HTTPS arrives too late — the request is
     * already on the wire.
     *
     * Asserted through the config Next reads, with the same caveat as the rest
     * of this block: declared is one step short of observed.
     */
    const { SECURITY_HEADERS } = await import(new URL('../next.config.mjs', import.meta.url).href);
    const { HSTS, HSTS_MAX_AGE_SECONDS } = SECURITY_HEADERS;

    assert.equal(HSTS.key, 'strict-transport-security');
    assert.ok(
      HSTS.value.includes(`max-age=${HSTS_MAX_AGE_SECONDS}`),
      'the header and the constant beside it disagree',
    );
    assert.ok(
      HSTS_MAX_AGE_SECONDS >= 31_536_000,
      `a max-age of ${HSTS_MAX_AGE_SECONDS}s leaves a window between visits that TLS can be stripped in`,
    );
    assert.ok(HSTS.value.includes('includeSubDomains'), 'a subdomain is a way back in');

    /**
     * `preload` is consent to be compiled into browsers, and removal takes
     * months and reaches users only as they update. It belongs to whoever owns
     * the domain, decided once and knowingly, and it also requires a submission
     * nobody has made — so the flag would be a claim as well as a decision.
     */
    assert.equal(
      HSTS.value.includes('preload'),
      false,
      'preload was added in a config file; that is the domain owner\'s decision and needs a submission',
    );
  });

  it('does not pin a development hostname for a year', async () => {
    /**
     * `next dev` serves plain HTTP. A browser that accepts this header for a
     * development hostname pins it, which breaks every other project served
     * over HTTP on that name for a year on that machine. Chrome special-cases
     * `localhost`; a LAN address or a `.local` name is not special-cased, and
     * that is how this one gets found.
     */
    const all = await rules();
    const base = all.find((rule) => rule.source === '/:path*');
    assert.ok(base, 'nothing declares the baseline headers');

    const sent = base.headers.some((h) => h.key === 'strict-transport-security');
    assert.equal(
      sent,
      process.env.NODE_ENV === 'production',
      `HSTS is ${sent ? 'sent' : 'withheld'} under NODE_ENV=${process.env.NODE_ENV}`,
    );
  });

  it('every page refuses to be framed', async () => {
    /**
     * The finding this fixes, and it was reachable rather than theoretical:
     * `curl -I` against a built server returned no `X-Frame-Options` and no
     * CSP, so every signed-in control in this app — publish a comparison,
     * revoke a link, delete a prompt — was operable inside somebody else's
     * iframe. `SameSite=Lax` is not a defence against it: a framed page is
     * same-site with itself, so its own `fetch` carries the session cookie
     * exactly as it would in a tab.
     */
    const all = await rules();

    const framing = ruleFor(all, 'x-frame-options');
    assert.ok(framing, 'nothing declares X-Frame-Options');
    assert.equal(framing.source, '/:path*', 'framing is refused on some paths and not others');
    assert.equal(
      framing.headers.find((h) => h.key === 'x-frame-options').value,
      'DENY',
    );

    // The CSP lives in `middleware.ts` now — a nonce has to differ per response
    // and a config header is one string for every response. `frame-ancestors` is
    // asserted there; here it is enough that `X-Frame-Options` still covers the
    // agents that do not implement it.
    const csp = ruleFor(all, 'content-security-policy');
    assert.equal(csp, undefined, 'a static CSP came back to the config — see middleware.ts');
  });

  it('the badge keeps the stricter policy it sets for itself', async () => {
    /**
     * A config header **replaces** one a route handler set rather than adding
     * to it, which the first version of this change did not know and which is
     * wrong in the dangerous direction: a site-wide `frame-ancestors` silently
     * replaced the badge's `default-src 'none'; sandbox`, and the badge came
     * out of a security change weaker than it went in. Nothing in the config or
     * the types says so — it took `curl -I` against a built server.
     *
     * So the CSP rule cuts `/badge/` out, and the badge carries the directive
     * itself. Both halves are asserted, because either one alone leaves it
     * either unframed-but-scriptable or inert-but-framable.
     */
    // The exclusion moved with the policy: it is the middleware matcher now.
    const middlewareSource = readFileSync(
      new URL('../middleware.ts', import.meta.url).pathname,
      'utf8',
    );
    assert.match(middlewareSource, /matcher/, 'the middleware no longer scopes itself');
    assert.match(middlewareSource, /\(\?!badge\//, 'the badge is no longer excluded');

    const svg = readFileSync(new URL('../lib/badge/svg.ts', import.meta.url).pathname, 'utf8');
    const own = svg.slice(svg.indexOf('BADGE_HEADERS'));
    assert.match(own, /default-src 'none'/);
    assert.match(own, /sandbox/);
    assert.match(own, /frame-ancestors 'none'/);
  });

  it('no request leaks a share token in a Referer', async () => {
    // The token is the capability and it is in the path, so a `Referer` hands
    // the capability to whoever receives the request. Site-wide rather than on
    // `/c/` alone: two rules matching one path send the header twice, and which
    // value a browser honours is not a thing to be clever about.
    const referrer = ruleFor(await rules(), 'referrer-policy');
    assert.ok(referrer, 'nothing declares a Referrer-Policy');
    assert.equal(referrer.source, '/:path*');
    assert.equal(referrer.headers.find((h) => h.key === 'referrer-policy').value, 'no-referrer');
  });

  it('the share page tells crawlers to stay out, in a header and not only a tag', async () => {
    const robots = ruleFor(await rules(), 'x-robots-tag');
    assert.ok(robots, 'nothing declares an X-Robots-Tag');
    assert.equal(robots.source, '/c/:token', 'the directive is not scoped to the share page');
    assert.match(robots.headers[0].value, /noindex/);
    assert.match(robots.headers[0].value, /noarchive/);
  });

  it('no path can be sent the same header twice, whatever it matches', async () => {
    /**
     * Asserted without simulating the router, which is both simpler and
     * stronger: if no two rules declare the same key at all, then no path gets
     * a duplicate — for every path, including ones nobody thought of.
     *
     * It matters because what a browser does with a repeated header varies by
     * header. `X-Robots-Tag` combines its directives, `Referrer-Policy` picks
     * one, and two CSPs are enforced as an intersection. Rather than reason
     * about each, there are no duplicates to reason about.
     */
    const declared = (await rules()).flatMap((rule) => rule.headers.map((h) => h.key));
    assert.deepEqual(
      declared.filter((key, index) => declared.indexOf(key) !== index),
      [],
    );
  });

  it('the constant that sent nothing is gone', async () => {
    // Deleted rather than left in place. A constant holding the right headers
    // and applied to nothing reads, to the next person, as a defence that
    // exists — and its own tests passed for as long as it was there.
    const shares = readFileSync(new URL('../lib/shares/api.ts', import.meta.url).pathname, 'utf8');
    assert.equal(/export const SHARE_HEADERS/.test(shares), false);
  });
});

describe('the content-security policy', () => {
  /**
   * Read from `middleware.ts`, and the limits of that are worth stating.
   *
   * A policy is only real if the browser gets it *and* the page still works
   * under it, and neither is visible from source. Both were checked by hand
   * against a built server, and the output is in the pull request: nine of nine
   * script tags carrying the nonce from the header, a different nonce on every
   * request, and the badge keeping its own stricter policy. What is asserted
   * here is the part that can rot silently — the directives themselves.
   */
  const middleware = readFileSync(new URL('../middleware.ts', import.meta.url).pathname, 'utf8');

  /**
   * Comments stripped before anything is matched.
   *
   * `directive('default-src')` returned `'none'` on the first attempt — from the
   * doc comment explaining that the *badge* uses `default-src 'none'`, several
   * paragraphs above the policy. This repository has been caught by "the pattern
   * matched the comment rather than the code" three times now, and a test that
   * fails when you document the reasoning teaches people to stop documenting it.
   */
  const code = middleware.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  const directive = (name) => new RegExp(`\`${name} ([^\`;]*)`).exec(code)?.[1] ?? '';

  it('has a script-src at all, which is the whole point', () => {
    /**
     * Until this existed the policy was `frame-ancestors 'none'` and nothing
     * else. That stops clickjacking and does nothing about script injection, so
     * React's escaping was the only thing standing between an XSS and full
     * exploitation. It was documented as a limitation rather than dressed up,
     * and this is the limitation being removed.
     */
    assert.match(middleware, /script-src/);
    assert.match(middleware, /nonce-\$\{value\}/, 'the script-src has no nonce in it');
  });

  it('never allows unsafe-inline for script, which would undo it entirely', () => {
    // The one directive that would make the whole policy theatre: it permits
    // exactly the injection the policy is written to stop.
    const scriptSrc = directive('script-src');
    assert.ok(scriptSrc, 'no script-src found — has the policy moved?');
    assert.ok(!scriptSrc.includes("'unsafe-inline'"), `script-src allows inline: ${scriptSrc}`);
  });

  it('keeps unsafe-eval out of production', () => {
    // The dev server compiles with it. Shipping it hands back most of what the
    // policy buys, and it is one deleted conditional away from happening.
    assert.match(
      middleware,
      /dev \? " 'unsafe-eval'" : ''/,
      'unsafe-eval is no longer conditional on the environment',
    );
  });

  it('sets the header on the request as well as the response', () => {
    /**
     * The line that is impossible to notice from the outside. Next reads the
     * policy off the *request* headers to learn which nonce to stamp on its own
     * inline scripts; set it only on the response and the header is perfect,
     * the page is blank, and nothing in the header says why.
     */
    /**
     * Matched as the *request* line specifically, which the first version did
     * not do: `/headers\.set\('content-security-policy'/` is satisfied by
     * `response.headers.set(…)` two lines below, so deleting the request header
     * left the test green.
     *
     * Deleting it is not cosmetic. Measured against a built server: nine script
     * tags, **zero** carrying a nonce — every one of them blocked by the policy
     * in the response, and the page dead. A header that is perfect and a page
     * that is blank.
     */
    assert.match(
      code,
      /\n {2}headers\.set\('content-security-policy', policy\);/,
      'the policy is not set on the request — Next will not stamp the nonce',
    );
    assert.match(code, /NextResponse\.next\(\{ request: \{ headers \} \}\)/);
    assert.match(code, /response\.headers\.set\('content-security-policy', policy\);/);
  });

  it('closes the directives an injected script would reach for', () => {
    // `connect-src` is the exfiltration channel, `base-uri` rewrites every
    // relative URL on the page, `object-src` is the plugin escape hatch, and
    // `form-action` is where a hijacked form posts to.
    for (const [name, expected] of [
      ['base-uri', "'self'"],
      ['object-src', "'none'"],
      ['form-action', "'self'"],
      ['default-src', "'self'"],
    ]) {
      assert.equal(directive(name).trim(), expected, name);
    }

    /**
     * `connect-src` is the one directive that takes an addition, so it gets its
     * own assertion rather than going through `directive()` — that helper stops
     * at the first backtick and this value contains a nested template.
     *
     * Asserted on shape: `'self'` first, and the only thing that may follow is
     * the analytics origin. Anything else concatenated here is one more place a
     * stolen prompt could be sent to.
     */
    const connectSrc = /\n\s*`connect-src ([^\n]*)`,\n/.exec(code)?.[1];
    assert.equal(
      connectSrc,
      "'self'${analytics ? ` ${analytics}` : ''}",
      'connect-src is no longer self plus at most the analytics origin',
    );
  });

  it('leaves the badge alone', () => {
    /**
     * `/badge/<token>` sets `default-src 'none'; sandbox` for itself — tighter
     * than anything here, because it is an image with no script at all. It is
     * excluded from the matcher rather than trusted to win: this repository has
     * already shipped one change that silently replaced that policy with a
     * looser one.
     */
    assert.match(middleware, /matcher: \['\/\(\(\?!badge\//);

    const svg = readFileSync(new URL('../lib/badge/svg.ts', import.meta.url).pathname, 'utf8');
    assert.match(svg.slice(svg.indexOf('BADGE_HEADERS')), /default-src 'none'/);
  });

  it('the nonce is not a UUID', () => {
    // 128 bits from the CSPRNG. `randomUUID` is 122 with six fixed, and a
    // predictable nonce is one an attacker can sign their own injection with.
    // Against the comment-stripped source, and that is not a detail: the doc
    // comment above the nonce explains why `randomUUID` is the wrong tool, so
    // asserting its absence in the raw file fails on the sentence saying it is
    // not used. Third time in one session.
    assert.match(code, /getRandomValues\(new Uint8Array\(16\)\)/);
    assert.ok(!code.includes('randomUUID'), 'the nonce is a UUID');
  });
});

describe('the policy and the analytics it has to allow', () => {
  /**
   * `connect-src 'self'` was wrong from the moment it shipped.
   *
   * `Analytics.tsx` posts to PostHog, so an operator who set
   * `NEXT_PUBLIC_POSTHOG_KEY` got a page that rendered perfectly and sent
   * nothing — the reason visible only in a browser console nobody was reading.
   * Nothing caught it because the key is unset in CI and in development: the
   * configuration where it breaks is the one no test exercises.
   *
   * These run the real function against explicit values rather than the ambient
   * environment, which is the only way to exercise the on state at all.
   */
  let analyticsConnectSrc;

  before(async () => {
    ({ analyticsConnectSrc } = await import('../lib/analytics.ts'));
  });

  it('adds nothing when analytics is off, which is the default', () => {
    assert.equal(analyticsConnectSrc(undefined, 'https://eu.i.posthog.com'), null);
    assert.equal(analyticsConnectSrc('', 'https://eu.i.posthog.com'), null);
  });

  it('allows the configured host when analytics is on', () => {
    assert.equal(analyticsConnectSrc('phc_x', 'https://eu.i.posthog.com'), 'https://eu.i.posthog.com');
    assert.equal(analyticsConnectSrc('phc_x', 'https://ph.example.test'), 'https://ph.example.test');
  });

  it('emits an origin, so the host cannot smuggle in a directive', () => {
    /**
     * The policy is built by joining strings with `; `. A host interpolated
     * verbatim is therefore not a value — it is anything the operator's
     * environment says, including a whole directive that replaces the one above
     * it. This is the difference between reading an environment variable and
     * trusting it.
     */
    const injected = analyticsConnectSrc('phc_x', 'https://ph.example.test/x?a=b#c');
    assert.equal(injected, 'https://ph.example.test');
    assert.ok(!/[;'\s]/.test(injected), `not a bare origin: ${injected}`);
  });

  it('refuses anything it cannot parse, rather than widening on a guess', () => {
    // Fails towards analytics being blocked. The other direction is a policy
    // that says something nobody wrote.
    assert.equal(analyticsConnectSrc('phc_x', 'not a url'), null);
    assert.equal(analyticsConnectSrc('phc_x', ''), null);
    // Plain http would let an active network attacker read what is sent.
    assert.equal(analyticsConnectSrc('phc_x', 'http://ph.example.test'), null);
  });

  it('is the same host the component posts to', () => {
    /**
     * The actual defect was not the missing entry, it was two files reading the
     * environment separately. Whichever way the default moves next, it has to
     * move in one place — so neither file may carry a copy of it.
     *
     * The needle is read out of `lib/analytics.ts` rather than written here.
     * That is partly doctrine and partly a correction: the first version asked
     * `source.includes('posthog.com')`, and CodeQL was right to flag it. A bare
     * domain substring is the shape of a sanitiser that `evil-posthog.com.au`
     * walks straight through — harmless in a test asserting *absence*, but the
     * habit is the problem, and this version is also strictly better. It pins
     * the exact literal that must not be duplicated, so it keeps working when
     * the default host stops being a PostHog one.
     */
    const analyticsSource = readFileSync(
      new URL('../lib/analytics.ts', import.meta.url).pathname,
      'utf8',
    );
    const defaultHost = /const DEFAULT_HOST = '([^']+)'/.exec(analyticsSource)?.[1];
    assert.ok(defaultHost, 'no DEFAULT_HOST found in lib/analytics — has it moved?');

    const strip = (path) =>
      readFileSync(new URL(path, import.meta.url).pathname, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

    for (const [name, source] of [
      ['Analytics.tsx', strip('../components/Analytics.tsx')],
      ['middleware.ts', strip('../middleware.ts')],
    ]) {
      assert.ok(
        !source.includes(defaultHost),
        `${name} carries its own copy of ${defaultHost} — it must come from lib/analytics`,
      );
      assert.ok(
        !source.includes('NEXT_PUBLIC_POSTHOG'),
        `${name} reads the analytics environment directly — it must come from lib/analytics`,
      );
      assert.match(
        source,
        /from '@\/lib\/analytics'/,
        `${name} does not import from lib/analytics at all`,
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
