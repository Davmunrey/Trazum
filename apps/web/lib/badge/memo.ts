/**
 * A bounded, expiring memo for work that is deterministic per key.
 *
 * ## What this is defending
 *
 * `/badge/:token.svg` is the only route in this application that is
 * unauthenticated, embedded in other people's documents, and does real work on
 * every hit. A README badge is fetched by GitHub's image proxy on behalf of
 * every reader, and each of those fetches used to run `comparePrompts` over two
 * whole prompts — the rule engine, the token estimate and the advisories — and
 * then throw the result away.
 *
 * Measured on this container, warmed, `level: 'aggressive'`, in milliseconds
 * per call and badge renders one core can serve in a second:
 *
 * ```
 *   229 chars before,  229 after     3.1 ms     ~327/s
 *   687 chars before,  458 after     6.0 ms     ~167/s
 * 4,580 chars before, 3,206 after   52.2 ms      ~19/s
 * ```
 *
 * The top row is the one that matters, because a share is made from a prompt
 * worth sharing. Nineteen renders a second, from a URL anybody can paste into a
 * README and every reader of it then fetches: that is a few bytes of request
 * against the most expensive computation this product performs, and the ratio
 * is the definition of an amplifier.
 *
 * ## Why not the rate limiter this repository already has
 *
 * `lib/rate-limit.ts` keys on the client address, and on this route that is the
 * wrong axis. Behind an image proxy every reader of a README shares a small set
 * of source addresses, so a per-address limit would throttle a popular badge
 * for everybody at once — the badge would start rendering as broken to readers
 * who did nothing, which is the exact failure the route's "always answer 200"
 * rule exists to avoid. Limiting by *token* would be closer, and is what this
 * is: not a refusal, which a reader would see, but a promise not to compute the
 * same answer twice inside a window.
 *
 * ## What is deliberately not cached
 *
 * The store lookup. `findShare` runs on every request, so **revocation and
 * expiry take effect immediately** — the property the route's own comment
 * promises, and one a cached response would have quietly weakened by up to the
 * whole TTL. Only the comparison is memoised, and only under a token, which is
 * sound because a share is create-and-revoke: nothing in the API updates one,
 * so the same token never describes different prompts.
 *
 * ## Its sibling gets a different answer, on purpose
 *
 * `/c/:token` is the other unauthenticated, token-addressed route that runs the
 * same comparison, and it does **not** use this. Two reasons, and they point
 * the same way. It has no fan-out: a page needs a person to open it, where a
 * badge is fetched on behalf of every reader of a document that merely mentions
 * it, so the per-address limiter this repository already has is the right tool
 * there and the wrong one here. And the thing that would be held is different —
 * the badge memo holds a rendered SVG of numbers this file computed, while a
 * page memo would hold a comparison carrying the prompt text itself, in process
 * memory, for the whole window, on the one page whose own comment says it is
 * *never cached: the content is one person's prompt*. Reaching for the same
 * mechanism twice because it is the mechanism at hand is how a fix becomes a
 * regression.
 *
 * ## What it is not
 *
 * On a serverless platform each instance keeps its own map, so the hit rate is
 * lower than the numbers here suggest and the guarantee is "at most once per
 * key per window **per instance**". This is a brake on amplification, not a
 * cache with a coherence story, and nothing correctness-bearing may depend on a
 * hit.
 */

export interface Memo<T> {
  /** The memoised value for `key`, computing it if there is no live entry. */
  (key: string, now: number, compute: () => Promise<T>): Promise<T>;
  /** Live entries. Exposed so a test can assert the bound rather than trust it. */
  readonly size: number;
  /** How many entries have been dropped to stay inside the bound. */
  readonly evictions: number;
}

export interface MemoOptions {
  /** How long an entry stays usable. */
  ttlMs: number;
  /**
   * The most entries to hold.
   *
   * Not a detail. A well-formed token that names no share is cheap to generate
   * and would otherwise earn its own entry, so an unbounded map here would
   * replace a CPU amplifier with a memory one. On overflow the expired go
   * first, and if that frees nothing the oldest entry does — a map this small
   * does not need a heap to pick it.
   */
  max: number;
}

export function createBadgeMemo<T>({ ttlMs, max }: MemoOptions): Memo<T> {
  if (!(ttlMs > 0)) throw new Error('ttlMs must be a positive number of milliseconds');
  if (!(max > 0)) throw new Error('max must be a positive number of entries');

  /** `storedAt` rather than `expiresAt`, so the oldest is also the first to go. */
  const entries = new Map<string, { storedAt: number; value: Promise<T> }>();
  let evictions = 0;

  /**
   * Room for one more, made without walking the map on every call.
   *
   * Only runs when the map is full, which is the case an attacker can force and
   * the case a real workload almost never reaches: a badge fleet is a handful
   * of tokens. Expired entries go in one pass; if the window is so busy that
   * none has expired, the oldest live entry is dropped instead, because
   * refusing to store is the one behaviour that would make the bound useless.
   */
  const makeRoom = (now: number): void => {
    if (entries.size < max) return;
    for (const [key, entry] of entries) {
      if (now - entry.storedAt >= ttlMs) {
        entries.delete(key);
        evictions += 1;
      }
    }
    // Insertion order is age order, so the first key is the oldest.
    while (entries.size >= max) {
      const oldest = entries.keys().next();
      if (oldest.done) break;
      entries.delete(oldest.value);
      evictions += 1;
    }
  };

  const memo = (key: string, now: number, compute: () => Promise<T>): Promise<T> => {
    const found = entries.get(key);
    if (found !== undefined && now - found.storedAt < ttlMs) return found.value;
    if (found !== undefined) {
      entries.delete(key);
      evictions += 1;
    }

    makeRoom(now);
    /**
     * The promise is stored, not the value, and that is the point rather than a
     * shortcut: a burst of concurrent requests for one cold token would each
     * miss and each start the same comparison, which is the amplification this
     * exists to stop happening at exactly the moment it matters most.
     *
     * A rejection must not be memoised — a failed store read or a thrown
     * comparison would otherwise be served for the whole window — so the entry
     * removes itself on the way out.
     */
    const value = compute();
    entries.set(key, { storedAt: now, value });
    value.catch(() => {
      if (entries.get(key)?.value === value) entries.delete(key);
    });
    return value;
  };

  Object.defineProperties(memo, {
    size: { get: () => entries.size },
    evictions: { get: () => evictions },
  });

  return memo as Memo<T>;
}
