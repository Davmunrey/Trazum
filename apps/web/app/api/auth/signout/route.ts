import { authConfig } from '../../../../lib/auth/config';
import { authDisabled, jsonError, sameOrigin } from '../../../../lib/auth/routes';
import { clearSessionCookies, hashToken, tokenFromRequest } from '../../../../lib/auth/session';
import { getStore } from '../../../../lib/store';

export const runtime = 'nodejs';

/**
 * `POST /api/auth/signout` — end this session, or every session this account has.
 *
 * POST and not GET, which is not pedantry: a sign-out on GET can be triggered by
 * any image tag on any page on the internet, and while logging someone out is a
 * mild attack it is still an attack, and the fix costs one attribute.
 *
 * The row is deleted before the cookie is cleared. Doing it the other way round
 * leaves a live session in the database whose token the browser has just
 * forgotten: invisible, unrevokable through the UI, and valid for a month.
 *
 * **`?all=1` revokes every session the account has**, which is the thing
 * somebody wants at the moment they realise a laptop is gone. Until now
 * `deleteSessionsForUser` existed in the interface and in both drivers with no
 * caller anywhere, so the only revocation available was for the session doing
 * the asking, and a stolen cookie stayed valid for the rest of its thirty days
 * with nothing its owner could do about it.
 *
 * Opt-in rather than the default, because the common case is one person leaving
 * one shared machine and they should not lose their phone with it.
 */
export async function POST(request: Request): Promise<Response> {
  const config = authConfig();
  if (!config.enabled) return authDisabled(config);

  if (!sameOrigin(request, config)) {
    return jsonError('cross-origin sign-out refused', 403);
  }

  /**
   * The only proof a caller may revoke an account's sessions is that they hold
   * one of them, so the user is resolved from this request's own cookie and
   * never from anything the caller names. There is no parameter here that says
   * whose sessions to end, and that absence is the authorisation.
   */
  const everywhere = new URL(request.url).searchParams.get('all') === '1';

  const token = tokenFromRequest(request, config.secure);
  if (token) {
    const store = await getStore();
    const hash = hashToken(token);

    const found = everywhere ? await store.findSession(hash, new Date()) : null;
    if (found) await store.deleteSessionsForUser(found.user.id);
    // Also the fallback when `all` was asked for and the token resolved to
    // nothing: deleting a hash that is not there costs nothing, and the
    // alternative is a branch that quietly does less than it was asked.
    else await store.deleteSession(hash);
  }

  const headers = new Headers();
  for (const cookie of clearSessionCookies(config.secure)) headers.append('set-cookie', cookie);

  // 204 whether or not there was a session to end, and whether one session went
  // or twenty. "You are signed out" is true either way, and a different answer
  // for "there was nothing to sign out of" would let an unauthenticated caller
  // test cookies for validity. A count would answer a question nobody holding a
  // valid cookie needs and every holder of a stolen one would like.
  return new Response(null, { status: 204, headers });
}
