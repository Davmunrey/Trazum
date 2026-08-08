/**
 * Stands in for `next/server` so a route handler can be called from a test.
 *
 * Next resolves `next/server` through its own bundler; the package has no
 * `exports` map, so plain Node cannot import that specifier at all. The route
 * uses exactly one thing from it, and the platform already provides the same
 * thing, so this is a redirect rather than a fake: `NextResponse.json` is
 * `Response.json`, and the test reads `status` and awaits `json()` the way a
 * browser would.
 *
 * The distinction matters. A stub that invented its own response shape would let
 * the tests agree with each other about something no client ever sees.
 */
export const NextResponse = {
  /** @type {(body: unknown, init?: ResponseInit) => Response} */
  json: (body, init) => Response.json(body, init),
};
