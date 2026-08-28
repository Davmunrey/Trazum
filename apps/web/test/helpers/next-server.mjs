/**
 * Stands in for `next/server` so a route handler or the middleware can be
 * called from a test.
 *
 * Next resolves `next/server` through its own bundler; the package has no
 * `exports` map, so plain Node cannot import that specifier at all. Everything
 * here is a **redirect to a platform primitive**, never a shape of its own:
 * `NextResponse.json` is `Response.json`, `new NextResponse(...)` is
 * `new Response(...)`, and `NextRequest` is a `Request` with the one property
 * Next adds to it.
 *
 * The distinction is the whole point and the file said so before it grew: a
 * stub that invented its own response shape would let the tests agree with each
 * other about something no client ever sees.
 */

/**
 * `Request` plus `nextUrl`, which is the property Next adds and the middleware
 * reads to decide what a request is for.
 *
 * A parsed `URL` rather than a string, because that is what the real one is and
 * a test written against a string would pass here and fail in production on the
 * first `.pathname`.
 */
export class NextRequest extends Request {
  constructor(input, init) {
    super(input, init);
    this.nextUrl = new URL(typeof input === 'string' ? input : input.url);
  }
}

export class NextResponse extends Response {
  /** @type {(body: unknown, init?: ResponseInit) => Response} */
  static json(body, init) {
    return Response.json(body, init);
  }

  /**
   * Carries on to the route, with the request headers the caller supplies.
   *
   * The response half is faithful — a 200 the middleware then sets headers on,
   * which is what every assertion here reads. The **request** half is not
   * observable from outside Next: the real `next()` hands the modified headers
   * to the route, and nothing a test can hold shows whether they arrived. That
   * matters for this app, because the CSP nonce has to be set on the request as
   * well as the response or the page renders blank, so the assertion that both
   * happen is the one thing about this middleware that still has to be made
   * against the source rather than against a call.
   */
  static next(init) {
    void init;
    return new Response(null, { status: 200 });
  }
}
