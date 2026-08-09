/**
 * Cookie serialisation, done here rather than borrowed.
 *
 * Not because the framework's version is wrong, but because the attributes on
 * the session cookie are the security control and a test has to be able to read
 * them back exactly. A helper that returns an opaque object can be asserted
 * against only through itself; a function that returns a string can be asserted
 * against the string a browser will see.
 */

export interface CookieAttributes {
  /** Seconds. `0` expires the cookie immediately, which is how sign-out works. */
  maxAge: number;
  secure: boolean;
  httpOnly?: boolean;
  sameSite?: 'Lax' | 'Strict' | 'None';
  path?: string;
}

/**
 * A cookie name a browser will accept: RFC 6265 token characters only.
 *
 * Enforced rather than assumed because the alternative is header injection. A
 * name or value carrying CR or LF splits the `Set-Cookie` header into two
 * headers, and the second one is written by whoever supplied the string.
 */
const TOKEN = /^[A-Za-z0-9!#$%&'*+\-.^_`|~]+$/;

/** Cookie-octet: printable ASCII minus space, comma, semicolon and backslash. */
const COOKIE_VALUE = /^[\x21\x23-\x2B\x2D-\x3A\x3C-\x5B\x5D-\x7E]*$/;

export function serializeCookie(name: string, value: string, attrs: CookieAttributes): string {
  if (!TOKEN.test(name)) {
    throw new Error(`invalid cookie name: ${JSON.stringify(name)}`);
  }
  if (!COOKIE_VALUE.test(value)) {
    throw new Error('invalid cookie value');
  }
  if (!Number.isInteger(attrs.maxAge) || attrs.maxAge < 0) {
    throw new Error(`invalid Max-Age: ${attrs.maxAge}`);
  }

  const parts = [`${name}=${value}`, `Path=${attrs.path ?? '/'}`, `Max-Age=${attrs.maxAge}`];

  if (attrs.httpOnly !== false) parts.push('HttpOnly');
  if (attrs.secure) parts.push('Secure');
  parts.push(`SameSite=${attrs.sameSite ?? 'Lax'}`);

  // Max-Age alone is enough for every browser released this decade, but a
  // cookie being *cleared* should also carry a past Expires: a client that
  // ignores Max-Age would otherwise keep a session cookie through a sign-out.
  if (attrs.maxAge === 0) parts.push('Expires=Thu, 01 Jan 1970 00:00:00 GMT');

  return parts.join('; ');
}

/**
 * The cookies on a request, by name.
 *
 * Split on the first `=` only: a value may legally contain one, and splitting on
 * every `=` truncates base64url payloads that happen to end in padding.
 */
export function parseCookies(header: string | null): Map<string, string> {
  const out = new Map<string, string>();
  if (!header) return out;

  for (const pair of header.split(';')) {
    const eq = pair.indexOf('=');
    if (eq < 1) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    // First wins. A request carrying the cookie twice is either a client bug or
    // someone hoping the second one is read; neither deserves the benefit of
    // the doubt, and picking deterministically is the point.
    if (name && !out.has(name)) out.set(name, value);
  }

  return out;
}
