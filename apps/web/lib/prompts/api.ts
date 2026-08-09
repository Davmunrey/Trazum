import { estimateTokens } from '@trazum/core';

import { authConfig } from '../auth/config';
import { authDisabled, jsonError, sameOrigin } from '../auth/routes';
import { currentUser } from '../auth/session';
import { createRateLimiter } from '../rate-limit';
import { getStore } from '../store';
import {
  MAX_NOTE_CHARS,
  MAX_PROMPT_NAME_CHARS,
  MAX_PROMPT_TEXT_CHARS,
} from '../store/prompts';
import type { PromptSummary, PromptVersionRecord, PromptWithHistory } from '../store/prompts';
import type { Store, UserRecord } from '../store/types';

/**
 * Everything the two library routes share: who is asking, what they sent, and
 * the shape of what goes back.
 *
 * Kept out of the handlers because the answer to "who is asking" is the entire
 * security of this feature. There is one function that answers it, every route
 * begins with it, and it returns a `Response` on failure so a handler cannot
 * continue past a caller it failed to identify.
 */

/** Writes cost a database round trip; reads are cheap but not free. */
export const libraryRateLimited = createRateLimiter({ windowMs: 60_000, max: 60 });

export interface Caller {
  user: UserRecord;
  store: Store;
}

/**
 * The signed-in caller, or the response to send instead.
 *
 * Returning the refusal rather than `null` is deliberate: a handler that gets
 * `null` has to remember to build a 401, and a handler that gets a `Response`
 * has nothing to remember. The union makes forgetting a type error.
 */
export async function requireCaller(
  request: Request,
  { write }: { write: boolean },
): Promise<Caller | Response> {
  const config = authConfig();
  if (!config.enabled) return authDisabled(config);

  if (libraryRateLimited(request, Date.now())) {
    return jsonError('too many requests, try again in a minute', 429);
  }

  // Only on writes. A cross-origin `GET` cannot read the response without CORS,
  // which this app never sends, and refusing it would break nothing an attacker
  // does while breaking every legitimate script that lists a library.
  if (write && !sameOrigin(request, config)) {
    return jsonError('cross-origin write refused', 403);
  }

  const store = await getStore();
  const user = await currentUser(request, store, new Date(), config.secure);
  if (!user) return jsonError('sign in to use the prompt library', 401);

  return { user, store };
}

// ---------------------------------------------------------------------------
// What the browser is allowed to send
// ---------------------------------------------------------------------------

export type Parsed<T> = { value: T } | { error: string };

export function parseName(raw: unknown): Parsed<string> {
  if (typeof raw !== 'string') return { error: 'name is required' };
  const name = raw.trim();
  if (!name) return { error: 'name is required' };
  if (name.length > MAX_PROMPT_NAME_CHARS) {
    return { error: `name must be ${MAX_PROMPT_NAME_CHARS} characters or fewer` };
  }
  return { value: name };
}

export function parseText(raw: unknown): Parsed<string> {
  if (typeof raw !== 'string') return { error: 'text is required' };
  // Not trimmed. Trailing whitespace is part of a prompt and changing it changes
  // the bytes a cache matches on, which is the one thing this tool is about.
  if (!raw.trim()) return { error: 'text is required' };
  if (raw.length > MAX_PROMPT_TEXT_CHARS) {
    return { error: `prompts in the library are limited to ${MAX_PROMPT_TEXT_CHARS} characters` };
  }
  return { value: raw };
}

export function parseNote(raw: unknown): Parsed<string | null> {
  if (raw === undefined || raw === null) return { value: null };
  if (typeof raw !== 'string') return { error: 'note must be text' };
  const note = raw.trim();
  if (!note) return { value: null };
  if (note.length > MAX_NOTE_CHARS) {
    return { error: `note must be ${MAX_NOTE_CHARS} characters or fewer` };
  }
  return { value: note };
}

/**
 * A UUID, checked before it reaches the store.
 *
 * Not a security control — the owner predicate in the query is that — but it
 * keeps a path segment of arbitrary text from becoming a bound parameter, and
 * it turns a malformed id into a 400 instead of a driver-shaped 500.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID.test(value);
}

// ---------------------------------------------------------------------------
// What goes back
// ---------------------------------------------------------------------------

/**
 * Token counts are computed here, on the way out, never stored.
 *
 * The history view is a chart of how a prompt's cost moved. Priced with the
 * estimator of the day each version was saved, that line moves when the
 * estimator changes and nothing about the prompts did. Recomputing every
 * version with today's is the only way two versions are comparable.
 */
export function versionJson(version: PromptVersionRecord) {
  return {
    id: version.id,
    version: version.version,
    text: version.text,
    note: version.note,
    tokens: estimateTokens(version.text),
    createdAt: version.createdAt.toISOString(),
  };
}

export function summaryJson(prompt: PromptSummary) {
  return {
    id: prompt.id,
    name: prompt.name,
    versionCount: prompt.versionCount,
    tokens: estimateTokens(prompt.latestText),
    // A preview, not the prompt. A list of two hundred entries should not ship
    // two hundred full prompts to render five lines each.
    preview: prompt.latestText.slice(0, 240),
    createdAt: prompt.createdAt.toISOString(),
    updatedAt: prompt.updatedAt.toISOString(),
  };
}

export function promptJson(prompt: PromptWithHistory) {
  return {
    id: prompt.id,
    name: prompt.name,
    createdAt: prompt.createdAt.toISOString(),
    updatedAt: prompt.updatedAt.toISOString(),
    versions: prompt.versions.map(versionJson),
  };
}

/** Never cacheable: every one of these responses is one person's private data. */
export function privateJson(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { 'cache-control': 'private, no-store' },
  });
}
