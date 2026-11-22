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
 * not a defence against a distributed attacker. The limits that guard something
 * every instance shares wrap this one in `shared-limit.ts`, which also counts
 * them in the database when the deployment has one; this limiter stays their
 * first line and their fallback.
 */

/**
 * What the limiter reads of a request: its headers, and only to find the
 * address. A route hands it the `Request`; a page, which has no `Request`,
 * hands it `{ headers: await headers() }`.
 */
export interface RequestLike {
  headers: { get(name: string): string | null };
}

export interface RateLimiter {
  /**
   * True when this request is over the limit and should be refused.
   *
   * `cost` is what the request counts for, 1 unless the caller says otherwise.
   * A limit counted in requests treats a one-line prompt and one at the
   * 400,000-character cap as the same, and the engine does not: a route that
   * runs it charges the characters it was sent, so `max` becomes a budget of
   * work rather than of arrivals.
   */
  (request: RequestLike, now: number, cost?: number): boolean;
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
  /**
   * Buckets to hold at most. Past it, and with nothing expired to sweep, a key
   * not seen before shares one bucket with every other such key, so the table
   * cannot grow without bound however many addresses an attacker rotates
   * through (GHSA-xx4w-86jg-r8xr). The cost lands on newcomers during a flood,
   * which is the trade a bounded table has to make.
   */
  maxBuckets?: number;
}

/** Buckets one limiter holds at most, unless it is told otherwise. */
export const MAX_BUCKETS = 50_000;

/** The bucket new keys share once the table is full. */
export const OVERFLOW_BUCKET = 'overflow';

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
 * request, which is why the value is held to what an address can be
 * (GHSA-xx4w-86jg-r8xr):
 *
 * - **Only an address is a key.** A value that is not an IPv4 or IPv6 address
 *   shares one bucket, {@link UNREADABLE_ADDRESS}, with every other such value.
 *   Before, any string of any length was a key, and 15,000 requests carrying
 *   distinct 14 KB values filled 512 MB.
 * - **IPv6 counts by its /64.** One machine is usually handed a whole /64, so
 *   counting by the full address would give it 2^64 buckets to rotate through.
 */
export function clientKey(request: RequestLike): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded !== null) return addressKey(forwarded.split(',', 1)[0] ?? '');
  const real = request.headers.get('x-real-ip');
  if (real !== null) return addressKey(real);
  return 'local';
}

/** The one bucket every value that is not an address shares. */
export const UNREADABLE_ADDRESS = 'unreadable';

/** The longest textual IPv6 address, with an IPv4 tail: 45 characters. */
export const MAX_ADDRESS_LENGTH = 45;

const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const HEXTET = /^[0-9a-f]{1,4}$/;

function addressKey(raw: string): string {
  const value = raw.trim().toLowerCase();
  if (value.length === 0 || value.length > MAX_ADDRESS_LENGTH) return UNREADABLE_ADDRESS;
  if (IPV4.test(value)) return value;
  const prefix = ipv6Prefix(value);
  return prefix === null ? UNREADABLE_ADDRESS : `${prefix}::/64`;
}

/**
 * The first four groups of an IPv6 address, or null when it is not one.
 * An IPv4 tail ("::ffff:192.0.2.1") counts as the two groups it stands for.
 */
function ipv6Prefix(value: string): string | null {
  if (!value.includes(':')) return null;
  let text = value;
  const lastColon = text.lastIndexOf(':');
  const last = text.slice(lastColon + 1);
  if (last.includes('.')) {
    if (!IPV4.test(last)) return null;
    text = `${text.slice(0, lastColon + 1)}0:0`;
  }
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] === '' ? [] : halves[0]!.split(':');
  const rest = halves.length === 2 ? (halves[1] === '' ? [] : halves[1]!.split(':')) : [];
  if (![...head, ...rest].every((group) => HEXTET.test(group))) return null;
  const given = head.length + rest.length;
  if (halves.length === 1 ? given !== 8 : given > 7) return null;
  const groups = [...head, ...Array<string>(8 - given).fill('0'), ...rest];
  return groups
    .slice(0, 4)
    .map((group) => group.replace(/^0+(?=.)/, ''))
    .join(':');
}

export function createRateLimiter({ windowMs, max, sweepAbove = 10_000, maxBuckets = MAX_BUCKETS }: RateLimitOptions): RateLimiter {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  let sweeps = 0;
  // Zero rather than "one window from now": the first sweep should happen as
  // soon as there is anything to sweep, not a minute after the map filled up.
  let nextSweepAt = 0;

  const rateLimited = function rateLimited(request: RequestLike, now: number, cost = 1): boolean {
    let key = clientKey(request);
    let bucket = buckets.get(key);

    if (!bucket || now >= bucket.resetAt) {
      if (buckets.size > sweepAbove && now >= nextSweepAt) {
        nextSweepAt = now + windowMs;
        sweeps++;
        for (const [other, value] of buckets) {
          if (now >= value.resetAt) buckets.delete(other);
        }
      }
      if (!bucket && buckets.size >= maxBuckets) {
        key = OVERFLOW_BUCKET;
        bucket = buckets.get(key);
        if (bucket && now < bucket.resetAt) {
          if (bucket.count + cost > max) return true;
          bucket.count += cost;
          return false;
        }
      }
      // A refused request is not charged: it did no work, and charging it
      // would let one large refusal lock out the small requests that still fit.
      // With a cost of 1 the answers are the same either way, since a bucket at
      // `max` refuses the next request whether or not it counts it.
      const refused = cost > max;
      buckets.set(key, { count: refused ? 0 : cost, resetAt: now + windowMs });
      return refused;
    }

    if (bucket.count + cost > max) return true;
    bucket.count += cost;
    return false;
  };

  Object.defineProperty(rateLimited, 'sweeps', { get: () => sweeps });
  return rateLimited as RateLimiter;
}
