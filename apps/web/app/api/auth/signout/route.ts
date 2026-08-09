import { authConfig } from '../../../../lib/auth/config';
import { authDisabled, jsonError, sameOrigin } from '../../../../lib/auth/routes';
import { clearSessionCookies, hashToken, tokenFromRequest } from '../../../../lib/auth/session';
import { getStore } from '../../../../lib/store';

export const runtime = 'nodejs';

/**
 * `POST /api/auth/signout` — end this session.
 *
 * POST and not GET, which is not pedantry: a sign-out on GET can be triggered by
 * any image tag on any page on the internet, and while logging someone out is a
 * mild attack it is still an attack, and the fix costs one attribute.
 *
 * The row is deleted before the cookie is cleared. Doing it the other way round
 * leaves a live session in the database whose token the browser has just
 * forgotten — invisible, unrevokable through the UI, and valid for a month.
 */
export async function POST(request: Request): Promise<Response> {
  const config = authConfig();
  if (!config.enabled) return authDisabled(config);

  if (!sameOrigin(request, config)) {
    return jsonError('cross-origin sign-out refused', 403);
  }

  const token = tokenFromRequest(request, config.secure);
  if (token) {
    const store = await getStore();
    await store.deleteSession(hashToken(token));
  }

  const headers = new Headers();
  for (const cookie of clearSessionCookies(config.secure)) headers.append('set-cookie', cookie);

  // 204 whether or not there was a session to end. "You are signed out" is true
  // either way, and a different answer for "there was nothing to sign out of"
  // would let an unauthenticated caller test cookies for validity.
  return new Response(null, { status: 204, headers });
}
