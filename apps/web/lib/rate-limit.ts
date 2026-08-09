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

  return function rateLimited(request: Request, now: number): boolean {
    const key = clientKey(request);
    const bucket = buckets.get(key);

    if (!bucket || now >= bucket.resetAt) {
      if (buckets.size > sweepAbove) {
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
}
