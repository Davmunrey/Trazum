import {
  parseName,
  parseNote,
  parseText,
  privateJson,
  promptJson,
  requireCaller,
  summaryJson,
} from '../../../lib/prompts/api';
import { MAX_PROMPTS_PER_OWNER } from '../../../lib/store/prompts';

export const runtime = 'nodejs';

/**
 * `GET /api/prompts` — this account's library.
 * `POST /api/prompts` — save a new prompt as version 1.
 *
 * Both begin with `requireCaller`, which returns a `Response` when it cannot
 * identify the caller. There is no path through either handler that reaches the
 * store without a user, because the alternative to a user is a value the
 * compiler will not let you treat as one.
 */

export async function GET(request: Request): Promise<Response> {
  const caller = await requireCaller(request, { write: false });
  if (caller instanceof Response) return caller;

  const prompts = await caller.store.prompts.listPrompts(caller.user.id);
  return privateJson({ prompts: prompts.map(summaryJson) });
}

export async function POST(request: Request): Promise<Response> {
  const caller = await requireCaller(request, { write: true });
  if (caller instanceof Response) return caller;

  let body: { name?: unknown; text?: unknown; note?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return privateJson({ error: 'invalid JSON' }, 400);
  }

  const name = parseName(body.name);
  if ('error' in name) return privateJson({ error: name.error }, 400);

  const text = parseText(body.text);
  if ('error' in text) return privateJson({ error: text.error }, 400);

  const note = parseNote(body.note);
  if ('error' in note) return privateJson({ error: note.error }, 400);

  const created = await caller.store.prompts.createPrompt({
    ownerId: caller.user.id,
    name: name.value,
    text: text.value,
    note: note.value,
    now: new Date(),
  });

  if (!created) {
    /**
     * Two causes, one refusal, and that is a compromise rather than a design.
     *
     * The store answers `null` for "you already have a prompt with that name"
     * and for "you are at the limit", and the caller cannot act on the message
     * without knowing which. So the message names both, rather than the route
     * running a second query to find out — a query whose answer could already
     * be stale by the time it is read.
     */
    return privateJson(
      {
        error: `could not save: either you already have a prompt called “${name.value}”, or you have reached the limit of ${MAX_PROMPTS_PER_OWNER} saved prompts`,
      },
      409,
    );
  }

  const full = await caller.store.prompts.getPrompt(created.id, caller.user.id);
  // Re-read through the owner predicate rather than assembling the response
  // from what was just written. It costs one query and means the shape a client
  // gets on create is the same shape it gets on read, produced by the same code.
  return privateJson({ prompt: full && promptJson(full) }, 201);
}
