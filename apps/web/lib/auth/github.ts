import { randomBytes } from 'node:crypto';

import type { NewUser } from '../store/types';
import type { AuthEnabled } from './config';
import { OAUTH_STATE_TTL_SECONDS, safeEqual } from './session';

/**
 * The GitHub half of signing in: three HTTP hops and the rules about each.
 *
 * Everything here takes `fetchImpl` rather than reaching for the global, which
 * is how the tests exercise the real code paths — a refused exchange, a
 * malformed identity, a token that GitHub rejects — without a network.
 */

const AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const TOKEN_URL = 'https://github.com/login/oauth/access_token';
const USER_URL = 'https://api.github.com/user';

/**
 * The least GitHub will give us.
 *
 * `read:user` is the profile and nothing else: no repositories, no email
 * addresses, no organisation membership, no write anywhere. Trazum needs a
 * stable id and a name to show, and asking for more would make the consent
 * screen tell a lie about what this is for.
 */
export const SCOPE = 'read:user';

export interface GithubIdentity extends NewUser {
  provider: 'github';
}

// ---------------------------------------------------------------------------
// Where to come back to
// ---------------------------------------------------------------------------

/**
 * Any C0 control character, or DEL.
 *
 * These matter to a redirect target because browsers strip tab, newline and
 * carriage return from a URL before parsing it. A path containing one is a
 * different string from the destination it actually reaches, which is exactly
 * the gap a filter is supposed to close.
 */
function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const point = character.codePointAt(0) ?? 0;
    if (point < 0x20 || point === 0x7f) return true;
  }
  return false;
}

/**
 * A post-sign-in destination that cannot leave this site.
 *
 * Returns `/` for anything it is not certain about, which is the correct
 * failure: the cost of ignoring a legitimate `?next=` is one extra click, and
 * the cost of honouring a hostile one is handing a phishing page the referrer
 * and the user's trust in the domain they just authenticated to.
 *
 * The three rejections that are not obvious:
 *
 * - `//evil.example` is protocol-relative. It reads as a path and navigates to
 *   another origin.
 * - `/\evil.example` is the same attack: browsers normalise a backslash in the
 *   authority position to a forward slash, so this becomes `//evil.example`.
 * - Anything containing a control character, because `\t`, `\n` and `\r` are
 *   stripped from URLs by browsers before parsing — which means `/\t/evil` and
 *   `//evil` are the same destination, arriving as different strings.
 */
export function safeNextPath(raw: string | null): string {
  if (!raw) return '/';
  if (!raw.startsWith('/')) return '/';
  if (raw.startsWith('//') || raw.startsWith('/\\')) return '/';
  // Checked by code point rather than with a regular expression literal.
  // The obvious spelling of that class puts a NUL and a run of control bytes
  // into this source file, which makes the file binary — a mistake this
  // repository has already shipped once, in a test, and had to be told about
  // by a guard. Comparing numbers avoids the question.
  if (hasControlCharacter(raw)) return '/';
  if (raw.length > 512) return '/';
  return raw;
}

// ---------------------------------------------------------------------------
// State: the CSRF defence on the callback
// ---------------------------------------------------------------------------

/**
 * The state cookie carries three things: the nonce, when it was issued, and
 * where to go afterwards.
 *
 * The destination rides in the cookie rather than in the URL so that it makes
 * the round trip through GitHub without being visible or editable at the point
 * the browser comes back. Encoded so it cannot contain the separator or any
 * character a cookie value may not hold.
 *
 * **The timestamp is the half that used to be missing.** `OAUTH_STATE_TTL_SECONDS`
 * was applied only as the cookie's `maxAge`, which is a request to the browser
 * rather than a rule this app keeps, while the callback's own comment described
 * "a real one that sat in a tab past the ten-minute window" as a case it
 * handled. Nothing checked it. The window is in the value now, and
 * `stateMatches` reads it.
 *
 * **What that binds, and what it does not.** It binds a browser, which is the
 * case the window is about: a callback URL left in an open tab, in history, or
 * in a proxy log stops being usable ten minutes after it was issued rather than
 * whenever the browser gets round to dropping the cookie. It does not bind a
 * client that writes its own cookie, and it is not signed to make it so,
 * because there is nothing there to gain: anyone who can set this cookie can
 * equally ask for a fresh one, so a forged timestamp buys an attacker a state
 * they could have had for free.
 */
export function packState(nonce: string, next: string, issuedAt: Date): string {
  const seconds = Math.floor(issuedAt.getTime() / 1000);
  return `${nonce}.${seconds}.${Buffer.from(next, 'utf8').toString('base64url')}`;
}

export function unpackState(
  packed: string | null,
): { nonce: string; next: string; issuedAt: number } | null {
  if (!packed) return null;

  const first = packed.indexOf('.');
  if (first < 1) return null;
  const second = packed.indexOf('.', first + 1);
  /**
   * A two-part value is the old format, and it is refused rather than accepted
   * without a window. During a deploy a browser can be mid-sign-in holding one,
   * and the cost of refusing is a 400 that says "start again" and one more
   * click, inside a ten-minute window. Accepting it would mean the guard has a
   * shape that switches itself off, which is the kind of guard that survives
   * long after the format it was written for.
   */
  if (second < first + 2) return null;

  const nonce = packed.slice(0, first);
  const issuedAt = Number(packed.slice(first + 1, second));
  // `Number` turns an empty string into 0 and anything else odd into NaN, and
  // both are values a clock never produced.
  if (!Number.isSafeInteger(issuedAt) || issuedAt <= 0) return null;

  let next = '/';
  try {
    next = Buffer.from(packed.slice(second + 1), 'base64url').toString('utf8');
  } catch {
    return null;
  }

  return { nonce, next: safeNextPath(next), issuedAt };
}

export function mintNonce(): string {
  return randomBytes(24).toString('base64url');
}

/**
 * Does the `state` GitHub sent back match the one we set on the way out?
 *
 * The single check that makes login CSRF impossible: without it, an attacker
 * can complete their own authorisation and hand the resulting callback URL to a
 * victim, silently signing the victim into the attacker's account — after which
 * everything the victim saves is in a library the attacker can read.
 */
export function stateMatches(
  cookieValue: string | null,
  queryState: string | null,
  now: Date,
): boolean {
  const unpacked = unpackState(cookieValue);
  if (!unpacked || !queryState) return false;

  /**
   * The window, checked here rather than left to the browser.
   *
   * Both ends of it. Past the TTL is the case the ten minutes were written
   * for; issued in the future is a clock that disagrees with ours, and a state
   * whose age is negative has no window at all, so it is refused too rather
   * than granted an unbounded one.
   */
  const age = Math.floor(now.getTime() / 1000) - unpacked.issuedAt;
  if (age < 0 || age > OAUTH_STATE_TTL_SECONDS) return false;

  return safeEqual(unpacked.nonce, queryState);
}

// ---------------------------------------------------------------------------
// The three hops
// ---------------------------------------------------------------------------

export function authorizeUrl(config: AuthEnabled, nonce: string): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', config.redirectUri);
  url.searchParams.set('scope', SCOPE);
  url.searchParams.set('state', nonce);
  // Without this, GitHub silently reuses an existing authorisation and the user
  // never learns which account they are about to sign in as.
  url.searchParams.set('allow_signup', 'false');
  return url.toString();
}

export type Fetch = typeof fetch;

interface Failure {
  error: string;
}

/**
 * Trade the one-time code for an access token.
 *
 * The token is returned to the caller and, deliberately, goes no further than
 * the next function. It is never written to the store, never put in a cookie
 * and never logged. Trazum's copy of it lives for the length of one request,
 * which is the only interval in which it can be stolen from us.
 */
export async function exchangeCode(
  config: AuthEnabled,
  code: string,
  fetchImpl: Fetch,
): Promise<{ accessToken: string } | Failure> {
  let response: Response;
  try {
    response = await fetchImpl(TOKEN_URL, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        redirect_uri: config.redirectUri,
      }),
    });
  } catch {
    return { error: 'could not reach GitHub' };
  }

  if (!response.ok) return { error: `GitHub refused the code exchange (${response.status})` };

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { error: 'GitHub returned a malformed token response' };
  }

  const body = payload as { access_token?: unknown; error_description?: unknown; error?: unknown };

  // GitHub answers a rejected exchange with HTTP 200 and an `error` field, so
  // `response.ok` above proves nothing on its own. Checking the status and
  // stopping there is the mistake this branch exists to not make.
  if (typeof body.access_token !== 'string' || !body.access_token) {
    const detail =
      typeof body.error_description === 'string'
        ? body.error_description
        : typeof body.error === 'string'
          ? body.error
          : 'no access token in the response';
    return { error: detail };
  }

  return { accessToken: body.access_token };
}

/** Read the account behind the token. The one and only use of it. */
export async function fetchIdentity(
  accessToken: string,
  fetchImpl: Fetch,
): Promise<GithubIdentity | Failure> {
  let response: Response;
  try {
    response = await fetchImpl(USER_URL, {
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${accessToken}`,
        'x-github-api-version': '2022-11-28',
        'user-agent': 'trazum',
      },
    });
  } catch {
    return { error: 'could not reach GitHub' };
  }

  if (!response.ok) return { error: `GitHub refused the profile request (${response.status})` };

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { error: 'GitHub returned a malformed profile' };
  }

  const body = payload as { id?: unknown; login?: unknown; name?: unknown; avatar_url?: unknown };

  // The id is required and the login is required; everything else is decoration
  // and may legitimately be absent. An identity missing its id is not an
  // identity, and accepting one would key an account on `undefined`.
  if (typeof body.id !== 'number' && typeof body.id !== 'string') {
    return { error: 'GitHub profile has no id' };
  }
  if (typeof body.login !== 'string' || !body.login) {
    return { error: 'GitHub profile has no login' };
  }

  return {
    provider: 'github',
    providerId: String(body.id),
    login: body.login,
    name: typeof body.name === 'string' && body.name ? body.name : null,
    avatarUrl: typeof body.avatar_url === 'string' && body.avatar_url ? body.avatar_url : null,
  };
}
