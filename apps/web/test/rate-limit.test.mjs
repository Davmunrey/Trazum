import assert from 'node:assert/strict';
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

before(async () => {
  ({ createRateLimiter, clientKey } = await import('../lib/rate-limit.ts'));
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
