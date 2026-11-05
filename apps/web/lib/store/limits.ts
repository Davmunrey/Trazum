/**
 * Request counters that every instance of a deployment can see.
 *
 * The limiter in `lib/rate-limit.ts` counts in its own process. On a platform
 * that runs several instances, that makes "thirty a minute" thirty a minute per
 * instance, and the instance a request lands on is the platform's choice. These
 * counters live in the database instead, so the limits that guard something
 * every instance shares (GitHub's quota for this app, the database itself)
 * mean the number they state. `lib/shared-limit.ts` is the only caller.
 *
 * A bucket is an opaque string the caller builds; the store never sees an
 * address. Windows are fixed and aligned to the clock, so two instances agree
 * on which window a request falls in without talking to each other.
 */
export interface LimitStore {
  /**
   * Count one request against `bucket` in the window starting `windowStart`,
   * and return the window's count, this request included.
   *
   * Atomic: two instances counting the same bucket at once get 1 and 2, never
   * 1 and 1. That is the whole point of counting here rather than in memory.
   */
  hit(bucket: string, windowStart: Date, expiresAt: Date): Promise<number>;

  /** Drop every window that has ended by `now`, and say how many went. */
  sweep(now: Date): Promise<number>;
}

/** The memory driver's counters: one process, so shared with nobody, but the same contract. */
export function limitsInMemory(): LimitStore {
  const windows = new Map<string, { hits: number; expiresAt: number }>();
  const key = (bucket: string, windowStart: Date) => `${bucket}\u0000${windowStart.getTime()}`;

  return {
    async hit(bucket, windowStart, expiresAt) {
      const k = key(bucket, windowStart);
      const window = windows.get(k) ?? { hits: 0, expiresAt: expiresAt.getTime() };
      window.hits += 1;
      windows.set(k, window);
      return window.hits;
    },

    async sweep(now) {
      let gone = 0;
      for (const [k, window] of windows) {
        // `<=`, the same boundary every expiry in this store uses.
        if (window.expiresAt <= now.getTime()) {
          windows.delete(k);
          gone += 1;
        }
      }
      return gone;
    },
  };
}
