import { authConfig } from '../../../../lib/auth/config';
import { authDisabled, authRateLimited, jsonError, sameOrigin, sessionRateLimited } from '../../../../lib/auth/routes';
import {
  REAUTH_WINDOW_MS,
  clearSessionCookies,
  currentSession,
  lastActiveAt,
  publicSessionId,
  signedInRecently,
} from '../../../../lib/auth/session';
import { saysJson } from '../../../../lib/request-body';
import { attributeRequest, logsRefusedInput, routeOf, securityEvent, unreadableBody } from '../../../../lib/security-log';
import { getStore } from '../../../../lib/store';

export const runtime = 'nodejs';

/**
 * `/api/auth/sessions` — where this account is signed in, and ending any of it
 * (OWASP ASVS 4.0.3 3.3.4).
 *
 * Until this route the only ways to end a session were this one (*sign out*)
 * or all of them (*sign out everywhere*). A person who saw a session they did
 * not recognise could not see it in the first place, and the only remedy for
 * one forgotten laptop was signing every other device out with it.
 *
 * **What a session is shown as.** When it started, when it was last used to
 * within a few minutes, and whether it is the one asking. Nothing about the
 * device: telling one browser from another would mean keeping its user agent
 * or its address, and this app keeps neither (`docs/accounts.md`). The id is
 * derived from the token's hash under a label of its own, so the page holds a
 * name for the session and never the token or the hash the table is keyed by.
 *
 * **Ending another session needs a recent sign-in.** ASVS asks for
 * credentials to be entered again first. Sign-in is GitHub's, so the proof is
 * a session started in the last fifteen minutes: a stolen cookie is older than
 * that and cannot make itself younger, so a cookie alone cannot sign its owner
 * out of anywhere. Ending the session doing the asking needs nothing more than
 * *sign out* does.
 *
 * The account is always the one whose cookie came with the request. There is
 * no parameter that names an account, and a session id from somebody else's
 * list matches nothing in this one's.
 */

const PRIVATE = { 'cache-control': 'private, no-store' };

async function handleGet(request: Request): Promise<Response> {
  const config = authConfig();
  if (!config.enabled) return authDisabled(config);

  if (await sessionRateLimited(request, Date.now())) {
    securityEvent('access.refused', 'failure', { reason: 'rate_limited', route: routeOf(request) });
    return jsonError('too many requests, try again in a minute', 429);
  }

  const now = new Date();
  const store = await getStore();
  const found = await currentSession(request, store, now, config);
  if (!found) {
    securityEvent('access.refused', 'failure', { reason: 'not_signed_in', route: routeOf(request) });
    return jsonError('sign in to see your sessions', 401, PRIVATE);
  }

  const sessions = await store.listSessionsForUser(found.user.id, now);
  return Response.json(
    {
      sessions: sessions.map((session) => ({
        id: publicSessionId(session.tokenHash),
        startedAt: session.createdAt.toISOString(),
        lastActiveAt: lastActiveAt(session, config.session, now).toISOString(),
        current: session.tokenHash === found.session.tokenHash,
      })),
      // Until when this session may end the others without signing in again,
      // so the page can say so before somebody presses a button that refuses.
      endOthersUntil: signedInRecently(found.session, now)
        ? new Date(found.session.createdAt.getTime() + REAUTH_WINDOW_MS).toISOString()
        : null,
    },
    { headers: PRIVATE },
  );
}

async function handleDelete(request: Request): Promise<Response> {
  const config = authConfig();
  if (!config.enabled) return authDisabled(config);
  const route = routeOf(request);

  if (!sameOrigin(request, config)) {
    securityEvent('auth.sign_out', 'failure', { reason: 'cross_origin', route });
    return jsonError('cross-origin request refused', 403);
  }

  // The sign-in bucket, like account deletion: a deliberate, rare auth action.
  if (await authRateLimited(request, Date.now())) {
    securityEvent('auth.sign_out', 'failure', { reason: 'rate_limited', route });
    return jsonError('too many requests, try again in a minute', 429);
  }

  const now = new Date();
  const store = await getStore();
  const found = await currentSession(request, store, now, config);
  if (!found) {
    securityEvent('auth.sign_out', 'failure', { reason: 'not_signed_in', route });
    return jsonError('sign in to end a session', 401);
  }
  const userId = found.user.id;
  attributeRequest(request, userId);

  if (!saysJson(request)) return jsonError('send the body as JSON, with content-type: application/json', 415);

  let id: unknown;
  try {
    id = ((await request.json()) as { id?: unknown })?.id;
  } catch {
    return unreadableBody(jsonError('invalid JSON', 400));
  }
  if (typeof id !== 'string' || !/^[0-9a-f]{32}$/.test(id)) {
    return jsonError('id must be a session id from GET /api/auth/sessions', 400);
  }

  const target = (await store.listSessionsForUser(userId, now)).find(
    (session) => publicSessionId(session.tokenHash) === id,
  );
  if (!target) {
    // Already ended, or never this account's. The same answer for both.
    securityEvent('auth.sign_out', 'failure', { userId, reason: 'not_found', route });
    return jsonError('no such session', 404);
  }

  const isCurrent = target.tokenHash === found.session.tokenHash;
  if (!isCurrent && !signedInRecently(found.session, now)) {
    securityEvent('auth.sign_out', 'failure', { userId, reason: 'reauth_required', route });
    return Response.json(
      { error: 'sign in again to end another session', reauth: true },
      { status: 403, headers: PRIVATE },
    );
  }

  await store.deleteSession(target.tokenHash);
  securityEvent('auth.sign_out', 'success', { userId, route });

  const headers = new Headers(PRIVATE);
  if (isCurrent) for (const cookie of clearSessionCookies(config.secure)) headers.append('set-cookie', cookie);
  return new Response(null, { status: 204, headers });
}

export const GET = logsRefusedInput(handleGet);
export const DELETE = logsRefusedInput(handleDelete);
