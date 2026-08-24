import { NextResponse } from 'next/server';

import { MAX_INPUT_CHARS, RULES, comparePrompts, getMessages, listModels, resolveLocale } from '@trazum/core';
import type { AdvisoryId, Locale, PromptComparison, RuleId, RuleLevel, UsageProfile } from '@trazum/core';

import { getWebMessages } from '../../../lib/i18n';
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

/** Per prompt, so a comparison can carry twice the optimise route's cap. */
const MAX_PROMPT_CHARS = MAX_INPUT_CHARS;

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

interface RequestBody {
  before?: unknown;
  after?: unknown;
  level?: unknown;
  locale?: unknown;
  usage?: Partial<UsageProfile>;
  disableRules?: unknown;
  /**
   * Compare what the rules would leave rather than what was written.
   *
   * Honoured only on a literal `true`, like every other boolean this API takes.
   * Off by default, and the default is the interesting half: a pull request
   * changed the file on disk, so the file on disk is what the reader is being
   * asked about. Optimising both sides first would hide a prompt that doubled in
   * length and happened to double in courtesy — which is exactly the change worth
   * seeing.
   */
  optimizeBoth?: unknown;
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function localeOf(request: Request, body?: RequestBody): Locale {
  const requested = typeof body?.locale === 'string' ? body.locale : null;
  return resolveLocale(requested ?? request.headers.get('accept-language'));
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

export async function POST(request: Request) {
  if (rateLimited(request, Date.now())) {
    const t = getWebMessages(localeOf(request));
    return NextResponse.json({ error: t.api.rateLimited }, { status: 429 });
  }

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return badRequest(getWebMessages(localeOf(request)).api.invalidJson);
  }

  const locale = localeOf(request, body);
  const t = getWebMessages(locale);

  const { before, after } = body;
  // Named separately rather than "the prompt is missing": with two fields, a
  // message that does not say which one leaves the caller guessing.
  if (typeof before !== 'string' || !before.trim()) return badRequest(t.api.missingBefore);
  if (typeof after !== 'string' || !after.trim()) return badRequest(t.api.missingAfter);

  const limit = MAX_PROMPT_CHARS.toLocaleString(t.numberLocale);
  if (before.length > MAX_PROMPT_CHARS) return badRequest(t.api.promptTooLong(limit));
  if (after.length > MAX_PROMPT_CHARS) return badRequest(t.api.promptTooLong(limit));

  const level: RuleLevel = body.level === 'aggressive' ? 'aggressive' : 'safe';

  const disableRules = Array.isArray(body.disableRules)
    ? body.disableRules.filter((id): id is string => typeof id === 'string')
    : [];
  const unknownRule = disableRules.find((id) => !RULES.some((r) => r.id === id));
  if (unknownRule) return badRequest(t.api.unknownRule(unknownRule));

  const usage = body.usage ?? {};
  if (usage.model && !listModels().some((m) => m.id === usage.model)) {
    return badRequest(t.api.unknownModel(usage.model));
  }

  try {
    const comparison: PromptComparison = comparePrompts(before, after, {
      level,
      locale,
      usage,
      disableRules: disableRules as RuleId[],
      optimizeBoth: body.optimizeBoth === true,
    });

    return NextResponse.json({
      ...comparison,
      // Carried in the response rather than left for the client to infer from
      // its own request. A reader who bookmarks a result should be able to tell
      // which question it answered.
      optimizeBoth: body.optimizeBoth === true,
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
