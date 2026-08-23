/**
 * Does this document conform, and what will it not be able to answer?
 *
 * Ten releases of arithmetic that refuses to flatter are worth more if other
 * tools can emit and read the same documents. That needs two things, and this
 * module is the second of them: the contracts are written down in `docs/`, and
 * an emitter needs a way to find out whether what it produces actually
 * satisfies one — without reading a specification and hoping.
 *
 * **Two questions, kept apart.** *Is this a valid X* is a yes or no. *What can
 * a valid X of this shape not tell you* is the useful one, and it has nothing
 * to do with validity: a usage log with no `session` field is perfectly valid
 * and simply cannot support conversation growth. An emitter that only learns
 * the first answer ships something Trazum reads and half the findings quietly
 * never appear. So a conforming document still comes back with a list of what
 * it has bought itself out of.
 *
 * **It never repairs and never guesses.** A line that will not parse is
 * reported at its position; a field of the wrong type is named with the type
 * found. Nothing is coerced — the whole point of a conformance check that a
 * third party runs is that it agrees with what the reader will actually do.
 *
 * **Unknown fields are not problems.** Documents here gain fields without a
 * version bump, and a checker that rejects tomorrow's field is a checker
 * nobody upgrades. Only *absent* required fields and *wrong* types fail.
 */

/**
 * The documents this project emits, and their names.
 *
 * A runtime array rather than a bare union, because the union alone cannot be
 * read by anything but the type checker. The CLI kept its own hand-written copy
 * of these names for `--contract`, and that copy stopped at `cost-answer`: the
 * two contracts added at 1.50.4 and 1.51.0 existed, had rules, and could not be
 * named. One home per fact, and this is the home.
 */
export const CONTRACT_NAMES = [
  'usage-log',
  'profile',
  'plan',
  'verification',
  'history',
  'connected',
  'cost-answer',
  'outcome-report',
  'annual-record',
  'roll-up',
  'prompt-draft',
] as const;

export type ContractName = (typeof CONTRACT_NAMES)[number];

export interface ConformanceProblem {
  /** Where: `line 12` for a log, or a dotted path inside a document. */
  at: string;
  kind:
    /** A required field is absent. */
    | 'missing'
    /** Present, and not the type the contract states. */
    | 'wrong-type'
    /** Present as `0` where the contract requires `null` for absence. */
    | 'absence-as-zero'
    /** The line or the document could not be parsed at all. */
    | 'unreadable';
  detail: string;
}

/** A finding a valid document of this shape simply cannot support. */
export interface UnavailableFinding {
  finding: string;
  because: string;
  unlockedBy: string;
}

export interface ConformanceReport {
  schemaVersion: 1;
  /** Which contract this looks like, or null when nothing did. */
  contract: ContractName | null;
  /**
   * Why nothing matched. Present only when `contract` is null, and never a
   * bare "invalid": a refusal with nothing after it is indistinguishable from
   * a bug, which is the rule this project applies to every other refusal.
   */
  because: string | null;
  problems: ConformanceProblem[];
  unavailable: UnavailableFinding[];
  /** Records examined, for a log. Null for a single document. */
  records: number | null;
  conforms: boolean;
}

/** Fields a usage record may carry, and the finding each one buys. */
const USAGE_OPTIONAL: { field: string; finding: string; unlockedBy: string }[] = [
  {
    field: 'label',
    finding: 'per-workload bills, per-label budgets, the ranked plan',
    unlockedBy: 'a "label" naming the workload on each record',
  },
  {
    field: 'timestamp',
    finding: 'days, drift, the watch, any rate per period',
    unlockedBy: 'a "timestamp" on each record (ISO 8601 or epoch milliseconds)',
  },
  {
    field: 'session',
    finding: 'conversation growth, per-session budgets, cache TTL fit',
    unlockedBy: 'a "session" grouping the turns of one conversation',
  },
  {
    field: 'cache',
    finding: 'the cache verdict — whether caching is paying for itself',
    unlockedBy: 'cache_read_input_tokens and cache_creation_input_tokens',
  },
  {
    field: 'stop_reason',
    finding: 'truncation and the retry it causes — work billed twice',
    unlockedBy: 'a "stop_reason" carrying what the provider returned',
  },
];

function typeOf(value: unknown): string {
  if (value === null) return 'null';
  return Array.isArray(value) ? 'array' : typeof value;
}

/** Whether a record carries usable token counts, nested or flat. */
function usageOf(record: Record<string, unknown>): Record<string, unknown> | null {
  const nested = record.usage;
  if (typeof nested === 'object' && nested !== null && !Array.isArray(nested)) {
    return nested as Record<string, unknown>;
  }
  // A flat record is equally valid — an OTel exporter reshaping spans has no
  // reason to nest — so the absence of `usage` is not itself a problem.
  return record;
}

const TOKEN_FIELDS = [
  'input_tokens',
  'prompt_tokens',
  'output_tokens',
  'completion_tokens',
  'cache_read_input_tokens',
  'cache_creation_input_tokens',
];

/** Checks a body of one-JSON-object-per-line records. */
function conformUsageLog(text: string): ConformanceReport {
  const problems: ConformanceProblem[] = [];
  const seen = new Set<string>();
  let records = 0;

  text.split('\n').forEach((line, index) => {
    if (line.trim() === '') return;
    const at = `line ${index + 1}`;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      problems.push({ at, kind: 'unreadable', detail: 'not valid JSON' });
      return;
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      problems.push({ at, kind: 'wrong-type', detail: `a record must be an object, found ${typeOf(parsed)}` });
      return;
    }
    records += 1;
    const record = parsed as Record<string, unknown>;

    if (typeof record.model !== 'string' || record.model.trim() === '') {
      problems.push({ at, kind: 'missing', detail: '"model" is required, so the tokens can be priced' });
    }

    const usage = usageOf(record);
    const hasTokens =
      usage !== null && TOKEN_FIELDS.some((field) => typeof usage[field] === 'number');
    if (!hasTokens) {
      problems.push({
        at,
        kind: 'missing',
        detail: `token counts are required — one of ${TOKEN_FIELDS.join(', ')}, nested under "usage" or flat`,
      });
    }

    for (const field of ['label', 'timestamp', 'session', 'stop_reason']) {
      if (record[field] !== undefined && record[field] !== null) seen.add(field);
    }
    if (usage !== null) {
      for (const field of ['cache_read_input_tokens', 'cache_creation_input_tokens']) {
        if (typeof usage[field] === 'number') seen.add('cache');
      }
    }
  });

  const unavailable = USAGE_OPTIONAL.filter((entry) => !seen.has(entry.field)).map((entry) => ({
    finding: entry.finding,
    because: `no record carries "${entry.field}"`,
    unlockedBy: entry.unlockedBy,
  }));

  return {
    schemaVersion: 1,
    contract: 'usage-log',
    because: null,
    problems,
    unavailable,
    records,
    conforms: problems.length === 0,
  };
}

/** Whether a lone JSON object is a usage record rather than a document. */
function looksLikeUsageRecord(doc: Record<string, unknown>): boolean {
  if (typeof doc.model !== 'string') return false;
  const usage = usageOf(doc);
  return usage !== null && TOKEN_FIELDS.some((field) => typeof usage[field] === 'number');
}

/** A required field of a document contract, and how to check it. */
interface FieldRule {
  path: string;
  check: (value: unknown) => boolean;
  expected: string;
}

const rule = (path: string, expected: string, check: (value: unknown) => boolean): FieldRule => ({
  path,
  expected,
  check,
});

const isArray = (value: unknown): boolean => Array.isArray(value);
const isObject = (value: unknown): boolean =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isNumber = (value: unknown): boolean => typeof value === 'number' && Number.isFinite(value);

const DOCUMENT_RULES: Record<Exclude<ContractName, 'usage-log'>, FieldRule[]> = {
  profile: [
    rule('total', 'an object of token counts and dollars', isObject),
    rule('byLabel', 'an array, largest bill first', isArray),
    rule('byModel', 'an array, largest bill first', isArray),
    rule('byLabelAndModel', 'an array — the grain a routing decision is made at', isArray),
    rule('unpricedModels', 'an array, named rather than costed at zero', isArray),
    rule('skippedLines', 'an array of 1-based positions', isArray),
    rule('span', 'an object, or null when the log carried no clock', (v) => v === null || isObject(v)),
  ],
  plan: [
    rule('actions', 'an array, largest money first', isArray),
    rule('projectedSavingUsd', 'a number', isNumber),
    rule('measuredStakeUsd', 'a number, never added to the projection', isNumber),
    rule('totalUsd', 'a number — the bill the plan was made against', isNumber),
  ],
  verification: [
    rule('actions', 'an array of judged actions', isArray),
    rule('arrived', 'a number', isNumber),
    rule('notArrived', 'a number', isNumber),
    rule('cannotTell', 'a number — three outcomes, never two', isNumber),
  ],
  history: [
    rule('periods', 'an array of dated reports, oldest first', isArray),
    rule('runs', 'an array of named shapes — never forecasts', isArray),
  ],
  connected: [
    rule('provider', 'a string', (v) => typeof v === 'string'),
    rule('total', 'an object', isObject),
    rule('unavailable', 'an array of findings this source cannot support', isArray),
  ],
  /**
   * The outcome chapter — the standard is only worth something if its
   * refusals travel with it.
   *
   * Another tool emitting this format has to handle a **missing numerator**
   * the same way this one does: a rate that is `null` rather than `0` when
   * nothing was recorded, a `noRate` beside it saying which of the two reasons
   * applies, and undeclared values kept in their own list rather than folded
   * into the failures. A format that carried the fields and lost the refusals
   * would be worse than no format, because it would look interoperable.
   */
  'outcome-report': [
    rule('slices', 'an array of declared outcome values, dearest first', isArray),
    rule('undeclared', 'an array — named, never counted as failures', isArray),
    rule('coverage', 'an object with recorded, parsed and unrecordedUsd', isObject),
    rule(
      'successShareOfRecordedUsd',
      'a number, or **null** when nothing was recorded — never 0, which is a real and terrible measurement rather than an absence',
      // `absence-as-zero` is detected from the word "null" in the expected
      // text, so a tool emitting 0 here is told it emitted an absence as a
      // measurement rather than merely getting a type wrong.
      (v) => v === null || isNumber(v),
    ),
    rule(
      'noRate',
      'a string saying why there is no rate, or null when there is one — a refusal never arrives bare',
      (v) => v === null || typeof v === 'string',
    ),
  ],
  'annual-record': [
    rule('months', 'an array, oldest first', isArray),
    rule('missingMonths', 'an array — named, never interpolated', isArray),
    rule('promises', 'an object with planned, arrived, notArrived and cannotTell', isObject),
    rule(
      'outcomes',
      'an object, or null when nothing recorded one',
      (v) => v === null || isObject(v),
    ),
    rule('cannotSay', 'an array of what this record cannot answer', isArray),
  ],
  /**
   * The roll-up — the chapter where the refusals matter most, because this is
   * the one document assembled from other people's measurements.
   *
   * `contributors` and `rejected` are both required and neither may be
   * inferred from the other: a roll-up that merged three of four contributions
   * and listed three contributors is indistinguishable, field by field, from a
   * roll-up of three. The fourth machine's entire bill goes missing and the
   * total looks complete.
   */
  'roll-up': [
    rule('contributors', 'an array — every contribution that was merged, with its own gaps', isArray),
    rule('rejected', 'an array — every contribution that was not merged, and why; never dropped in silence', isArray),
    rule('total', 'an object of token counts and dollars', isObject),
    rule('notMerged', 'an array of findings that do not roll up, each with the reason', isArray),
    rule('cannotSay', 'an array of what this roll-up cannot say about itself', isArray),
  ],
  'cost-answer': [
    rule('verdict', 'one of within, over, cannot-tell', (v) =>
      v === 'within' || v === 'over' || v === 'cannot-tell'),
    rule('call', 'an object, or null when nothing was described', (v) => v === null || isObject(v)),
    rule('budget', 'an object, or null when there is no budget', (v) => v === null || isObject(v)),
  ],
  /**
   * A prompt somebody was interviewed into, and what the interview could not
   * get out of them.
   *
   * `prompt` is **null and never an empty string** when required answers are
   * missing: an empty string reads as a prompt that came out blank, and the
   * difference between "not built" and "built and empty" is the one this
   * format refuses to lose everywhere else.
   *
   * `declined` and `missing` are separate arrays for the same reason. Somebody
   * who was asked and said no is not somebody who was never asked, and folding
   * the two would turn a decision into a gap.
   */
  'prompt-draft': [
    rule(
      'prompt',
      'the assembled prompt, or **null** when required answers are missing — never an empty string',
      (v) => v === null || typeof v === 'string',
    ),
    rule('sections', 'an array of the sections that got words, in the order they are written', isArray),
    rule('answered', 'an array of the slots that were answered', isArray),
    rule('declined', 'an array of the slots somebody was asked and declined — never folded into missing', isArray),
    rule('missing', 'an array of required slots still unanswered; empty exactly when prompt is a string', isArray),
    rule(
      'measured',
      'an object of the three claims, or **null** when there is no prompt to measure — never an object of zeros',
      (v) => v === null || isObject(v),
    ),
  ],
};

/**
 * Rules that read more than one field, because the refusals worth carrying are
 * relational.
 *
 * A per-field contract can say "a number or null". It cannot say **"null when
 * nothing was recorded, and a number otherwise"** — and that is the whole
 * refusal. A rate of `0` is perfectly valid when calls were recorded and none
 * of them succeeded; it is a lie when nothing was recorded at all, and the
 * difference is in a different field.
 *
 * This was found while writing the outcome chapter: the per-field rule accepted
 * `0` for the rate because zero is a finite number, so the strongest promise in
 * the format was going uncarried. A standard that shipped the fields and lost
 * that would be worse than no standard, because it would look interoperable.
 */
interface CrossRule {
  at: string;
  kind: ConformanceProblem['kind'];
  /** True when the document is fine. */
  ok: (doc: Record<string, unknown>) => boolean;
  detail: string;
}

const CROSS_RULES: Partial<Record<Exclude<ContractName, 'usage-log'>, CrossRule[]>> = {
  'outcome-report': [
    {
      at: 'successShareOfRecordedUsd',
      kind: 'absence-as-zero',
      ok: (doc) => {
        const coverage = doc.coverage as { recorded?: unknown } | undefined;
        const recorded = typeof coverage?.recorded === 'number' ? coverage.recorded : null;
        if (recorded !== 0) return true;
        return doc.successShareOfRecordedUsd === null;
      },
      detail:
        'nothing was recorded, so the rate must be null — 0 is a real and terrible measurement and this is an absence',
    },
    {
      at: 'noRate',
      kind: 'missing',
      ok: (doc) => (doc.successShareOfRecordedUsd === null ? doc.noRate !== null : doc.noRate === null),
      detail:
        'a null rate needs a reason beside it and a stated rate must not carry one — a refusal never arrives bare, and a reason attached to an answer is two answers',
    },
  ],
  /**
   * The two refusals that must travel with a roll-up, or the format is worse
   * than no format.
   *
   * **Overlap between contributors is unmeasurable**, always, for every
   * roll-up of more than one document: two people exporting the same traffic
   * double the bill and no merge of summaries can see it, because the raw
   * lines a duplicate check needs are in neither document. An emitter that
   * carried the fields and lost that would be handing somebody a doubled total
   * that looks audited.
   *
   * And a **rejected contribution** is the other one. A machine whose document
   * did not conform contributed nothing, and a roll-up that says so nowhere
   * reads exactly like a roll-up of everybody.
   */
  'roll-up': [
    {
      at: 'cannotSay',
      kind: 'missing',
      ok: (doc) =>
        !Array.isArray(doc.contributors) ||
        doc.contributors.length < 2 ||
        (Array.isArray(doc.cannotSay) && doc.cannotSay.includes('overlap-invisible')),
      detail:
        'more than one contributor and cannotSay does not say overlap-invisible — two people exporting the same traffic double the bill, and a merge of summaries cannot see it',
    },
    {
      at: 'cannotSay',
      kind: 'missing',
      ok: (doc) =>
        !Array.isArray(doc.rejected) ||
        doc.rejected.length === 0 ||
        (Array.isArray(doc.cannotSay) && doc.cannotSay.includes('contribution-rejected')),
      detail:
        'a contribution was rejected and cannotSay does not say so — a machine that contributed nothing must not read as a machine that spent nothing',
    },
  ],
  'annual-record': [
    {
      at: 'cannotSay',
      kind: 'missing',
      ok: (doc) =>
        !Array.isArray(doc.missingMonths) ||
        doc.missingMonths.length === 0 ||
        (Array.isArray(doc.cannotSay) && doc.cannotSay.includes('months-missing')),
      detail:
        'months are missing and cannotSay does not say so — a year that quietly covers nine months and prints an annual total is wrong by a quarter',
    },
  ],
};

/**
 * Which contract a document is claiming to be.
 *
 * By its most distinctive required field, not by trying each in turn and
 * keeping the one with fewest complaints — that would report a broken plan as
 * a slightly-more-broken profile, and send somebody to fix the wrong document.
 */
function contractOf(doc: Record<string, unknown>): Exclude<ContractName, 'usage-log'> | null {
  // Before the profile check, deliberately: a roll-up carries `byLabelAndModel`
  // too — it is a merged bill, sliced the same way — so testing the profile
  // first would classify every roll-up as a profile, accept it as conformant,
  // and never apply the two refusals that only a roll-up has to carry.
  if (Array.isArray(doc.contributors) && Array.isArray(doc.notMerged)) return 'roll-up';
  if (Array.isArray(doc.byLabelAndModel)) return 'profile';
  if (Array.isArray(doc.missingMonths) && isObject(doc.promises)) return 'annual-record';
  if (Array.isArray(doc.undeclared) && isObject(doc.coverage)) return 'outcome-report';
  if (Array.isArray(doc.periods) && Array.isArray(doc.runs)) return 'history';
  if (Array.isArray(doc.actions) && typeof doc.arrived === 'number') return 'verification';
  if (Array.isArray(doc.actions)) return 'plan';
  if (typeof doc.verdict === 'string' && 'restsOn' in doc) return 'cost-answer';
  if (typeof doc.provider === 'string' && Array.isArray(doc.unavailable)) return 'connected';
  return null;
}

export interface ConformOptions {
  /** Force a contract instead of detecting one, for an emitter under test. */
  contract?: ContractName;
}

/**
 * Checks a document or a usage log against the contract it claims.
 *
 * The check is on **required fields and their types**, and stops there.
 * Documents here gain fields without a version bump, so a checker that
 * rejected an unrecognised field would fail every consumer one release after
 * it shipped.
 */
export function conform(text: string, options: ConformOptions = {}): ConformanceReport {
  const trimmed = text.trim();
  if (trimmed === '') {
    return {
      schemaVersion: 1,
      contract: null,
      because: 'the input is empty',
      problems: [],
      unavailable: [],
      records: null,
      conforms: false,
    };
  }

  if (options.contract === 'usage-log') return conformUsageLog(text);

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    // More than one line, and not one JSON value: a usage log is the only
    // shape here that looks like that, so it is what the reader would try.
    if (trimmed.includes('\n')) return conformUsageLog(text);
    return {
      schemaVersion: 1,
      contract: null,
      because: 'it is neither valid JSON nor one JSON object per line',
      problems: [],
      unavailable: [],
      records: null,
      conforms: false,
    };
  }

  if (!isObject(parsed)) {
    return {
      schemaVersion: 1,
      contract: null,
      because: `a document must be a JSON object, found ${typeOf(parsed)}`,
      problems: [],
      unavailable: [],
      records: null,
      conforms: false,
    };
  }

  const doc = parsed as Record<string, unknown>;

  /**
   * A one-record log is both one JSON object per line **and** a valid JSON
   * document, so detection has to break the tie. A `model` with token counts
   * beside it is a usage record and nothing else in this project looks like
   * one — every document contract carries `schemaVersion` and an array.
   *
   * `--contract usage-log` remains the way to be explicit, and an emitter
   * testing a single record should use it.
   */
  if (options.contract === undefined && looksLikeUsageRecord(doc)) return conformUsageLog(text);

  // `usage-log` has already returned above, so anything left here is a
  // document contract or nothing at all.
  const contract = options.contract ?? contractOf(doc);

  if (contract === null) {
    return {
      schemaVersion: 1,
      contract: null,
      because:
        'no contract recognised it — a roll-up has contributors and notMerged, a profile has byLabelAndModel, a plan has actions, a verification adds arrived, a history has periods and runs, a connected report has provider and unavailable, a cost answer has verdict and restsOn',
      problems: [],
      unavailable: [],
      records: null,
      conforms: false,
    };
  }

  const problems: ConformanceProblem[] = [];

  /**
   * `schemaVersion` is checked for every document and is the one field whose
   * absence is worth calling out separately: a consumer branches on it, and a
   * document without one cannot be told from a document written before the
   * contract existed.
   */
  if (doc.schemaVersion === undefined) {
    problems.push({
      at: 'schemaVersion',
      kind: 'missing',
      detail: 'required — a consumer branches on it, and its absence cannot be told from a pre-contract document',
    });
  } else if (doc.schemaVersion !== 1) {
    problems.push({
      at: 'schemaVersion',
      kind: 'wrong-type',
      detail: `expected 1, found ${JSON.stringify(doc.schemaVersion)}`,
    });
  }

  for (const field of DOCUMENT_RULES[contract]) {
    const value = doc[field.path];
    if (value === undefined) {
      problems.push({ at: field.path, kind: 'missing', detail: `required: ${field.expected}` });
      continue;
    }
    if (!field.check(value)) {
      // A zero where the contract requires null for absence is called out as
      // its own kind, because it is the mistake that produces a wrong report
      // rather than a rejected one — and it is always in the flattering
      // direction.
      const kind: ConformanceProblem['kind'] =
        value === 0 && field.expected.includes('null') ? 'absence-as-zero' : 'wrong-type';
      problems.push({
        at: field.path,
        kind,
        detail: `expected ${field.expected}, found ${typeOf(value)}`,
      });
    }
  }

  // Relational rules last, so a document with a missing field is told about the
  // field before it is told about a relationship that field is half of.
  for (const cross of CROSS_RULES[contract] ?? []) {
    if (!cross.ok(doc)) {
      problems.push({ at: cross.at, kind: cross.kind, detail: cross.detail });
    }
  }

  return {
    schemaVersion: 1,
    contract,
    because: null,
    problems,
    unavailable: [],
    records: null,
    conforms: problems.length === 0,
  };
}
