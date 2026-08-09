import { authConfig } from '../../../lib/auth/config';
import { privateJson, requireCaller } from '../../../lib/prompts/api';
import {
  MAX_SHARE_PROMPT_CHARS,
  expiryFor,
  mintShareToken,
  parseSettings,
  parseTtl,
  shareUrl,
} from '../../../lib/shares/api';
import { MAX_SHARES_PER_OWNER } from '../../../lib/store/shares';

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

export async function GET(request: Request): Promise<Response> {
  const caller = await requireCaller(request, { write: false });
  if (caller instanceof Response) return caller;

  const config = authConfig();
  const publicUrl = config.enabled ? config.publicUrl : '';
  const shares = await caller.store.shares.listShares(caller.user.id, new Date());

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

export async function POST(request: Request): Promise<Response> {
  const caller = await requireCaller(request, { write: true });
  if (caller instanceof Response) return caller;

  const config = authConfig();
  if (!config.enabled) return privateJson({ error: 'sign-in is not configured' }, 503);

  let body: { before?: unknown; after?: unknown; settings?: unknown; ttl?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return privateJson({ error: 'invalid JSON' }, 400);
  }

  const { before, after } = body;
  if (typeof before !== 'string' || !before.trim()) return privateJson({ error: 'before is required' }, 400);
  if (typeof after !== 'string' || !after.trim()) return privateJson({ error: 'after is required' }, 400);
  if (before.length > MAX_SHARE_PROMPT_CHARS || after.length > MAX_SHARE_PROMPT_CHARS) {
    return privateJson({ error: `prompts are limited to ${MAX_SHARE_PROMPT_CHARS} characters` }, 400);
  }

  const ttl = parseTtl(body.ttl);
  if (!ttl) return privateJson({ error: 'ttl must be 7, 30, 90 or never' }, 400);

  const settings = parseSettings(body.settings);
  if ('error' in settings) return privateJson({ error: settings.error }, 400);

  const now = new Date();
  const created = await caller.store.shares.createShare({
    token: mintShareToken(),
    ownerId: caller.user.id,
    ownerLogin: caller.user.login,
    beforeText: before,
    afterText: after,
    settings: settings.value,
    now,
    expiresAt: expiryFor(ttl, now),
  });

  if (!created) {
    return privateJson(
      { error: `you have reached the limit of ${MAX_SHARES_PER_OWNER} share links — revoke one first` },
      409,
    );
  }

  return privateJson(
    {
      token: created.token,
      url: shareUrl(config.publicUrl, created.token),
      expiresAt: created.expiresAt?.toISOString() ?? null,
    },
    201,
  );
}
