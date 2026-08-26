import { authConfig } from '../../../../lib/auth/config';
import { sessionRateLimited } from '../../../../lib/auth/routes';
import { currentUser } from '../../../../lib/auth/session';
import { getStore } from '../../../../lib/store';

export const runtime = 'nodejs';

/**
 * `GET /api/auth/session` — who is this, and does this deployment have accounts?
 *
 * The one endpoint the browser asks before rendering the header. It answers
 * three questions and never more:
 *
 * - Is sign-in configured here at all? A deployment without a GitHub app should
 *   render no sign-in button, not a button that 503s.
 * - Who is signed in? Login, display name and avatar — the fields the header
 *   puts on screen. Not the internal id, not the provider id, not the session
 *   expiry: a value the page does not draw is a value that should not be in a
 *   response the page can be tricked into reading.
 * - Will this sign-in survive a restart? See `ephemeralSessions`.
 */
export async function GET(request: Request): Promise<Response> {
  const config = authConfig();

  if (!config.enabled) {
    /**
     * The refusal says why, which everything else here already does.
     *
     * `authConfig` computes a one-line reason for exactly this moment and
     * this branch used to drop it, so an operator whose sign-in never
     * appeared had nothing to read: no button, no error, no log line —
     * the same silence as a deployment that deliberately runs anonymous.
     * The two are different situations and only one of them wants fixing.
     *
     * Safe to say out loud: the reason names environment *variables*, never
     * their values, and those names are in the public documentation and in
     * this file's own imports. The header still renders nothing — absence
     * remains the honest rendering for a visitor — but the endpoint the
     * operator can curl now answers the question they are actually asking.
     */
    // Cache-Control on every branch, including this one. A signed-in answer
    // cached by a CDN is somebody else's identity served to a stranger.
    return Response.json(
      { enabled: false, user: null, ephemeralSessions: false, reason: config.reason },
      { headers: { 'cache-control': 'private, no-store' } },
    );
  }

  /**
   * Bounded from here down, which is where the work is.
   *
   * Below this line every call is an indexed lookup by token hash, made for an
   * unauthenticated caller, keyed on a cookie that caller chose. This was the
   * one auth route with no limiter while `lib/auth/routes.ts` exported one
   * twenty lines away, so the gap was an omission rather than a decision.
   *
   * After the disabled branch, not before it, and that ordering is deliberate.
   * The branch above exists so an operator whose sign-in never appeared can
   * `curl` this endpoint and read why; it touches no store and costs nothing,
   * and putting the limiter in front of it would ration the one answer somebody
   * debugging a deployment needs.
   *
   * `no-store` on the refusal as well. Every other branch here carries it
   * because a cached identity is somebody else's identity served to a stranger,
   * and a cached 429 is the same mistake with a smaller blast radius.
   */
  if (sessionRateLimited(request, Date.now())) {
    return Response.json(
      { error: 'too many requests, try again in a minute' },
      { status: 429, headers: { 'cache-control': 'private, no-store' } },
    );
  }

  const store = await getStore();
  const user = await currentUser(request, store, new Date(), config.secure);

  return Response.json(
    {
      enabled: true,
      provider: 'github',
      user: user && {
        login: user.login,
        name: user.name,
        avatarUrl: user.avatarUrl,
      },
      /**
       * True when the store is in memory, which is the default.
       *
       * Reported rather than hidden because the consequence is visible and
       * confusing: on a platform that runs more than one instance, the same
       * browser is signed in against one of them and signed out against the
       * next. The header says so, so that the first time it happens it is a
       * documented limitation instead of a bug report.
       */
      ephemeralSessions: store.ephemeral,
    },
    { headers: { 'cache-control': 'private, no-store' } },
  );
}
