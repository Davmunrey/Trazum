import { MAX_INPUT_CHARS, RULES, SLOTS } from '@trazum/core';

import { getWebMessages } from './i18n';
import type { WebMessages } from './i18n';
import { check, flag, list, number, object, oneOf, optional, text } from './schema';
import type { Infer, Issue, Schema } from './schema';
import { MAX_NOTE_CHARS, MAX_PROMPT_NAME_CHARS, MAX_PROMPT_TEXT_CHARS } from './store/prompts';
import { SHARE_TTL_DAYS } from './store/shares';
import type { ShareTtl } from './store/shares';
import { MODEL_IDS, USAGE, USAGE_EXPECTED, USAGE_FIELDS, USAGE_LIMITS } from './usage-input';
import type { UsageField } from './usage-input';

/**
 * Every body the API accepts, in one place (OWASP ASVS 4.0.3 5.1.4, 13.2.2).
 *
 * One schema per body, written with `lib/schema.ts`, and beside each one the
 * words its refusals use. A route reads its body as `unknown`, hands it to
 * `readBody` with the schema here, and touches nothing the schema did not
 * pass: `test/body-schemas.test.mjs` holds every route that reads a body to
 * exactly that.
 *
 * The schemas say what a body *is*: its fields, their types, their lengths and
 * ranges, the words a field may hold. What a body *means* stays in the route,
 * where it needs the rest of the request: `applySuggestions` without
 * `suggest`, an endpoint the operator has not listed, a login typed wrong.
 */

const ENGLISH = getWebMessages('en');

export interface Body<T> {
  readonly schema: Schema<T>;
  /** Words of the body's own for an issue; `undefined` uses the general sentence for it. */
  readonly say?: (issue: Issue, t: WebMessages) => string | undefined;
}

export type Read<T> = { ok: true; value: T } | { ok: false; message: string };

/**
 * A body checked against its schema, or the sentence that refuses it.
 *
 * `t` is the caller's language on the routes that have one; the others answer
 * in English, as they always have.
 */
export function readBody<T>(body: Body<T>, raw: unknown, t: WebMessages = ENGLISH): Read<T> {
  const checked = check(body.schema, raw);
  if (checked.ok) return checked;
  return { ok: false, message: body.say?.(checked.issue, t) ?? t.api.badInput(checked.issue) };
}

// ---------------------------------------------------------------------------
// Pieces two bodies share
// ---------------------------------------------------------------------------

export const LEVELS = ['safe', 'aggressive'] as const;
export const RULE_IDS: readonly string[] = RULES.map((rule) => rule.id);

/** A locale tag as a browser writes one; which of them this app speaks is `resolveLocale`'s question. */
const LOCALE = optional(text({ max: 35 }));

/** No more entries than there are rules to switch off. */
const DISABLE_RULES = optional(list(oneOf(RULE_IDS), { max: RULE_IDS.length }));

/** `usage.*` and `disableRules.*`, in the same words on both pricing routes. */
function sayPricing(issue: Issue, t: WebMessages): string | undefined {
  const [head, field] = issue.path;
  if (head === 'usage') {
    if (field === undefined) return t.api.usageNotAnObject;
    if (issue.problem === 'unknown') return t.api.usageUnknownField(field, USAGE_FIELDS.join(', '));
    if (issue.problem === 'choice') return t.api.unknownModel(issue.got ?? '');
    return t.api.usageBadField(field as UsageField, USAGE_EXPECTED[field as UsageField]);
  }
  if (head === 'disableRules' && issue.problem === 'choice') return t.api.unknownRule(issue.got ?? '');
  return undefined;
}

/** A prompt the deterministic core reads: required, not blank, under the core's cap. */
const PROMPT_TEXT = text({ max: MAX_INPUT_CHARS, nonBlank: true });

function sayPrompt(issue: Issue, t: WebMessages, missing: string): string {
  return issue.problem === 'long'
    ? t.api.promptTooLong(MAX_INPUT_CHARS.toLocaleString(t.numberLocale))
    : missing;
}

// ---------------------------------------------------------------------------
// POST /api/optimize
// ---------------------------------------------------------------------------

const OPTIMIZE_SCHEMA = object({
  prompt: PROMPT_TEXT,
  level: optional(oneOf(LEVELS)),
  locale: LOCALE,
  disableRules: DISABLE_RULES,
  usage: optional(USAGE),
  /**
   * Rearrange the prompt so its stable instructions reach the cacheable
   * prefix. Opt-in, as on the command line: every other transformation here
   * deletes text whose absence is local, and this one *moves* text, where
   * order carries meaning.
   *
   * This and the next two are `true` or `false` and nothing that looks like
   * either: a truthy check would let `"false"` move or rewrite a prompt.
   */
  reorder: optional(flag()),
  /**
   * Ask the caller's model for phrase-level rewrites, returned and not
   * applied. Separate from `llm.enabled`, which rewrites the whole prompt.
   */
  suggest: optional(flag()),
  /** Apply the suggestions. Means nothing without `suggest`, which the route refuses. */
  applySuggestions: optional(flag()),
  /**
   * The caller's own model, for the two passes that need one. The key is used
   * for this request and dropped. Its length is generous for every provider's
   * format and still keeps a pasted file from becoming a header.
   */
  llm: optional(
    object({
      enabled: optional(flag()),
      provider: optional(oneOf(['openai', 'anthropic'])),
      baseUrl: optional(text({ max: 2_048 })),
      model: optional(text({ max: 200 })),
      apiKey: optional(text({ max: 1_024 })),
    }),
  ),
});

export const OPTIMIZE: Body<Infer<typeof OPTIMIZE_SCHEMA>> = {
  schema: OPTIMIZE_SCHEMA,
  say(issue, t) {
    const [head] = issue.path;
    if (head === 'prompt' && issue.problem !== 'unknown') return sayPrompt(issue, t, t.api.missingPrompt);
    return sayPricing(issue, t);
  },
};

// ---------------------------------------------------------------------------
// POST /api/compare
// ---------------------------------------------------------------------------

const COMPARE_SCHEMA = object({
  before: PROMPT_TEXT,
  after: PROMPT_TEXT,
  level: optional(oneOf(LEVELS)),
  locale: LOCALE,
  disableRules: DISABLE_RULES,
  usage: optional(USAGE),
  /**
   * Compare what the rules would leave rather than what was written. Off by
   * default, and the default is the interesting half: a pull request changed
   * the file on disk, so the file on disk is what the reader is asked about.
   */
  optimizeBoth: optional(flag()),
});

export const COMPARE: Body<Infer<typeof COMPARE_SCHEMA>> = {
  schema: COMPARE_SCHEMA,
  say(issue, t) {
    const [head] = issue.path;
    // Named separately rather than "the prompt is missing": with two fields, a
    // message that does not say which one leaves the caller guessing.
    if (head === 'before' && issue.problem !== 'unknown') return sayPrompt(issue, t, t.api.missingBefore);
    if (head === 'after' && issue.problem !== 'unknown') return sayPrompt(issue, t, t.api.missingAfter);
    return sayPricing(issue, t);
  },
};

// ---------------------------------------------------------------------------
// POST /api/write
// ---------------------------------------------------------------------------

/** An interview is short fields, not a pasted corpus. */
export const MAX_ANSWER_CHARS = 20_000;

/**
 * One field per question the interview asks, and no other. `null` is an
 * answer of its own, *declined*, and is kept apart from a question nobody has
 * reached.
 */
const ANSWERS = object(
  Object.fromEntries(SLOTS.map((entry) => [entry.id, optional(text({ max: MAX_ANSWER_CHARS }), { null: 'kept' })])),
);

const WRITE_SCHEMA = object({
  answers: ANSWERS,
  locale: LOCALE,
  callsPerMonth: optional(number({ min: 0, max: USAGE_LIMITS.callsPerMonth })),
  avgOutputTokens: optional(number({ min: 0, max: USAGE_LIMITS.avgOutputTokens })),
});

export const WRITE: Body<Infer<typeof WRITE_SCHEMA>> = {
  schema: WRITE_SCHEMA,
  say(issue, t) {
    const [head, id] = issue.path;
    if (head !== 'answers') return undefined;
    if (id === undefined) return t.api.answersNotAnObject;
    if (issue.problem === 'unknown') return t.api.unknownSlot(id);
    if (issue.problem === 'long') return t.api.answerTooLong(id, MAX_ANSWER_CHARS.toLocaleString(t.numberLocale));
    return t.api.answerNotText(id);
  },
};

// ---------------------------------------------------------------------------
// The prompt library: POST /api/prompts, POST and PATCH /api/prompts/[id]
// ---------------------------------------------------------------------------

/** Trimmed: a name is a label, and two that differ by a trailing space are one name. */
const NAME = text({ max: MAX_PROMPT_NAME_CHARS, trim: true, nonBlank: true });
/**
 * Not trimmed. Trailing whitespace is part of a prompt and changing it changes
 * the bytes a cache matches on, which is the one thing this tool is about.
 */
const LIBRARY_TEXT = text({ max: MAX_PROMPT_TEXT_CHARS, nonBlank: true });
/** Trimmed, and an empty note is no note: the route stores it as `null`. */
const NOTE = optional(text({ max: MAX_NOTE_CHARS, trim: true }));

function sayLibrary(issue: Issue): string | undefined {
  if (issue.path.length !== 1 || issue.problem === 'unknown') return undefined;
  const long = issue.problem === 'long';
  switch (issue.path[0]) {
    case 'name':
      return long ? `name must be ${MAX_PROMPT_NAME_CHARS} characters or fewer` : 'name is required';
    case 'text':
      return long ? `prompts in the library are limited to ${MAX_PROMPT_TEXT_CHARS} characters` : 'text is required';
    case 'note':
      return long ? `note must be ${MAX_NOTE_CHARS} characters or fewer` : 'note must be text';
    default:
      return undefined;
  }
}

export const PROMPT_CREATE = { schema: object({ name: NAME, text: LIBRARY_TEXT, note: NOTE }), say: sayLibrary };
export const PROMPT_VERSION = { schema: object({ text: LIBRARY_TEXT, note: NOTE }), say: sayLibrary };
export const PROMPT_RENAME = { schema: object({ name: NAME }), say: sayLibrary };

// ---------------------------------------------------------------------------
// POST /api/shares
// ---------------------------------------------------------------------------

export const SHARE_TTLS = Object.keys(SHARE_TTL_DAYS) as ShareTtl[];

/**
 * What the Compare tab held when it was shared.
 *
 * The three numbers are **clamped**, not refused, and it is the one place in
 * these schemas that does so: they come from whatever the tab happened to hold,
 * and refusing a whole publication over a call volume of -1 helps nobody. A
 * value that is not a number at all is still refused.
 */
export const SHARE_SETTINGS = object({
  level: optional(oneOf(LEVELS)),
  optimizeBoth: optional(flag()),
  disableRules: DISABLE_RULES,
  model: optional(oneOf(MODEL_IDS)),
  callsPerMonth: optional(number({ min: 0, max: 1_000_000_000, clamp: true })),
  avgOutputTokens: optional(number({ min: 0, max: 1_000_000, clamp: true })),
  cacheHitRate: optional(number({ min: 0, max: 1, clamp: true })),
  batchEligible: optional(flag()),
});

/** For `settings.*`, wherever the settings object sits in the issue's path. */
export function saySettings(issue: Issue, at: number): string | undefined {
  if (issue.problem !== 'choice') return undefined;
  if (issue.path[at] === 'model') return `unknown model: ${issue.got}`;
  if (issue.path[at] === 'disableRules') return `unknown rule: ${issue.got}`;
  return undefined;
}

const SHARE_TEXT = text({ max: MAX_INPUT_CHARS, nonBlank: true });

export const SHARE_CREATE = {
  schema: object({
    before: SHARE_TEXT,
    after: SHARE_TEXT,
    settings: optional(SHARE_SETTINGS),
    ttl: optional(oneOf(SHARE_TTLS)),
  }),
  say(issue: Issue): string | undefined {
    const [head] = issue.path;
    if (issue.problem === 'unknown' && issue.path.length === 1) return undefined;
    if (head === 'before' || head === 'after') {
      return issue.problem === 'long' ? `prompts are limited to ${MAX_INPUT_CHARS} characters` : `${head} is required`;
    }
    if (head === 'ttl') return `ttl must be ${SHARE_TTLS.join(', ').replace(/, (?=[^,]*$)/, ' or ')}`;
    if (head === 'settings') return saySettings(issue, 1);
    return undefined;
  },
};

// ---------------------------------------------------------------------------
// DELETE /api/account and DELETE /api/auth/sessions
// ---------------------------------------------------------------------------

export const ACCOUNT_DELETE = {
  schema: object({ confirm: text({ max: 200 }) }),
  say: (issue: Issue) =>
    issue.path.length === 0 || (issue.path[0] === 'confirm' && issue.problem !== 'unknown')
      ? 'type your login exactly to confirm'
      : undefined,
};

/** The id `GET /api/auth/sessions` shows for a session: 32 lowercase hex characters. */
export const SESSION_END = {
  schema: object({ id: text({ max: 32, pattern: /^[0-9a-f]{32}$/ }) }),
  say: (issue: Issue) =>
    issue.path[0] === 'id' && issue.problem !== 'unknown'
      ? 'id must be a session id from GET /api/auth/sessions'
      : undefined,
};

/** Every body above, by the route and method that reads it. Held to the routes by the tests. */
export const BODIES = {
  'POST /api/optimize': OPTIMIZE,
  'POST /api/compare': COMPARE,
  'POST /api/write': WRITE,
  'POST /api/prompts': PROMPT_CREATE,
  'POST /api/prompts/[id]': PROMPT_VERSION,
  'PATCH /api/prompts/[id]': PROMPT_RENAME,
  'POST /api/shares': SHARE_CREATE,
  'DELETE /api/account': ACCOUNT_DELETE,
  'DELETE /api/auth/sessions': SESSION_END,
} as const;
