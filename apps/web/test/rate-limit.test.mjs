import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import { before, describe, it } from 'node:test';

/**
 * The limiter, and the amount of work it does to answer.
 *
 * Everything here was already correct about *what* it answered. The bug these
 * tests exist for was invisible from the outside: every verdict was right, and
 * the cost of reaching them grew with the square of the traffic.
 */

register('./helpers/loader.mjs', import.meta.url);

let createRateLimiter;
let clientKey;
let UNREADABLE_ADDRESS;
let OVERFLOW_BUCKET;

before(async () => {
  ({ createRateLimiter, clientKey, UNREADABLE_ADDRESS, OVERFLOW_BUCKET } = await import('../lib/rate-limit.ts'));
});

/** A request from one address, which is the only input the limiter reads. */
const from = (address) => new Request('https://trazum.example/api/optimize', {
  headers: { 'x-forwarded-for': address },
});

describe('what it answers', () => {
  it('permits up to the limit and refuses after it', () => {
    const limited = createRateLimiter({ windowMs: 60_000, max: 3 });
    const request = from('198.51.100.1');

    assert.equal(limited(request, 0), false);
    assert.equal(limited(request, 1), false);
    assert.equal(limited(request, 2), false);
    assert.equal(limited(request, 3), true, 'the fourth call was permitted');
  });

  it('gives each address its own budget', () => {
    const limited = createRateLimiter({ windowMs: 60_000, max: 1 });
    assert.equal(limited(from('198.51.100.1'), 0), false);
    assert.equal(limited(from('198.51.100.1'), 0), true);
    // A different caller is unaffected by the first one being over.
    assert.equal(limited(from('198.51.100.2'), 0), false);
  });

  it('forgets a caller once their window has passed', () => {
    const limited = createRateLimiter({ windowMs: 60_000, max: 1 });
    assert.equal(limited(from('198.51.100.1'), 0), false);
    assert.equal(limited(from('198.51.100.1'), 0), true);
    assert.equal(limited(from('198.51.100.1'), 60_000), false, 'the window never reset');
  });

  it('reads the first hop of x-forwarded-for, not the whole chain', () => {
    // A proxy appends, so the client is first. Taking the last would give every
    // caller behind one proxy the same bucket.
    assert.equal(clientKey(from('203.0.113.9, 10.0.0.1, 10.0.0.2')), '203.0.113.9');
  });

  // GHSA-xx4w-86jg-r8xr: any string of any length was a key, so rotating the
  // header filled memory and stepped around every per-address limit.
  it('puts every value that is not an address in one shared bucket', () => {
    for (const value of ['x'.repeat(14_000), 'not-an-address', '999.1.1.1', '1.2.3', 'a:b:c:d:e:f:g:h:i', '::1::2', '']) {
      assert.equal(clientKey(from(value)), UNREADABLE_ADDRESS, JSON.stringify(value.slice(0, 20)));
    }
    assert.equal(clientKey({ headers: new Headers({ 'x-real-ip': 'x'.repeat(100) }) }), UNREADABLE_ADDRESS);
  });

  it('counts an IPv6 caller by its /64, however the address is written', () => {
    const key = clientKey(from('2001:db8:0:1::1'));
    assert.equal(key, '2001:db8:0:1::/64');
    assert.equal(clientKey(from('2001:0DB8:0000:0001:ffff:ffff:ffff:ffff')), key);
    assert.notEqual(clientKey(from('2001:db8:0:2::1')), key);
    assert.equal(clientKey(from('::ffff:192.0.2.1')), '0:0:0:0::/64');
  });

  it('holds no more buckets than it is told to, and new callers share one past that', () => {
    const limited = createRateLimiter({ windowMs: 60_000, max: 2, maxBuckets: 100 });
    for (let i = 0; i < 100; i++) assert.equal(limited(from(`10.0.${i >> 8}.${i & 255}`), 0), false);
    // The table is full and nothing has expired: the next two newcomers share
    // the overflow bucket, and the third is refused.
    assert.equal(limited(from('192.0.2.1'), 0), false);
    assert.equal(limited(from('192.0.2.2'), 0), false);
    assert.equal(limited(from('192.0.2.3'), 0), true);
    // A caller already in the table keeps its own bucket.
    assert.equal(limited(from('10.0.0.5'), 0), false);
    assert.equal(OVERFLOW_BUCKET, 'overflow');
  });
});

describe('what it costs to answer', () => {
  /**
   * The sweep used to run on **every** miss once the map passed `sweepAbove`,
   * and a miss is any key not seen before. `clientKey` reads
   * `x-forwarded-for`, which the module itself documents as freely spoofable —
   * so an attacker rotating that header makes every request a miss, and every
   * request an O(n) walk of a map their earlier requests grew. Nothing is
   * reclaimed while they do it, because entries in the current window have not
   * expired.
   *
   * Measured on this container before the fix: 80,000 requests inside one
   * window took **46.8 seconds** and 3.1 billion comparisons, on a
   * single-threaded event loop that is serving nobody else meanwhile. After:
   * 79ms and 10,001 comparisons.
   *
   * Asserted on the sweep count rather than on elapsed time. A timing
   * assertion on shared CI hardware is a flake generator, and the count is the
   * thing that actually changed — the seconds were a consequence.
   */
  it('sweeps once per window however hard it is pushed', () => {
    const limited = createRateLimiter({ windowMs: 60_000, max: 30, sweepAbove: 100 });

    // Well past `sweepAbove`, every key distinct, every one inside one window.
    for (let i = 0; i < 5_000; i++) limited(from(`10.0.${i % 256}.${i}`), 1_000);

    assert.equal(limited.sweeps, 1, 'the sweep ran more than once inside a single window');
  });

  it('sweeps again in the next window, rather than once and never', () => {
    // The throttle must delay the sweep, not retire it. A limiter that swept
    // once and stopped would hold every key it ever saw.
    const limited = createRateLimiter({ windowMs: 60_000, max: 30, sweepAbove: 100 });

    for (let i = 0; i < 200; i++) limited(from(`10.1.0.${i}`), 1_000);
    assert.equal(limited.sweeps, 1);

    for (let i = 0; i < 200; i++) limited(from(`10.2.0.${i}`), 1_000 + 60_000);
    assert.equal(limited.sweeps, 2, 'the next window did not sweep');
  });

  it('still reclaims what it sweeps', () => {
    /**
     * The throttle must not turn the sweep into a no-op, and "it reclaimed
     * memory" is not directly observable — so this asserts the consequence
     * that is: after entries expire and a sweep runs, the map is small enough
     * that the next sweep is not triggered at all.
     *
     * Without reclamation the size stays above `sweepAbove` forever and the
     * third window sweeps again.
     */
    const limited = createRateLimiter({ windowMs: 60_000, max: 30, sweepAbove: 100 });

    // Sweep 1 happens *during* this burst, as soon as the map passes 100 — and
    // reclaims nothing, because at t=0 nothing has expired yet. Counting it is
    // the arithmetic the first version of this test got wrong: it expected the
    // burst to be free and the later miss to be the first sweep.
    for (let i = 0; i < 200; i++) limited(from(`10.3.0.${i}`), 0);
    assert.equal(limited.sweeps, 1, 'the burst itself never swept');

    // A window later, everything above has expired and this miss sweeps them.
    limited(from('10.4.0.1'), 120_000);
    assert.equal(limited.sweeps, 2);

    // A window later again. This is the assertion that carries the test: if the
    // sweep above had reclaimed nothing, the map would still hold 200 entries,
    // still be over `sweepAbove`, and sweep a third time.
    limited(from('10.4.0.2'), 240_000);
    assert.equal(limited.sweeps, 2, 'the sweep freed nothing — the map never shrank');
  });

  it('does not sweep at all until there is something to sweep', () => {
    const limited = createRateLimiter({ windowMs: 60_000, max: 30, sweepAbove: 100 });
    for (let i = 0; i < 50; i++) limited(from(`10.5.0.${i}`), 0);
    assert.equal(limited.sweeps, 0);
  });
});

describe('a request can count for more than one', () => {
  it('charges what the caller says a request costs, and refuses once the budget is spent', () => {
    const limited = createRateLimiter({ windowMs: 60_000, max: 10 });
    const request = from('198.51.100.7');

    assert.equal(limited(request, 0, 6), false);
    assert.equal(limited(request, 1, 4), false, 'exactly the budget was refused');
    assert.equal(limited(request, 2, 1), true, 'a request past the budget was permitted');
  });

  it('refuses a first request that alone costs more than the budget', () => {
    const limited = createRateLimiter({ windowMs: 60_000, max: 10 });
    assert.equal(limited(from('198.51.100.8'), 0, 11), true);
  });

  it('does not charge a request it refuses, so a smaller one that fits still goes through', () => {
    const limited = createRateLimiter({ windowMs: 60_000, max: 10 });
    const request = from('198.51.100.10');
    assert.equal(limited(request, 0, 6), false);
    assert.equal(limited(request, 1, 5), true, 'a request past the budget was permitted');
    assert.equal(limited(request, 2, 4), false, 'the refused request was charged');
    assert.equal(limited(request, 3, 1), true, 'a request past the budget was permitted');
  });

  it('does not charge a first request it refuses either', () => {
    const limited = createRateLimiter({ windowMs: 60_000, max: 10 });
    const request = from('198.51.100.11');
    assert.equal(limited(request, 0, 11), true);
    assert.equal(limited(request, 1, 10), false, 'the refused first request was charged');
  });

  it('starts again in the next window', () => {
    const limited = createRateLimiter({ windowMs: 60_000, max: 10 });
    const request = from('198.51.100.9');
    assert.equal(limited(request, 0, 11), true);
    assert.equal(limited(request, 60_000, 10), false);
  });
});

// GHSA-xx4w-86jg-r8xr: the limiter bounds what it holds; these bound what Next
// and the proxy in front of it hold before the limiter is asked at all.
describe('what a request can make the server hold before anything checks it', () => {
  const read = (path) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');

  it('keeps Next from buffering more of a body than the largest one a route accepts', () => {
    assert.match(read('apps/web/next.config.mjs'), /proxyClientMaxBodySize:\s*'4mb'/);
  });

  it('ships a proxy that caps bodies, overwrites the client address and limits connections', () => {
    const conf = read('packaging/nginx/trazum-web.conf');
    assert.match(conf, /^\s*client_max_body_size 4m;/m);
    assert.match(conf, /^\s*proxy_set_header X-Forwarded-For \$remote_addr;/m, 'appending ($proxy_add_x_forwarded_for) keeps what the client sent first');
    assert.match(conf, /^\s*limit_conn trazum_conn 10;/m);
    assert.match(conf, /^limit_conn_zone \$binary_remote_addr zone=trazum_conn:/m);
  });
});
