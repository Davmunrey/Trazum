import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import { before, describe, it } from 'node:test';

/**
 * The middleware, run rather than read.
 *
 * `route-invariants.test.mjs` asserts things *about* this file as text — that
 * the matcher still cuts the badge out, that no static CSP came back to the
 * config — and that was right for a file whose whole job was setting a header.
 * It now refuses requests, and a refusal is behaviour: a wrongly scoped matcher
 * or an inverted condition here takes the whole site down, and neither is
 * visible in a grep.
 *
 * So this imports it and calls it. Every check below is about what a request
 * gets back, not about what the source says.
 */

register('./helpers/loader.mjs', import.meta.url);

let middleware, config, NextRequest;

before(async () => {
  ({ middleware, config } = await import('../middleware.ts'));
  ({ NextRequest } = await import('next/server'));
});

const ORIGIN = 'https://trazum.example';

/** A request from one address, which is what the limiter buckets on. */
const from = (path, address = '203.0.113.9') =>
  new NextRequest(`${ORIGIN}${path}`, { headers: { 'x-forwarded-for': address } });

/** Fire `n` requests at one path from one address, returning the statuses. */
const hammer = (path, n, address) =>
  Array.from({ length: n }, () => middleware(from(path, address)).status);

describe('the shared comparison page is not a free loop', () => {
  it('lets an ordinary reader through', () => {
    // A person opening a link, twice, from one address. The limit must be far
    // enough above this that nobody meets it by hand.
    for (const status of hammer('/c/abcdefghijklmnop', 2, '198.51.100.1')) {
      assert.notEqual(status, 429);
    }
  });

  it('refuses an address that asks in a loop', () => {
    const statuses = hammer('/c/abcdefghijklmnop', 200, '198.51.100.2');
    assert.ok(statuses.includes(429), 'two hundred requests in a minute went through');
    // And the first ones were served: a limiter that refuses from the first
    // request is a broken page, not a protected one.
    assert.notEqual(statuses[0], 429);
  });

  it('says how long to wait, and nothing else', () => {
    const statuses = hammer('/c/abcdefghijklmnop', 200, '198.51.100.3');
    assert.ok(statuses.includes(429));
    const refused = middleware(from('/c/abcdefghijklmnop', '198.51.100.3'));
    assert.equal(refused.status, 429);
    assert.equal(refused.headers.get('retry-after'), '60');
    assert.equal(refused.headers.get('cache-control'), 'no-store');
    // The refusal must not say whether the token exists: that would make the
    // limiter the disclosure the page is careful not to be.
    assert.doesNotMatch(refused.headers.get('content-type') ?? '', /json/);
  });

  it('buckets by address, so one loop does not refuse everybody else', () => {
    /**
     * The failure that would look like protection and be an outage. A limiter
     * keyed on the path, or on nothing, turns one abusive client into a site
     * that refuses every reader of every shared link.
     */
    hammer('/c/abcdefghijklmnop', 200, '198.51.100.4');
    assert.notEqual(
      middleware(from('/c/abcdefghijklmnop', '198.51.100.5')).status,
      429,
      'a second address inherited the first one\'s bucket',
    );
  });

  it('limits the shared page and not the rest of the site', () => {
    /**
     * The other half, and the one that matters most: this runs on every request
     * the matcher admits. A condition that fired on the landing page, the API
     * or the sign-in route would be an outage caused by a fix.
     */
    hammer('/c/abcdefghijklmnop', 200, '198.51.100.6');
    for (const path of ['/', '/api/optimize', '/api/compare', '/prompts', '/cost']) {
      assert.notEqual(
        middleware(from(path, '198.51.100.6')).status,
        429,
        `${path} was refused by the shared-page limiter`,
      );
    }
  });

  it('does not refuse a path that merely starts with the letter', () => {
    // `/c` is two characters and occurs inside plenty of paths. The bound is
    // the segment, not the prefix — the same mistake this repository already
    // made once, in the roadmap route guard.
    hammer('/c/abcdefghijklmnop', 200, '198.51.100.7');
    for (const path of ['/compare', '/cost', '/changelog']) {
      assert.notEqual(middleware(from(path, '198.51.100.7')).status, 429, path);
    }
  });
});

describe('and it still does the thing it was written for', () => {
  it('sets a per-request nonce on the response', () => {
    /**
     * Guarded because the refusal above returns early, and an early return
     * placed one line lower would skip the CSP for the page it protects.
     *
     * **The response half only, and the title says so.** Next hands the
     * modified request headers to the route and nothing a test can hold shows
     * whether they arrived, so the claim that the nonce is set on the request
     * too is made against the source in the next check. A title claiming both
     * while the body checks one is the shape this repository has a doctrine
     * entry about.
     */
    const response = middleware(from('/', '198.51.100.8'));
    const policy = response.headers.get('content-security-policy');
    assert.ok(policy, 'no CSP on an ordinary request');
    assert.match(policy, /script-src [^;]*'nonce-[^']+'/);
    assert.match(policy, /frame-ancestors 'none'/);
    assert.match(policy, /object-src 'none'/);

    const second = middleware(from('/', '198.51.100.9'));
    assert.notEqual(
      policy,
      second.headers.get('content-security-policy'),
      'two responses carried the same nonce, which is a nonce that is not one',
    );
  });

  it('sets it on the request too, which is what stops the page rendering blank', () => {
    /**
     * The half no call can observe, so it is checked where it is written.
     *
     * Next reads the CSP off the *request* headers to learn the nonce it must
     * stamp on its own inline scripts. Set it on the response alone and the
     * policy is correct and the page is empty -- a failure that looks like a
     * build problem and is a one-line omission here.
     */
    const source = readFileSync(new URL('../middleware.ts', import.meta.url).pathname, 'utf8');
    const body = source.slice(source.indexOf('export function middleware'));
    assert.match(body, /headers\.set\('content-security-policy', policy\)/);
    assert.match(body, /NextResponse\.next\(\{ request: \{ headers \} \}\)/);
    assert.match(body, /response\.headers\.set\('content-security-policy', policy\)/);
  });

  it('still keeps the badge out of its reach', () => {
    // The badge sets a strictly tighter policy of its own, and a config header
    // replaces a route's rather than adding to it. Asserted here as well as in
    // the source check, because the matcher now gates a refusal too.
    assert.match(config.matcher[0], /\(\?!badge\//);
  });
});
