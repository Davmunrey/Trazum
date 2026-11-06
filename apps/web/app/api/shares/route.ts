import { authConfig } from '../../../lib/auth/config';
import { privateJson, requireCaller } from '../../../lib/prompts/api';
import { SHARE_CREATE, readBody } from '../../../lib/body-schemas';
import { expiryFor, mintShareToken, settingsFrom, shareUrl } from '../../../lib/shares/api';
import { DEFAULT_SHARE_TTL, MAX_SHARES_PER_OWNER } from '../../../lib/store/shares';
import { logsRefusedInput, routeOf, securityEvent, unreadableBody } from '../../../lib/security-log';
import { saysJson } from '../../../lib/request-body';

export const runtime = 'nodejs';

/**
 * `GET /api/shares` — the links this account has made.
 * `POST /api/shares` — publish a comparison behind an unguessable URL.
 *
 * Creating one is a **publication**, and the API is shaped so nothing does it by
 * accident: it is a `POST`, it requires a signed-in caller, it is same-origin
 * only, and the link it returns carries its own expiry so the caller can see
 * what they just agreed to.
 *
 * The list never carries the prompts. A page that shows every link you have made
 * does not need to re-publish the contents to do it, and a `GET` that returns
 * every shared prompt in one response is a much better thing to steal than a
 * list of tokens.
 */

async function handleGet(request: Request): Promise<Response> {
  const caller = await requireCaller(request, { write: false });
  if (caller instanceof Response) return caller;

  const config = authConfig();
  const publicUrl = config.enabled ? config.publicUrl : '';
  const shares = await caller.store.shares.listShares(caller.user.id, new Date());
  securityEvent('library.read', 'success', { userId: caller.user.id, route: routeOf(request) });

  return privateJson({
    shares: shares.map((share) => ({
      token: share.token,
      url: shareUrl(publicUrl, share.token),
      preview: share.preview,
      createdAt: share.createdAt.toISOString(),
      expiresAt: share.expiresAt?.toISOString() ?? null,
    })),
  });
}

async function handlePost(request: Request): Promise<Response> {
  const caller = await requireCaller(request, { write: true });
  if (caller instanceof Response) return caller;

  const config = authConfig();
  if (!config.enabled) return privateJson({ error: 'sign-in is not configured' }, 503);

  if (!saysJson(request)) return privateJson({ error: 'send the body as JSON, with content-type: application/json' }, 415);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return unreadableBody(privateJson({ error: 'invalid JSON' }, 400));
  }

  const read = readBody(SHARE_CREATE, raw);
  if (!read.ok) return privateJson({ error: read.message }, 400);
  const { before, after } = read.value;
  const ttl = read.value.ttl ?? DEFAULT_SHARE_TTL;
  const settings = settingsFrom(read.value.settings);

  const now = new Date();
  const created = await caller.store.shares.createShare({
    token: mintShareToken(),
    ownerId: caller.user.id,
    ownerLogin: caller.user.login,
    beforeText: before,
    afterText: after,
    settings,
    now,
    expiresAt: expiryFor(ttl, now),
  });

  if (!created) {
    return privateJson(
      { error: `you have reached the limit of ${MAX_SHARES_PER_OWNER} share links; revoke one first` },
      409,
    );
  }
  // A publication: who made it is recorded, the link is not, since the token is the capability.
  securityEvent('share.created', 'success', { userId: caller.user.id, route: routeOf(request) }, now);

  return privateJson(
    {
      token: created.token,
      url: shareUrl(config.publicUrl, created.token),
      expiresAt: created.expiresAt?.toISOString() ?? null,
    },
    201,
  );
}

export const GET = logsRefusedInput(handleGet);
export const POST = logsRefusedInput(handlePost);
