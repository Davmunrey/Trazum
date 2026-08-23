import { NextResponse } from 'next/server';

import { SLOTS, SLOT_IDS, assemble, interview, listModels, resolveLocale, slot } from '@trazum/core';
import type { Answers, Locale } from '@trazum/core';

import { getWebMessages } from '../../../lib/i18n';
import { createRateLimiter } from '../../../lib/rate-limit';

export const runtime = 'nodejs';

/**
 * `POST /api/write` — the interview, and the draft it produces.
 *
 * **Stateless on purpose.** The browser holds the answers and sends all of
 * them on every keystroke that matters; this route decides what is worth
 * asking next and assembles what it can. A session would mean this endpoint
 * knowing what somebody is halfway through writing, which is exactly the thing
 * the rest of this product refuses to hold.
 *
 * Nothing here calls a model. The catalogue is fixed and the assembly is
 * deterministic, so the same answers come back as the same bytes — the reason
 * `trazum write` works with the network unplugged, kept true on the surface
 * that has a network by definition.
 */

/** Per answer. An interview is fourteen short fields, not a pasted corpus. */
const MAX_ANSWER_CHARS = 20_000;

const rateLimited = createRateLimiter({ windowMs: 60_000, max: 60 });

interface RequestBody {
  answers?: unknown;
  locale?: unknown;
  callsPerMonth?: unknown;
  avgOutputTokens?: unknown;
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function localeOf(request: Request, body?: RequestBody): Locale {
  const requested = typeof body?.locale === 'string' ? body.locale : null;
  return resolveLocale(requested ?? request.headers.get('accept-language'));
}

const positive = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;

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

  const t = getWebMessages(localeOf(request, body));

  const raw = body.answers;
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return badRequest(t.api.answersNotAnObject);
  }

  /*
    Every key checked against the catalogue, and every value against its type.

    An unknown slot is refused rather than ignored: a browser that misspells one
    would otherwise get a draft assembled without it and no way to tell that
    from an answer the assembly had no use for.
  */
  const answers: Record<string, string | null> = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (slot(id) === undefined) return badRequest(t.api.unknownSlot(id));
    if (value === null) {
      answers[id] = null;
      continue;
    }
    if (typeof value !== 'string') return badRequest(t.api.answerNotText(id));
    if (value.length > MAX_ANSWER_CHARS) {
      return badRequest(t.api.answerTooLong(id, MAX_ANSWER_CHARS.toLocaleString(t.numberLocale)));
    }
    answers[id] = value;
  }

  const model = answers['model'];
  if (typeof model === 'string' && model.trim() && !listModels().some((m) => m.id === model.trim())) {
    // Not an error. An unpriced model is one of the three answers the budget
    // verdict gives, and refusing it here would turn a measurement this format
    // can express into a failure the caller has to handle.
    void 0;
  }

  const draft = assemble(answers as Answers, {
    callsPerMonth: positive(body.callsPerMonth),
    avgOutputTokens: positive(body.avgOutputTokens),
  });

  const state = interview(answers as Answers);

  return NextResponse.json({
    draft,
    /**
     * What to ask next, and the whole catalogue's standing.
     *
     * The browser could derive `next` from `draft.missing`, and it would be
     * wrong: `missing` holds only the **required** slots, and the interview
     * carries on through the optional ones. Two lists that look alike and mean
     * different things is how a form starts skipping questions.
     */
    next: state.next,
    done: state.done,
    open: state.open,
    /** Every slot, so the form can render the ones nobody has reached yet. */
    slots: SLOTS.filter((entry) => SLOT_IDS.includes(entry.id)).map((entry) => ({
      id: entry.id,
      section: entry.section,
      required: entry.required,
      open: state.open.includes(entry.id),
    })),
  });
}
