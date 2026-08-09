import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import type { SessionRecord, Store, UserRecord } from '../store/types';
import { parseCookies, serializeCookie } from './cookies';

/** How long a sign-in lasts. Absolute, not sliding: 30 days from issue. */
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

/** How long the browser has to come back from the provider with a code. */
export const OAUTH_STATE_TTL_SECONDS = 10 * 60;

/**
 * Cookie names.
 *
 * Two of each, because `__Host-` is worth having and cannot be used over plain
 * HTTP. The prefix is enforced by the browser, not by us: a cookie whose name
 * starts with `__Host-` is rejected unless it is `Secure`, `Path=/` and carries
 * no `Domain` — which means a subdomain, or anything that manages to speak HTTP
 * to the host, cannot overwrite the session cookie. That is a real attack
 * (cookie tossing) and this is the only defence against it that does not depend
 * on our own code being right.
 *
 * The unprefixed name exists so `next dev` on `http://localhost` still works.
 */
export const SESSION_COOKIE_SECURE = '__Host-trazum_session';
export const SESSION_COOKIE_PLAIN = 'trazum_session';
export const STATE_COOKIE_SECURE = '__Host-trazum_oauth';
export const STATE_COOKIE_PLAIN = 'trazum_oauth';

export function sessionCookieName(secure: boolean): string {
  return secure ? SESSION_COOKIE_SECURE : SESSION_COOKIE_PLAIN;
}

export function stateCookieName(secure: boolean): string {
  return secure ? STATE_COOKIE_SECURE : STATE_COOKIE_PLAIN;
}

/**
 * A fresh session token: 32 bytes from the CSPRNG, base64url.
 *
 * 256 bits and unguessable, which is what lets it be opaque — there is nothing
 * signed into it, so there is nothing to forge. Its only meaning is that a row
 * with its hash exists, and revoking it is a `delete`.
 */
export function mintToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * What goes in the database.
 *
 * SHA-256 and not a password hash, deliberately: the input is 256 bits of
 * randomness, so there is no dictionary to run and nothing for a slow KDF to
 * buy. What this does buy is that a leaked database is a list of hashes rather
 * than a list of usable cookies.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Constant-time compare for two strings that are secrets. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  // `timingSafeEqual` throws on a length mismatch, which would leak the length
  // through an exception. Compare lengths first and keep the result uniform.
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export interface IssuedSession {
  token: string;
  record: SessionRecord;
  setCookie: string;
}

export function issueSession(userId: string, now: Date, secure: boolean): IssuedSession {
  const token = mintToken();
  const record: SessionRecord = {
    tokenHash: hashToken(token),
    userId,
    createdAt: now,
    expiresAt: new Date(now.getTime() + SESSION_TTL_SECONDS * 1000),
  };

  return {
    token,
    record,
    setCookie: serializeCookie(sessionCookieName(secure), token, {
      maxAge: SESSION_TTL_SECONDS,
      secure,
      httpOnly: true,
      // Lax and not Strict: the sign-in returns here as a top-level navigation
      // from GitHub, and Strict would drop the cookie on exactly that hop and
      // land the user back on a signed-out page. Lax still withholds it from
      // cross-site POSTs, which is the case that matters.
      sameSite: 'Lax',
    }),
  };
}

/**
 * Cookies that clear the session, for both names.
 *
 * Both, because the name depends on whether the deployment is secure and a
 * deployment can change: a site that gains HTTPS would otherwise leave the old
 * unprefixed cookie in place, un-clearable, for as long as it lives.
 */
export function clearSessionCookies(secure: boolean): string[] {
  return [SESSION_COOKIE_SECURE, SESSION_COOKIE_PLAIN].map((name) =>
    // A `__Host-` cookie must be Secure even when it is being deleted; a
    // non-secure delete for that name is rejected outright and the cookie
    // survives the sign-out.
    serializeCookie(name, '', {
      maxAge: 0,
      secure: name.startsWith('__Host-') ? true : secure,
      httpOnly: true,
      sameSite: 'Lax',
    }),
  );
}

/** The token on a request, whichever cookie name this deployment uses. */
export function tokenFromRequest(request: Request, secure: boolean): string | null {
  const cookies = parseCookies(request.headers.get('cookie'));
  return cookies.get(sessionCookieName(secure)) ?? null;
}

/**
 * Who is making this request, or `null`.
 *
 * The only function anything else should use to answer that question. It is
 * deliberately not cached and deliberately hits the store every time: a session
 * that was revoked a second ago must stop working a second ago, and every
 * shortcut around this lookup is a way for it not to.
 */
export async function currentUser(
  request: Request,
  store: Store,
  now: Date,
  secure: boolean,
): Promise<UserRecord | null> {
  const token = tokenFromRequest(request, secure);
  if (!token) return null;

  const found = await store.findSession(hashToken(token), now);
  return found?.user ?? null;
}
