/**
 * One sliding-window limiter, many independent buckets.
 *
 * Both existing routes carried a copy of this function, with a comment on one
 * of them explaining that sharing was deliberately avoided — because a shared
 * `Map` would let a burst of comparisons spend somebody else's optimise budget.
 * That reasoning is right about the state and wrong about the code: a factory
 * gives each caller its own `Map` while there is still only one implementation
 * to get correct. The sign-in routes are the third and fourth caller, which is
 * where copy-paste stops being defensible.
 *
 * What it is and is not: on a serverless platform each instance keeps its own
 * counters, so the effective limit is looser than the number suggests. This is a
 * barrier against accidental abuse and runaway scripts, not a billing quota and
 * not a defence against a distributed attacker.
 */

export interface RateLimiter {
  /** True when this request is over the limit and should be refused. */
  (request: Request, now: number): boolean;
  /**
   * How many times the expired-entry sweep has run.
   *
   * Exposed so a test can assert the sweep's *frequency* rather than trust a
   * comment about it. The bug this counter exists to pin was invisible from
   * the outside — every answer the limiter gave was correct, it just gave them
   * quadratically.
   */
  readonly sweeps: number;
}

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  /**
   * Entries to tolerate before sweeping expired ones.
   *
   * The sweep runs on a miss rather than on a timer: a route that stops being
   * called should stop doing work, not keep an interval alive holding the
   * process open.
   */
  sweepAbove?: number;
}

/**
 * How the sweep used to work, and why that was a way to take the app down.
 *
 * It ran on **every** miss once the map passed `sweepAbove`. A miss is any key
 * not seen before — and `clientKey` reads `x-forwarded-for`, which this module
 * already documents as freely spoofable. So an attacker rotating that header
 * makes every request a miss, and every request an O(n) walk of a map their
 * previous requests grew. N requests inside one window cost O(N²), and almost
 * nothing is reclaimed while they are doing it, because entries in the current
 * window have not expired yet.
 *
 * Measured rather than reasoned about, on this container:
 *
 * ```
 * N= 20000    1560ms   scans=9,999   compares=  149,985,000
 * N= 40000    6895ms   scans=29,999  compares=  749,975,000
 * N= 80000   52752ms   scans=69,999  compares=3,149,955,000
 * ```
 *
 * Doubling the requests multiplied the work by 4.4, then 7.6. Eighty thousand
 * requests — which is not an interesting number of requests — is 52 seconds of
 * a single-threaded event loop, during which the deployment serves nobody. The
 * limiter answered every one of them correctly. It just answered quadratically.
 *
 * Sweeping at most once per window makes the total linear: each arrival is one
 * insert, and the walk happens once per `windowMs` however hard it is pushed.
 *
 * Memory is unchanged and worth stating: a window's worth of distinct keys is
 * held until the next sweep, which is inherent to counting per key rather than
 * a consequence of this fix. It does not accumulate across windows — a rotation
 * attack's old keys are all expired by the time the next sweep sees them.
 */

/**
 * The caller's address, as well as it can be known behind a proxy.
 *
 * `x-forwarded-for` is client-controllable unless a trusted proxy overwrites
 * it, which is the normal deployment and is why it is read first. Where it is
 * not overwritten, an attacker can rotate the header and get a fresh bucket per
 * request — another reason this is a courtesy limit and not a security control.
 */
export function clientKey(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'local'
  );
}

export function createRateLimiter({ windowMs, max, sweepAbove = 10_000 }: RateLimitOptions): RateLimiter {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  let sweeps = 0;
  // Zero rather than "one window from now": the first sweep should happen as
  // soon as there is anything to sweep, not a minute after the map filled up.
  let nextSweepAt = 0;

  const rateLimited = function rateLimited(request: Request, now: number): boolean {
    const key = clientKey(request);
    const bucket = buckets.get(key);

    if (!bucket || now >= bucket.resetAt) {
      if (buckets.size > sweepAbove && now >= nextSweepAt) {
        nextSweepAt = now + windowMs;
        sweeps++;
        for (const [other, value] of buckets) {
          if (now >= value.resetAt) buckets.delete(other);
        }
      }
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return false;
    }

    bucket.count++;
    return bucket.count > max;
  };

  Object.defineProperty(rateLimited, 'sweeps', { get: () => sweeps });
  return rateLimited as RateLimiter;
}
