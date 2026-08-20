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

/** The documents this project emits, and their names. */
export type ContractName =
  | 'usage-log'
  | 'profile'
  | 'plan'
  | 'verification'
  | 'history'
  | 'connected'
  | 'cost-answer';

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
  'cost-answer': [
    rule('verdict', 'one of within, over, cannot-tell', (v) =>
      v === 'within' || v === 'over' || v === 'cannot-tell'),
    rule('call', 'an object, or null when nothing was described', (v) => v === null || isObject(v)),
    rule('budget', 'an object, or null when there is no budget', (v) => v === null || isObject(v)),
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
  if (Array.isArray(doc.byLabelAndModel)) return 'profile';
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
        'no contract recognised it — a profile has byLabelAndModel, a plan has actions, a verification adds arrived, a history has periods and runs, a connected report has provider and unavailable, a cost answer has verdict and restsOn',
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
