import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import type { SessionRecord, Store, UserRecord } from '../store/types';
import { DEFAULT_SESSION_POLICY, type SessionPolicy } from './config';
import { parseCookies, serializeCookie } from './cookies';

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

/**
 * A new session, its row and its cookie.
 *
 * The row ends one idle window from now, or at the end of its lifetime if that
 * is sooner; every request that finds it pushes the end out again, up to the
 * lifetime (see `renewal`). The cookie lasts the whole lifetime, because the
 * browser cannot know when the session was last used and the server can.
 */
export function issueSession(
  userId: string,
  now: Date,
  secure: boolean,
  policy: SessionPolicy = DEFAULT_SESSION_POLICY,
): IssuedSession {
  const token = mintToken();
  const record: SessionRecord = {
    tokenHash: hashToken(token),
    userId,
    createdAt: now,
    expiresAt: new Date(now.getTime() + Math.min(policy.idleSeconds, policy.maxSeconds) * 1000),
  };

  return {
    token,
    record,
    setCookie: serializeCookie(sessionCookieName(secure), token, {
      maxAge: policy.maxSeconds,
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
 * How far the stored end of a session may lag behind the true one before a
 * request writes it again: a tenth of the idle window, and never more than
 * five minutes.
 *
 * Without it every authenticated request would be a write. With it a session
 * in use is written at most once every five minutes, and the price is paid in
 * the safe direction: a session can end up to this much *earlier* than its
 * idle window says, never later.
 */
export function refreshStepMs(policy: SessionPolicy): number {
  return Math.min(policy.idleSeconds * 100, 5 * 60 * 1000);
}

export type Renewal =
  | { kind: 'end' }
  | { kind: 'keep' }
  | { kind: 'refresh'; expiresAt: Date };

/**
 * What a request that found `session` at `now` does to it.
 *
 * - **end** when the lifetime is over, counted from the sign-in under today's
 *   policy, so lowering `TRAZUM_SESSION_MAX_HOURS` ends the sessions it now
 *   forbids at their next use.
 * - **end** when the stored end is further away than one idle window from now.
 *   No row this code writes can be, so the row was written under a longer
 *   window: a session from before idle timeouts existed, or one issued before
 *   the operator shortened the window. How long it then sat unused is not
 *   recorded anywhere, so it is not given the benefit of the doubt; its owner
 *   signs in again. One refresh step of slack keeps a few seconds of clock
 *   difference between two instances from ending a session that is fine.
 * - **refresh** when the end has fallen behind by a refresh step or more.
 * - **keep** otherwise.
 *
 * Pure, so every branch is tested without a store or a clock.
 */
export function renewal(session: SessionRecord, now: Date, policy: SessionPolicy): Renewal {
  const cap = session.createdAt.getTime() + policy.maxSeconds * 1000;
  if (cap <= now.getTime()) return { kind: 'end' };

  const idleMs = policy.idleSeconds * 1000;
  const step = refreshStepMs(policy);
  if (session.expiresAt.getTime() - now.getTime() > idleMs + step) return { kind: 'end' };

  const next = Math.min(now.getTime() + idleMs, cap);
  if (Math.abs(next - session.expiresAt.getTime()) < step) return { kind: 'keep' };
  return { kind: 'refresh', expiresAt: new Date(next) };
}

/**
 * Who is making this request, or `null`.
 *
 * The only function anything else should use to answer that question. It is
 * deliberately not cached and deliberately hits the store every time: a session
 * that was revoked a second ago must stop working a second ago, and every
 * shortcut around this lookup is a way for it not to.
 *
 * It is also where a session is kept alive. Finding one counts as using it, so
 * its end moves one idle window on, never past its lifetime (`renewal`). A
 * refresh that fails is swallowed: the session ends a little sooner than it
 * would have, which is the safe direction, and a read must not become a 500
 * because a write did not land.
 *
 * Takes the deployment's configuration rather than a bare `secure` flag so the
 * session policy cannot be left out at a call site: every caller already holds
 * an enabled `authConfig()`, which carries both.
 */
export async function currentUser(
  request: Request,
  store: Store,
  now: Date,
  config: { secure: boolean; session: SessionPolicy },
): Promise<UserRecord | null> {
  return (await currentSession(request, store, now, config))?.user ?? null;
}

/**
 * `currentUser`, with the session it was found by: what a route needs when it
 * acts on sessions themselves rather than on what an account owns.
 */
export async function currentSession(
  request: Request,
  store: Store,
  now: Date,
  config: { secure: boolean; session: SessionPolicy },
): Promise<{ user: UserRecord; session: SessionRecord } | null> {
  const token = tokenFromRequest(request, config.secure);
  if (!token) return null;

  const hash = hashToken(token);
  const found = await store.findSession(hash, now);
  if (!found) return null;

  const next = renewal(found.session, now, config.session);
  if (next.kind === 'end') {
    // The answer is null whether or not the delete lands: the row is dead by
    // policy, and the next request reaches the same verdict.
    await store.deleteSession(hash).catch(() => {});
    return null;
  }
  if (next.kind === 'refresh') {
    const moved = await store.touchSession(hash, next.expiresAt, now).catch(() => false);
    if (moved) return { user: found.user, session: { ...found.session, expiresAt: next.expiresAt } };
  }
  return found;
}

// ---------------------------------------------------------------------------
// Seeing and ending your own sessions (OWASP ASVS 4.0.3 3.3.4)
// ---------------------------------------------------------------------------

/**
 * How long a sign-in counts as credentials just entered.
 *
 * ASVS 3.3.4 asks that ending other sessions, or all of them, follows
 * entering credentials again. Sign-in here is GitHub's, so "again" is a fresh
 * round trip through it: a session started in the last fifteen minutes. A
 * stolen cookie is older than that, and on its own it cannot become younger,
 * so whoever holds only a cookie cannot sign its owner out of anywhere.
 */
export const REAUTH_WINDOW_MS = 15 * 60 * 1000;

/** Whether `session` was started recently enough to end other sessions. */
export function signedInRecently(session: SessionRecord, now: Date): boolean {
  const age = now.getTime() - session.createdAt.getTime();
  return age >= 0 && age < REAUTH_WINDOW_MS;
}

/**
 * The name a page may hold for a session.
 *
 * Derived from the token's hash under a label of its own, so it is stable for
 * the session's life and reveals neither the token nor the hash the table is
 * keyed by. Sixteen bytes: unique among one account's sessions by a margin
 * nobody will meet.
 */
export function publicSessionId(tokenHash: string): string {
  return createHash('sha256').update(`trazum session id\u0000${tokenHash}`).digest('hex').slice(0, 32);
}

/**
 * When a session was last used, as well as the table can say.
 *
 * Its end is one idle window after its last refresh, so the window back from
 * the end is that refresh: late by at most one refresh step (five minutes),
 * and early when the lifetime caps the end. Never before the sign-in, never
 * after now.
 */
export function lastActiveAt(session: SessionRecord, policy: SessionPolicy, now: Date): Date {
  const back = session.expiresAt.getTime() - policy.idleSeconds * 1000;
  return new Date(Math.min(now.getTime(), Math.max(session.createdAt.getTime(), back)));
}
