import { createRateLimiter } from '../rate-limit';
import type { AuthConfig, AuthEnabled } from './config';

/**
 * The pieces every sign-in route needs, kept out of the handlers themselves.
 *
 * Responses here are built from the platform's `Response` rather than
 * `NextResponse`, unlike the two older routes. Two reasons, both practical: a
 * sign-out has to send more than one `Set-Cookie`, which needs `Headers.append`
 * on a response object we own, and a redirect that carries cookies is easier to
 * assert on when the test can read the raw header it will actually send.
 */

/**
 * Sign-in attempts per minute per address.
 *
 * Thirty, matching the other two routes, and the number is worth explaining
 * because the obvious reasoning gives the wrong answer. Nobody signs in ten
 * times a minute by accident, so ten looks generous — until the address is a
 * corporate NAT and the ten people who tried to sign in after the Monday
 * standup are refused because they share an egress IP.
 *
 * The limiter keys on an address, not on a person, so the budget has to be an
 * office's and not an individual's. What it is actually here to stop is a
 * script hammering the callback and spending our GitHub quota, and thirty a
 * minute per address bounds that perfectly well.
 */
export const authRateLimited = createRateLimiter({ windowMs: 60_000, max: 30 });

export function jsonError(message: string, status: number, headers?: HeadersInit): Response {
  return Response.json({ error: message }, { status, headers });
}

/** 503, not 404: the route exists, the deployment has not configured it. */
export function authDisabled(config: Extract<AuthConfig, { enabled: false }>): Response {
  return jsonError(`sign-in is not configured on this deployment: ${config.reason}`, 503);
}

/**
 * A redirect that also sets cookies.
 *
 * `Location` is always same-origin here: every caller passes either a path from
 * `safeNextPath` or GitHub's authorize URL, which is a constant.
 */
export function redirect(location: string, cookies: string[]): Response {
  const headers = new Headers({ location });
  for (const cookie of cookies) headers.append('set-cookie', cookie);
  // 303 rather than 302: the method for the next request is unambiguously GET,
  // which matters for the sign-out redirect and costs nothing for the others.
  return new Response(null, { status: 303, headers });
}

/**
 * Is this request coming from our own page?
 *
 * Applied to the state-changing routes on top of `SameSite=Lax`, because the
 * two fail differently: `SameSite` is enforced by the browser and absent in
 * anything that is not one, and this check is enforced here and absent when the
 * client sends no `Origin` at all.
 *
 * A missing `Origin` is accepted. Browsers attach it to every cross-origin
 * request and to every POST, so an absent header means a non-browser client —
 * `curl`, a script, an integration test — and those are not the thing CSRF is
 * about. What is refused is an `Origin` that is present and is somebody else.
 */
export function sameOrigin(request: Request, config: AuthEnabled): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  return origin === config.publicUrl;
}
