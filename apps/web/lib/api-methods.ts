/**
 * The methods each API route answers (OWASP ASVS 4.0.3 14.5.1).
 *
 * Next answers a method a route does not export with a 405 of its own, before
 * any code here runs, so nothing used to record it. The middleware now
 * refuses those itself, with an `Allow` header and an `input.refused` line,
 * and this table is how it knows which methods each route serves: the
 * middleware cannot read the route files at run time.
 *
 * Written out by hand, which is exactly the kind of list that drifts, so
 * `test/api-methods.test.mjs` derives the same table from the route files and
 * fails when the two differ. A route added without a row here, or a method
 * added to a route and not here, is a failing test rather than a 405 that a
 * working handler never gets to answer.
 *
 * HEAD is served wherever GET is, because Next answers it from the GET
 * handler. OPTIONS is not: this app never answers a cross-origin preflight, so
 * a preflight is a request it does not serve.
 */
export const API_METHODS: Readonly<Record<string, readonly string[]>> = {
  '/api/account': ['DELETE', 'GET'],
  '/api/admin/overview': ['GET'],
  '/api/auth/github/callback': ['GET'],
  '/api/auth/github': ['GET'],
  '/api/auth/session': ['GET'],
  '/api/auth/sessions': ['DELETE', 'GET'],
  '/api/auth/signout': ['POST'],
  '/api/compare': ['POST'],
  '/api/optimize': ['GET', 'POST'],
  '/api/prompts/[id]': ['DELETE', 'GET', 'PATCH', 'POST'],
  '/api/prompts': ['GET', 'POST'],
  '/api/shares/[token]': ['DELETE'],
  '/api/shares': ['GET', 'POST'],
  '/api/write': ['POST'],
};

/**
 * The route a path belongs to and the methods it serves, or `null` when no
 * API route matches (Next answers that 404 itself). A literal segment wins
 * over a `[param]` one, as it does in Next's own routing.
 */
export function apiRoute(
  pathname: string,
  table: Readonly<Record<string, readonly string[]>> = API_METHODS,
): { pattern: string; methods: readonly string[] } | null {
  const parts = pathname.split('/').filter(Boolean);
  let best: { pattern: string; methods: readonly string[]; params: number } | null = null;
  for (const [pattern, methods] of Object.entries(table)) {
    const segments = pattern.split('/').filter(Boolean);
    if (segments.length !== parts.length) continue;
    let params = 0;
    const matches = segments.every((segment, i) => {
      if (/^\[[^\]/]+\]$/.test(segment)) {
        params += 1;
        return parts[i].length > 0;
      }
      return segment === parts[i];
    });
    if (matches && (!best || params < best.params)) best = { pattern, methods, params };
  }
  return best && { pattern: best.pattern, methods: best.methods };
}

/** The methods a route answers, as an `Allow` header lists them. */
export function allowed(methods: readonly string[]): string[] {
  return methods.includes('GET') ? [...methods, 'HEAD'] : [...methods];
}
