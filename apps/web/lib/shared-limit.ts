import { createHmac, hkdfSync } from 'node:crypto';

import { authConfig } from './auth/config';
import { clientKey, createRateLimiter, type RateLimitOptions } from './rate-limit';
import { getStore } from './store';
import type { Store } from './store/types';

/**
 * A rate limit counted across every instance of the deployment, where that is
 * possible, and in this process where it is not.
 *
 * ## Why
 *
 * `createRateLimiter` counts in memory, so on a platform that runs several
 * instances a limit of thirty a minute is thirty a minute *per instance*, and
 * how many instances serve one caller is the platform's decision. The
 * compliance readiness pack listed that as work left (TRZ-08).
 *
 * ## Which limits, and why only those
 *
 * The ones that guard something every instance shares: the sign-in routes
 * (GitHub's rate limit for this app, and the users table), the session
 * endpoint and the prompt library (the database). The anonymous tool routes,
 * `/api/optimize`, `/api/compare` and `/api/write`, stay per instance on
 * purpose. What they protect is the CPU of the instance that runs them, and
 * that is counted correctly per instance; sharing it would add a database
 * round trip to a route that otherwise never touches one.
 *
 * ## When it is shared
 *
 * When the deployment has accounts and a database: a GitHub client secret to
 * key the hashes with, and a store that is not in memory. Otherwise it is the
 * per-instance limiter, exactly as before.
 *
 * ## What is stored
 *
 * Never the address. The bucket is the limit's name and an HMAC of the address
 * under a key derived from the GitHub client secret with HKDF, so the key is
 * not the secret, and a dump of the counter table cannot be turned back into
 * addresses by hashing all four billion IPv4 addresses, because the database
 * does not hold the key. Each row lives one window and is swept after.
 *
 * ## How it fails
 *
 * Open, to the per-instance count. This instance's own limiter runs first,
 * so a flood against one instance is refused without a database round trip,
 * and its answer stands whenever the shared count cannot be had: a missing
 * table, a dropped connection. That is said once per limit in the log, not on
 * every request. A limiter that took sign-in down with the database would be a
 * worse outage than the one it exists to prevent.
 */

export interface SharedRateLimiter {
  /** True when this request is over the limit and should be refused. */
  (request: Request, now: number): Promise<boolean>;
}

export interface SharedLimitDeps {
  /** The store whose `limits` hold the count; skipped when it is in memory. */
  store: () => Promise<Store>;
  /** The key material for the address hashes, or null when there is none. */
  secret: () => string | null;
  /** Where the one-line fallback notice goes. */
  warn: (message: string) => void;
}

const defaultDeps: SharedLimitDeps = {
  store: () => getStore(),
  secret: () => {
    const config = authConfig();
    return config.enabled ? config.clientSecret : null;
  },
  warn: (message) => console.warn(message),
};

let derivedFor: string | null = null;
let derivedKey: Buffer | null = null;

/**
 * The bucket half that stands for an address: an HMAC under a key derived
 * from `secret`, never the address itself.
 *
 * HKDF with its own label, so the key that hashes addresses is not the
 * client secret and reveals nothing about it, and any other use of the same
 * secret would derive a different key.
 */
export function addressKey(secret: string, address: string): string {
  if (derivedFor !== secret || !derivedKey) {
    derivedKey = Buffer.from(hkdfSync('sha256', secret, 'trazum', 'trazum rate-limit address keys', 32));
    derivedFor = secret;
  }
  return createHmac('sha256', derivedKey).update(address, 'utf8').digest('base64url');
}

export function createSharedRateLimiter(
  name: string,
  options: RateLimitOptions,
  deps: SharedLimitDeps = defaultDeps,
): SharedRateLimiter {
  const local = createRateLimiter(options);
  const { windowMs, max } = options;
  let nextSweepAt = 0;
  let warned = false;

  const fallBack = () => {
    if (warned) return;
    warned = true;
    deps.warn(
      `trazum: the ${name} rate limit is counted by this instance alone: the shared count failed. `
        + 'Apply apps/web/db/004_rate_limits.sql if it has not been, and check the database connection.',
    );
  };

  return async function sharedRateLimited(request: Request, now: number): Promise<boolean> {
    // This instance first. Its count is never more than the shared one, so a
    // refusal here is right without asking, and a flood against one instance
    // never reaches the database.
    if (local(request, now)) return true;

    const secret = deps.secret();
    if (!secret) return false;

    let store: Store;
    try {
      store = await deps.store();
    } catch {
      fallBack();
      return false;
    }
    // A memory store is this process; counting twice in one process adds
    // nothing the local limiter does not already know.
    if (store.ephemeral) return false;

    // At most once a window per limit and instance, the same discipline
    // `rate-limit.ts` keeps for its own sweep. A failed sweep costs a few dead
    // rows until the next one, never the request.
    if (now >= nextSweepAt) {
      nextSweepAt = now + windowMs;
      await store.limits.sweep(new Date(now)).catch(() => 0);
    }

    const windowStart = Math.floor(now / windowMs) * windowMs;
    try {
      const hits = await store.limits.hit(
        `${name}:${addressKey(secret, clientKey(request))}`,
        new Date(windowStart),
        new Date(windowStart + windowMs),
      );
      return hits > max;
    } catch {
      fallBack();
      return false;
    }
  };
}
