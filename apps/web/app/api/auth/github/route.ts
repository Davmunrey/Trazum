import { authConfig } from '../../../../lib/auth/config';
import { serializeCookie } from '../../../../lib/auth/cookies';
import { authorizeUrl, mintNonce, packState, safeNextPath } from '../../../../lib/auth/github';
import { authDisabled, authRateLimited, jsonError, redirect } from '../../../../lib/auth/routes';
import { OAUTH_STATE_TTL_SECONDS, stateCookieName } from '../../../../lib/auth/session';

export const runtime = 'nodejs';

/**
 * `GET /api/auth/github` — begin signing in.
 *
 * Mints a nonce, remembers it in a short-lived HttpOnly cookie together with
 * where to return to, and sends the browser to GitHub. Nothing is written to
 * the store yet: an abandoned sign-in should leave no trace, and a route that
 * created a row before the user had consented would let anyone fill the table
 * by opening a link.
 */
export async function GET(request: Request): Promise<Response> {
  const config = authConfig();
  if (!config.enabled) return authDisabled(config);

  if (authRateLimited(request, Date.now())) {
    return jsonError('too many sign-in attempts, try again in a minute', 429);
  }

  const nonce = mintNonce();
  const next = safeNextPath(new URL(request.url).searchParams.get('next'));

  const stateCookie = serializeCookie(stateCookieName(config.secure), packState(nonce, next, new Date()), {
    maxAge: OAUTH_STATE_TTL_SECONDS,
    secure: config.secure,
    httpOnly: true,
    sameSite: 'Lax',
  });

  return redirect(authorizeUrl(config, nonce), [stateCookie]);
}
