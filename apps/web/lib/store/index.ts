import { memoryStore } from './memory';
import { postgresStore } from './postgres';
import type { Store } from './types';

export type { AuthProvider, NewUser, SessionRecord, Store, UserRecord } from './types';
export { memoryStore } from './memory';
export { postgresStore } from './postgres';
export * from './prompts';

/**
 * How strictly to verify the database's TLS certificate.
 *
 * The default is `verify-full`, which is the only setting that actually proves
 * you are talking to your database rather than to whatever answered. The others
 * exist because managed providers vary and a self-hosted Postgres on a private
 * network is a legitimate `disable`.
 *
 * Stated as an explicit choice rather than inferred, so that running with an
 * unverified connection is something an operator did, not something Trazum did
 * for them.
 */
const SSL_MODES = ['verify-full', 'require', 'prefer', 'allow', 'disable'] as const;
type SslMode = (typeof SSL_MODES)[number];

/** Hosts where TLS is not the interesting question. */
function isLoopback(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  } catch {
    return false;
  }
}

/** `disable` is spelled `false` on the way out — that is the driver's word for it. */
export type ResolvedSslMode = Exclude<SslMode, 'disable'> | false;

export function resolveSslMode(env: NodeJS.ProcessEnv, url: string): ResolvedSslMode {
  const raw = env.TRAZUM_DATABASE_SSL?.trim();
  if (raw) {
    if (!(SSL_MODES as readonly string[]).includes(raw)) {
      throw new Error(
        `TRAZUM_DATABASE_SSL must be one of ${SSL_MODES.join(', ')} (got ${JSON.stringify(raw)})`,
      );
    }
    return raw === 'disable' ? false : (raw as ResolvedSslMode);
  }
  // A connection to your own machine is not the threat this setting addresses,
  // and demanding a certificate there turns `docker run postgres` into a
  // support question.
  return isLoopback(url) ? false : 'verify-full';
}

/**
 * The store for this process.
 *
 * Postgres when `TRAZUM_DATABASE_URL` is set, memory otherwise. Memory is not a
 * failure mode — it is the zero-configuration deployment, and it is the reason
 * running Trazum has never required a database and still does not.
 *
 * `postgres` is imported dynamically so a deployment that never sets the URL
 * never loads a database driver, and so this module stays importable in
 * contexts where the package is not installed.
 */
export async function createStore(env: NodeJS.ProcessEnv = process.env): Promise<Store> {
  const url = env.TRAZUM_DATABASE_URL?.trim();
  if (!url) return memoryStore();

  const { default: postgres } = await import('postgres');
  const sql = postgres(url, {
    ssl: resolveSslMode(env, url),
    // Serverless invocations are short and numerous; a large pool per instance
    // exhausts the server's connection limit long before it helps.
    max: Number(env.TRAZUM_DATABASE_POOL ?? 4),
    // Names would be cached per connection and this workload has six queries.
    prepare: false,
  });

  return postgresStore(sql as never);
}

/**
 * Process-wide singleton, so route handlers do not open a pool per request.
 *
 * Only memoised for the ambient environment. Passing `env` explicitly — which
 * is what the tests do — always builds a fresh store, because a cache keyed on
 * nothing would hand the second test the first one's database.
 */
let cached: Promise<Store> | null = null;

export function getStore(env?: NodeJS.ProcessEnv): Promise<Store> {
  if (env) return createStore(env);
  cached ??= createStore(process.env);
  return cached;
}

/** Testing seam: forget the memoised store. */
export function resetStore(): void {
  cached = null;
}
