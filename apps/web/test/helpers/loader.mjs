/**
 * Enough of Next's module resolution for `node --test` to load a route handler.
 *
 * Two jobs, both of them bridging conventions Next's bundler provides and plain
 * Node does not:
 *
 * 1. `next/server` — the package has no `exports` map, so that specifier cannot
 *    be imported outside the bundler at all. Redirected to `next-server.mjs`,
 *    which forwards to the platform's own `Response.json`.
 * 2. Extensionless and directory imports — `'../../../lib/i18n'` is an
 *    `index.ts`, and Node's ESM resolver requires the full path. Tried in the
 *    order the TypeScript resolver uses.
 *
 * Registered with `module.register`, which is stable, rather than
 * `--experimental-test-module-mocks`: the web suite should not depend on a flag
 * a Node minor release can rename. Nothing is faked — `@trazum/core`, the rules
 * and both i18n catalogues are the real modules, so what these tests exercise is
 * the actual optimisation and the actual messages.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const STUB = new URL('./next-server.mjs', import.meta.url).href;

/**
 * `@/x` is the app's own alias for its root, configured in `tsconfig.json` and
 * resolved by Next's bundler. Plain Node has never heard of it.
 *
 * Added when `middleware.ts` became worth running rather than reading: it
 * imports `@/lib/analytics` and `@/lib/rate-limit`, and a loader that could not
 * follow those was the only reason the file was tested as text.
 */
const APP_ROOT = new URL('../../', import.meta.url);

/** What a bare `./x` could mean, in TypeScript's order of preference. */
const CANDIDATES = ['.ts', '.tsx', '/index.ts', '/index.tsx'];

export function resolve(specifier, context, nextResolve) {
  if (specifier === 'next/server') {
    return { url: STUB, shortCircuit: true };
  }

  if (specifier.startsWith('@/')) {
    const base = new URL(specifier.slice(2), APP_ROOT);
    for (const suffix of ['', ...CANDIDATES]) {
      const candidate = new URL(base.href + suffix);
      if (existsSync(fileURLToPath(candidate))) return nextResolve(candidate.href, context);
    }
  }

  if (specifier.startsWith('.') && !/\.[cm]?[jt]sx?$/.test(specifier)) {
    const base = new URL(specifier, context.parentURL);
    for (const suffix of CANDIDATES) {
      const candidate = new URL(base.href + suffix);
      if (existsSync(fileURLToPath(candidate))) {
        // Handed back to the default resolver rather than short-circuited, so
        // Node still decides the format. Answering `format: 'module'` here
        // reports a `.ts` file as plain JavaScript and the first type annotation
        // fails to parse.
        return nextResolve(candidate.href, context);
      }
    }
  }

  return nextResolve(specifier, context);
}
