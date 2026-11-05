import { estimateTokens } from '@trazum/core';

import { authConfig } from '../auth/config';
import { authDisabled, jsonError, sameOrigin } from '../auth/routes';
import { currentUser } from '../auth/session';
import { createSharedRateLimiter } from '../shared-limit';
import { getStore } from '../store';
import type { PromptSummary, PromptVersionRecord, PromptWithHistory } from '../store/prompts';
import type { Store, UserRecord } from '../store/types';
import { attributeRequest, routeOf, securityEvent } from '../security-log';

/**
 * Everything the two library routes share: who is asking, what they sent, and
 * the shape of what goes back.
 *
 * Kept out of the handlers because the answer to "who is asking" is the entire
 * security of this feature. There is one function that answers it, every route
 * begins with it, and it returns a `Response` on failure so a handler cannot
 * continue past a caller it failed to identify.
 */

/**
 * Writes cost a database round trip; reads are cheap but not free. Counted
 * across instances where the deployment can (`lib/shared-limit.ts`), because
 * the database it protects is the one thing every instance shares.
 */
export const libraryRateLimited = createSharedRateLimiter('library', { windowMs: 60_000, max: 60 });

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

  if (await libraryRateLimited(request, Date.now())) {
    securityEvent('access.refused', 'failure', { reason: 'rate_limited', route: routeOf(request) });
    return jsonError('too many requests, try again in a minute', 429);
  }

  // Only on writes. A cross-origin `GET` cannot read the response without CORS,
  // which this app never sends, and refusing it would break nothing an attacker
  // does while breaking every legitimate script that lists a library.
  if (write && !sameOrigin(request, config)) {
    securityEvent('access.refused', 'failure', { reason: 'cross_origin', route: routeOf(request) });
    return jsonError('cross-origin write refused', 403);
  }

  const store = await getStore();
  const user = await currentUser(request, store, new Date(), config);
  if (!user) {
    securityEvent('access.refused', 'failure', { reason: 'not_signed_in', route: routeOf(request) });
    return jsonError('sign in to use the prompt library', 401);
  }

  attributeRequest(request, user.id);
  return { user, store };
}

// ---------------------------------------------------------------------------
// What the browser is allowed to send: the bodies are in `lib/body-schemas.ts`
// ---------------------------------------------------------------------------

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
