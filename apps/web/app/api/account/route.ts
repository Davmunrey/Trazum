import { authConfig } from '../../../lib/auth/config';
import { authDisabled, authRateLimited, jsonError, sameOrigin } from '../../../lib/auth/routes';
import {
  clearSessionCookies,
  currentUser,
  safeEqual,
} from '../../../lib/auth/session';
import { attributeRequest, logsRefusedInput, routeOf, securityEvent, unreadableBody } from '../../../lib/security-log';
import { shareUrl } from '../../../lib/shares/api';
import { getStore } from '../../../lib/store';
import { saysJson } from '../../../lib/request-body';

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
async function handleDelete(request: Request): Promise<Response> {
  const config = authConfig();
  if (!config.enabled) return authDisabled(config);

  if (!sameOrigin(request, config)) {
    securityEvent('account.deleted', 'failure', { reason: 'cross_origin', route: routeOf(request) });
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
  if (await authRateLimited(request, Date.now())) {
    securityEvent('account.deleted', 'failure', { reason: 'rate_limited', route: routeOf(request) });
    return jsonError('too many requests, try again in a minute', 429);
  }

  const store = await getStore();
  const user = await currentUser(request, store, new Date(), config);
  // 401 and not 404: this is the one route where telling an unauthenticated
  // caller "there is nothing here" and telling them "you are not signed in"
  // are the same sentence, and the honest one is shorter.
  if (!user) {
    securityEvent('account.deleted', 'failure', { reason: 'not_signed_in', route: routeOf(request) });
    return jsonError('sign in to delete your account', 401);
  }
  attributeRequest(request, user.id);

  if (!saysJson(request)) return jsonError('send the confirmation as JSON, with content-type: application/json', 415);

  let confirm: unknown;
  try {
    confirm = ((await request.json()) as { confirm?: unknown })?.confirm;
  } catch {
    return unreadableBody(jsonError('send the confirmation as JSON: {"confirm": "<your login>"}', 400));
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
  // The id is all that is left of the account, and it points at nothing now.
  securityEvent('account.deleted', 'success', { userId: user.id, route: routeOf(request) });

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


/**
 * `GET /api/account` — everything this account holds, as one file.
 *
 * The other half of `DELETE`: a person can take their data with them as well
 * as remove it. Written for the compliance readiness pack, because every
 * framework it maps to asks for both (OWASP ASVS V8.3, SOC 2 P5 and P6, the
 * GDPR's rights of access and portability), and this app could only do one.
 *
 * **What is in it:** the account as the app stores it (provider, provider id,
 * login, name, avatar, when it was created), every saved prompt with every
 * version and note, and every share link that is still live with the text it
 * publishes. **What is not:** sessions, because only a hash of each token is
 * stored and it opens nothing, and expired share links, which no longer exist
 * as far as anyone can see.
 *
 * Signed-in only, rate-limited like the other account routes, never cached,
 * and offered as a download. A `GET` needs no same-origin check: another site
 * can send one, but without CORS it can never read the answer.
 */
async function handleGet(request: Request): Promise<Response> {
  const config = authConfig();
  if (!config.enabled) return authDisabled(config);
  const route = routeOf(request);

  if (await authRateLimited(request, Date.now())) {
    securityEvent('account.exported', 'failure', { reason: 'rate_limited', route });
    return jsonError('too many requests, try again in a minute', 429);
  }

  const store = await getStore();
  const now = new Date();
  const user = await currentUser(request, store, now, config);
  if (!user) {
    securityEvent('account.exported', 'failure', { reason: 'not_signed_in', route });
    return jsonError('sign in to export your account', 401);
  }

  const prompts = [];
  for (const summary of await store.prompts.listPrompts(user.id)) {
    const prompt = await store.prompts.getPrompt(summary.id, user.id);
    if (!prompt) continue;
    prompts.push({
      id: prompt.id,
      name: prompt.name,
      createdAt: prompt.createdAt.toISOString(),
      updatedAt: prompt.updatedAt.toISOString(),
      // Oldest first: an export reads as the history it is, whatever order the library shows.
      versions: [...prompt.versions].sort((a, b) => a.version - b.version).map((version) => ({
        version: version.version,
        text: version.text,
        note: version.note,
        createdAt: version.createdAt.toISOString(),
      })),
    });
  }

  const shares = [];
  for (const summary of await store.shares.listShares(user.id, now)) {
    const share = await store.shares.findShare(summary.token, now);
    if (!share || share.ownerId !== user.id) continue;
    shares.push({
      url: shareUrl(config.publicUrl, share.token),
      before: share.beforeText,
      after: share.afterText,
      settings: share.settings,
      createdAt: share.createdAt.toISOString(),
      expiresAt: share.expiresAt?.toISOString() ?? null,
    });
  }

  const body = {
    format: 'trazum-account-export',
    version: 1,
    exportedAt: now.toISOString(),
    account: {
      provider: user.provider,
      providerId: user.providerId,
      login: user.login,
      name: user.name,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt.toISOString(),
    },
    prompts,
    shares,
    notIncluded: [
      'sessions: only a hash of each session token is stored, and it opens nothing',
      'expired share links: they no longer exist for anyone',
    ],
  };

  securityEvent('account.exported', 'success', { userId: user.id, route }, now);
  const day = now.toISOString().slice(0, 10);
  return new Response(`${JSON.stringify(body, null, 2)}\n`, {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="trazum-account-${day}.json"`,
      'cache-control': 'private, no-store',
    },
  });
}

export const DELETE = logsRefusedInput(handleDelete);
export const GET = logsRefusedInput(handleGet);
