import { authConfig } from '../../../lib/auth/config';
import { authDisabled, authRateLimited, jsonError, sameOrigin } from '../../../lib/auth/routes';
import {
  clearSessionCookies,
  currentUser,
  safeEqual,
} from '../../../lib/auth/session';
import { getStore } from '../../../lib/store';

export const runtime = 'nodejs';

/**
 * `DELETE /api/account` — delete this account and everything in it.
 *
 * Immediate and irreversible. What goes is stated rather than implied: the
 * account row, every session, every prompt and every version of each, and every
 * `/c/<token>` link the account ever published. That last one is the part with
 * somebody else on the other end of it, and it still goes: keeping a share
 * would mean keeping the deleted person's prompt text and their login, which is
 * not a deletion.
 *
 * **Whose account is never a parameter.** The user is resolved from the
 * caller's own cookie. There is no id, no login and no body field naming a
 * target, so the worst any caller can do is delete themselves. This is the same
 * shape the wide sign-out uses and for the same reason, and it matters more
 * here because the operation cannot be undone.
 *
 * **The confirmation is checked on this side.** The browser asks somebody to
 * type their login, and a browser can be bypassed by anyone willing to open a
 * terminal. Requiring the login in the request body means the check is a rule
 * this route keeps rather than a dialog it hopes somebody read.
 */
export async function DELETE(request: Request): Promise<Response> {
  const config = authConfig();
  if (!config.enabled) return authDisabled(config);

  if (!sameOrigin(request, config)) {
    return jsonError('cross-origin account deletion refused', 403);
  }

  /**
   * The sign-in bucket, shared on purpose, which is the opposite of the call
   * `/api/auth/session` needed.
   *
   * That endpoint is polled by the header on every page load, so sharing would
   * have let ordinary browsing refuse somebody at the moment they pressed sign
   * in. This one is pressed once in an account's life, by a person who has
   * already read a confirmation, so it belongs with the other rare deliberate
   * auth actions rather than in a budget of its own that nothing would ever
   * spend.
   */
  if (authRateLimited(request, Date.now())) {
    return jsonError('too many requests, try again in a minute', 429);
  }

  const store = await getStore();
  const user = await currentUser(request, store, new Date(), config.secure);
  // 401 and not 404: this is the one route where telling an unauthenticated
  // caller "there is nothing here" and telling them "you are not signed in"
  // are the same sentence, and the honest one is shorter.
  if (!user) return jsonError('sign in to delete your account', 401);

  let confirm: unknown;
  try {
    confirm = ((await request.json()) as { confirm?: unknown })?.confirm;
  } catch {
    confirm = undefined;
  }

  /**
   * Constant-time, and not because the login is a secret.
   *
   * It is on the page, in the URL of every share, and on GitHub. The comparison
   * is `safeEqual` because the alternative reads as a decision that this one
   * comparison did not need care, and the next person to copy this block may be
   * comparing something that does. It costs nothing to be uniform.
   */
  if (typeof confirm !== 'string' || !safeEqual(confirm, user.login)) {
    return jsonError('type your login exactly to confirm', 400);
  }

  await store.deleteUser(user.id);

  // The cookies are cleared whatever the store said. A browser still holding a
  // session cookie for a row that no longer exists is a browser that will look
  // signed in until its next request, and there is no reason to make somebody
  // watch that.
  const headers = new Headers();
  for (const cookie of clearSessionCookies(config.secure)) headers.append('set-cookie', cookie);

  // 204, and no count of what was deleted. A number here would be the one place
  // this app told somebody how much of their data it had been holding at the
  // exact moment they stopped being able to check.
  return new Response(null, { status: 204, headers });
}
