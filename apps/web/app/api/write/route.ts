import { NextResponse } from 'next/server';

import { SLOTS, SLOT_IDS, assemble, interview, resolveLocale } from '@trazum/core';
import type { Answers, Locale } from '@trazum/core';

import { getWebMessages } from '../../../lib/i18n';
import { WRITE, readBody } from '../../../lib/body-schemas';
import { requestedLocale, saysJson } from '../../../lib/request-body';
import { logsRefusedInput, unreadableBody } from '../../../lib/security-log';
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

const rateLimited = createRateLimiter({ windowMs: 60_000, max: 60 });

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function localeOf(request: Request, raw?: unknown): Locale {
  return resolveLocale(requestedLocale(raw) ?? request.headers.get('accept-language'));
}

/** Zero is the field left at its default, as it always was: a budget of nothing is not a budget. */
const positive = (value: number | undefined): number | undefined => (value !== undefined && value > 0 ? value : undefined);

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

  const t = getWebMessages(localeOf(request, raw));

  const read = readBody(WRITE, raw, t);
  if (!read.ok) return badRequest(read.message);
  const body = read.value;
  const sent = body.answers;

  /*
    **The keys written here come from `SLOTS`, never from the request.** The
    first version iterated the request's own entries, so the property being
    assigned was a string the caller chose — `__proto__` among them. The
    schema now refuses any key that is not a question, but a write whose
    *target* is caller-controlled is only ever as safe as the guard in front of
    it, and CodeQL was right to call it what it is. Iterating the catalogue
    makes the set of writable keys a fixed literal, and the map has no
    prototype to reach in the first place.
  */
  const answers: Record<string, string | null> = Object.create(null) as Record<string, string | null>;
  for (const entry of SLOTS) {
    const value = sent[entry.id];
    if (value !== undefined) answers[entry.id] = value;
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

export const POST = logsRefusedInput(handlePost);
