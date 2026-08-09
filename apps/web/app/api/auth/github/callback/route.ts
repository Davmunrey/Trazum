import { authConfig } from '../../../../../lib/auth/config';
import { parseCookies, serializeCookie } from '../../../../../lib/auth/cookies';
import { exchangeCode, fetchIdentity, stateMatches, unpackState } from '../../../../../lib/auth/github';
import { authDisabled, authRateLimited, jsonError, redirect } from '../../../../../lib/auth/routes';
import { issueSession, stateCookieName } from '../../../../../lib/auth/session';
import { getStore } from '../../../../../lib/store';

export const runtime = 'nodejs';

/**
 * `GET /api/auth/github/callback` — finish signing in.
 *
 * The order of the checks is the security of this route, so it is worth reading
 * as an order rather than as a list:
 *
 * 1. **State first, before the code is spent.** The `state` in the query must
 *    match the nonce in our own cookie. Until that holds, the `code` parameter
 *    is an untrusted string that may have been minted by somebody else for
 *    somebody else's account, and exchanging it would sign this browser in as
 *    them. Nothing touches GitHub above this line.
 * 2. **The state cookie is cleared on every path out**, success or failure. It
 *    is single-use by construction; leaving it set turns a replayed callback URL
 *    into a second valid sign-in.
 * 3. **The access token never leaves this function.** It is exchanged, used
 *    once to read the profile, and dropped when the scope ends.
 */

/** Always cleared, whatever happens next. */
function clearState(secure: boolean): string {
  return serializeCookie(stateCookieName(secure), '', {
    maxAge: 0,
    secure,
    httpOnly: true,
    sameSite: 'Lax',
  });
}

export async function GET(request: Request): Promise<Response> {
  const config = authConfig();
  if (!config.enabled) return authDisabled(config);

  const cleared = clearState(config.secure);

  if (authRateLimited(request, Date.now())) {
    return jsonError('too many sign-in attempts, try again in a minute', 429, {
      'set-cookie': cleared,
    });
  }

  const url = new URL(request.url);
  const params = url.searchParams;

  // The user pressed Cancel on GitHub's consent screen. Not an error on our
  // side and not worth a stack trace — send them back to the page they left.
  if (params.get('error')) {
    return redirect('/?signin=cancelled', [cleared]);
  }

  const cookieValue = parseCookies(request.headers.get('cookie')).get(
    stateCookieName(config.secure),
  );

  if (!stateMatches(cookieValue ?? null, params.get('state'))) {
    // Deliberately vague to the caller and deliberately a 400. The two ways to
    // arrive here — a forged callback, and a real one that sat in a tab past the
    // ten-minute window — are indistinguishable from the outside, and telling
    // them apart would tell an attacker which half of the attack worked.
    return jsonError('sign-in could not be verified — start again', 400, {
      'set-cookie': cleared,
    });
  }

  const code = params.get('code');
  if (!code) {
    return jsonError('sign-in could not be verified — start again', 400, {
      'set-cookie': cleared,
    });
  }

  const exchanged = await exchangeCode(config, code, fetch);
  if ('error' in exchanged) {
    return jsonError(`GitHub declined the sign-in: ${exchanged.error}`, 502, {
      'set-cookie': cleared,
    });
  }

  const identity = await fetchIdentity(exchanged.accessToken, fetch);
  if ('error' in identity) {
    return jsonError(`GitHub declined the sign-in: ${identity.error}`, 502, {
      'set-cookie': cleared,
    });
  }

  const now = new Date();
  const store = await getStore();
  const user = await store.upsertUser(identity, now);
  const session = issueSession(user.id, now, config.secure);
  await store.createSession(session.record);

  // `next` comes back out of the cookie, not out of the URL, and has already
  // been through `safeNextPath` on both the way in and the way out.
  const next = unpackState(cookieValue ?? null)?.next ?? '/';
  return redirect(next, [session.setCookie, cleared]);
}
