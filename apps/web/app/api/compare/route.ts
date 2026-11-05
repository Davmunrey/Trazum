import { NextResponse } from 'next/server';

import { comparePrompts, getMessages, resolveLocale } from '@trazum/core';
import type { AdvisoryId, Locale, PromptComparison, RuleId, RuleLevel, UsageProfile } from '@trazum/core';

import { getWebMessages } from '../../../lib/i18n';
import { COMPARE, readBody } from '../../../lib/body-schemas';
import { requestedLocale, saysJson } from '../../../lib/request-body';
import { logsRefusedInput, unreadableBody } from '../../../lib/security-log';
import { createRateLimiter } from '../../../lib/rate-limit';

export const runtime = 'nodejs';

/**
 * `POST /api/compare` — did this edit make the prompt more expensive?
 *
 * A different question from `/api/optimize`, which is why it is a different
 * route rather than a mode of that one. Optimise asks *what could come out of
 * this prompt*; compare asks *what did the last commit do to it*, and every
 * figure it returns is **`after - before`, so positive means worse** — the
 * opposite of the sign convention everywhere else in Trazum.
 *
 * That inversion is the whole hazard of this endpoint. `computeSavings` is
 * before-minus-after and `comparePrompts` negates it once, in the core, so the
 * convention holds for every consumer. Nothing here negates anything again.
 */

/**
 * In-memory sliding window per IP, in a bucket of its own.
 *
 * This used to be a copy of the optimise route's limiter, with a comment saying
 * the duplication was deliberate because sharing the `Map` would let a burst of
 * comparisons spend somebody else's optimise budget. The state does have to be
 * private; the algorithm never did. `createRateLimiter` hands out a fresh `Map`
 * per call, so both properties hold at once.
 */
const rateLimited = createRateLimiter({ windowMs: 60_000, max: 30 });


function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function localeOf(request: Request, raw?: unknown): Locale {
  return resolveLocale(requestedLocale(raw) ?? request.headers.get('accept-language'));
}

/**
 * The rule ids in a delta, with the titles a reader can act on.
 *
 * Resolved from the core's own catalogue, server-side, so the browser never holds
 * a second copy of rule copy that could drift from it. The ids come from
 * `comparePrompts` and nothing here recomputes them — a title is decoration, and
 * decoration must not be able to disagree with the measurement it labels.
 */
function withTitles(ids: readonly RuleId[], locale: Locale): { id: RuleId; title: string }[] {
  const copy = getMessages(locale).rules;
  return ids.map((id) => ({ id, title: copy[id].title }));
}

async function handlePost(request: Request) {
  if (rateLimited(request, Date.now())) {
    const t = getWebMessages(localeOf(request));
    return NextResponse.json({ error: t.api.rateLimited }, { status: 429 });
  }

  // JSON or nothing, before a byte is read: see `lib/request-body.ts`.
  if (!saysJson(request)) {
    return NextResponse.json({ error: getWebMessages(localeOf(request)).api.notJson }, { status: 415 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return unreadableBody(badRequest(getWebMessages(localeOf(request)).api.invalidJson));
  }

  const locale = localeOf(request, raw);
  const t = getWebMessages(locale);

  const read = readBody(COMPARE, raw, t);
  if (!read.ok) return badRequest(read.message);
  const body = read.value;

  const { before, after } = body;
  const level: RuleLevel = body.level ?? 'safe';
  const disableRules = body.disableRules ?? [];
  const usage: Partial<UsageProfile> = body.usage ?? {};
  const optimizeBoth = body.optimizeBoth === true;

  try {
    const comparison: PromptComparison = comparePrompts(before, after, {
      level,
      locale,
      usage,
      disableRules: disableRules as RuleId[],
      optimizeBoth,
    });

    return NextResponse.json({
      ...comparison,
      // Carried in the response rather than left for the client to infer from
      // its own request. A reader who bookmarks a result should be able to tell
      // which question it answered.
      optimizeBoth,
      level,
      rules: {
        newlyFiring: withTitles(comparison.rules.newlyFiring, locale),
        noLongerFiring: withTitles(comparison.rules.noLongerFiring, locale),
      },
      advisories: comparison.advisories satisfies {
        appeared: AdvisoryId[];
        resolved: AdvisoryId[];
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : t.api.unexpected;
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const POST = logsRefusedInput(handlePost);
