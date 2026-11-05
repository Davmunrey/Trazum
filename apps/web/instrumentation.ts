import { unhandledError } from './lib/security-log';

/**
 * Next calls this for every error a request handler, a page render or a
 * server action did not catch, after it has answered with its generic error.
 * It is the application's last-resort handler (OWASP ASVS 4.0.3 7.4.3): one
 * structured line per error, with the route's pattern and the digest the
 * error page shows, and nothing from the request. See `unhandledError` in
 * `lib/security-log.ts` for what it refuses to write and why.
 */
export function onRequestError(
  error: unknown,
  request: Readonly<{ path: string; method: string; headers: NodeJS.Dict<string | string[]> }>,
  context: Readonly<{ routePath: string; routeType: string }>,
): void {
  unhandledError(error, request, context);
}
