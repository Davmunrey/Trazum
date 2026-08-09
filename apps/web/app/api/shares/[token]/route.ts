import { privateJson, requireCaller } from '../../../../lib/prompts/api';
import { isShareToken } from '../../../../lib/shares/api';

export const runtime = 'nodejs';

/**
 * `DELETE /api/shares/:token` — revoke a link.
 *
 * There is no `GET` here. Reading a share happens at `/c/:token`, which is a
 * page and not an API, and keeping the two apart is deliberate: an anonymous
 * JSON endpoint returning prompt text is the shape that gets scraped, and every
 * legitimate reader of a share link is a person with a browser.
 *
 * Revoking is owner-scoped and answers 404 for anyone else's link, for the same
 * reason the prompt routes do: a 403 confirms the token is real, and a real
 * token is the whole secret.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  const caller = await requireCaller(request, { write: true });
  if (caller instanceof Response) return caller;

  const { token } = await params;
  if (!isShareToken(token)) return privateJson({ error: 'no such link' }, 404);

  const revoked = await caller.store.shares.revokeShare(token, caller.user.id);
  if (!revoked) return privateJson({ error: 'no such link' }, 404);

  return new Response(null, { status: 204, headers: { 'cache-control': 'private, no-store' } });
}
