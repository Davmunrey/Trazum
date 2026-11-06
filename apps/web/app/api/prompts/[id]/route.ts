import { PROMPT_RENAME, PROMPT_VERSION, readBody } from '../../../../lib/body-schemas';
import { isUuid, privateJson, promptJson, requireCaller, versionJson } from '../../../../lib/prompts/api';
import { MAX_VERSIONS_PER_PROMPT } from '../../../../lib/store/prompts';
import { saysJson } from '../../../../lib/request-body';
import { logsRefusedInput, routeOf, securityEvent, unreadableBody } from '../../../../lib/security-log';

export const runtime = 'nodejs';

/**
 * `GET /api/prompts/:id` — one prompt and its whole history.
 * `POST /api/prompts/:id` — save the current text as the next version.
 * `PATCH /api/prompts/:id` — rename.
 * `DELETE /api/prompts/:id` — remove it and every version.
 *
 * **404 is the answer for somebody else's prompt.** Not 403. A 403 confirms the
 * id exists, which turns this route into an oracle for enumerating other
 * people's libraries — and there is nothing a legitimate caller can do with the
 * distinction, because they were never going to be allowed in either way.
 *
 * The store enforces that in the query rather than here. Every method takes the
 * owner id and puts it in the `where` clause, so "not yours" and "not there"
 * are the same empty result set and no branch in this file can get it wrong.
 */

const NOT_FOUND = { error: 'no such prompt' };

type Params = { params: Promise<{ id: string }> };

async function handleGet(request: Request, { params }: Params): Promise<Response> {
  const caller = await requireCaller(request, { write: false });
  if (caller instanceof Response) return caller;

  const { id } = await params;
  if (!isUuid(id)) return privateJson(NOT_FOUND, 404);

  const prompt = await caller.store.prompts.getPrompt(id, caller.user.id);
  if (!prompt) {
    // Somebody else's prompt and no prompt at all are the same answer and the
    // same line; a run of them from one account is somebody guessing ids.
    securityEvent('library.read', 'failure', { userId: caller.user.id, reason: 'not_found', route: routeOf(request) });
    return privateJson(NOT_FOUND, 404);
  }

  securityEvent('library.read', 'success', { userId: caller.user.id, route: routeOf(request) });
  return privateJson({ prompt: promptJson(prompt) });
}

async function handlePost(request: Request, { params }: Params): Promise<Response> {
  const caller = await requireCaller(request, { write: true });
  if (caller instanceof Response) return caller;

  const { id } = await params;
  if (!isUuid(id)) return privateJson(NOT_FOUND, 404);

  if (!saysJson(request)) return privateJson({ error: 'send the body as JSON, with content-type: application/json' }, 415);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return unreadableBody(privateJson({ error: 'invalid JSON' }, 400));
  }

  const read = readBody(PROMPT_VERSION, raw);
  if (!read.ok) return privateJson({ error: read.message }, 400);

  const result = await caller.store.prompts.addVersion({
    promptId: id,
    ownerId: caller.user.id,
    authorId: caller.user.id,
    text: read.value.text,
    note: read.value.note || null,
    now: new Date(),
  });

  switch (result.status) {
    case 'not-found':
      return privateJson(NOT_FOUND, 404);

    case 'too-many-versions':
      // Refused, not pruned. Deleting the oldest version to make room would
      // quietly destroy the record somebody kept the prompt for.
      return privateJson(
        { error: `this prompt already has ${MAX_VERSIONS_PER_PROMPT} versions, which is the limit` },
        409,
      );

    case 'unchanged':
      /**
       * 200 and `saved: false`, not 204 and not an error.
       *
       * Pressing Save on text nobody edited is a reasonable thing to do and
       * must not write an identical row into a history whose only job is
       * showing what moved. But it is also not a failure, and returning one
       * would make the UI apologise for something that went fine. The flag is
       * what lets it say "no changes to save" instead.
       */
      return privateJson({ saved: false, version: versionJson(result.version) });

    case 'saved':
      return privateJson({ saved: true, version: versionJson(result.version) }, 201);
  }
}

async function handlePatch(request: Request, { params }: Params): Promise<Response> {
  const caller = await requireCaller(request, { write: true });
  if (caller instanceof Response) return caller;

  const { id } = await params;
  if (!isUuid(id)) return privateJson(NOT_FOUND, 404);

  if (!saysJson(request)) return privateJson({ error: 'send the body as JSON, with content-type: application/json' }, 415);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return unreadableBody(privateJson({ error: 'invalid JSON' }, 400));
  }

  const read = readBody(PROMPT_RENAME, raw);
  if (!read.ok) return privateJson({ error: read.message }, 400);
  const { name } = read.value;

  const renamed = await caller.store.prompts.renamePrompt(
    id,
    caller.user.id,
    name,
    new Date(),
  );

  if (!renamed) {
    // The store answers `false` for "not yours or not there" and for "you
    // already have one called that". Distinguishing them means a second query
    // whose answer is stale on arrival — and one of the two answers is the one
    // this route refuses to confirm on principle.
    const still = await caller.store.prompts.getPrompt(id, caller.user.id);
    if (!still) return privateJson(NOT_FOUND, 404);
    return privateJson({ error: `you already have a prompt called “${name}”` }, 409);
  }

  const prompt = await caller.store.prompts.getPrompt(id, caller.user.id);
  // A rename answers with the prompt's whole history, so it is a read of it.
  securityEvent('library.read', 'success', { userId: caller.user.id, route: routeOf(request) });
  return privateJson({ prompt: prompt && promptJson(prompt) });
}

async function handleDelete(request: Request, { params }: Params): Promise<Response> {
  const caller = await requireCaller(request, { write: true });
  if (caller instanceof Response) return caller;

  const { id } = await params;
  if (!isUuid(id)) return privateJson(NOT_FOUND, 404);

  const deleted = await caller.store.prompts.deletePrompt(id, caller.user.id);
  if (!deleted) return privateJson(NOT_FOUND, 404);

  return new Response(null, { status: 204, headers: { 'cache-control': 'private, no-store' } });
}

export const GET = logsRefusedInput(handleGet);
export const POST = logsRefusedInput(handlePost);
export const PATCH = logsRefusedInput(handlePatch);
export const DELETE = logsRefusedInput(handleDelete);
