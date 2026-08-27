import type { ContractName } from './conform.js';

/**
 * A JSON Schema for every contract, so a document can be checked with **no
 * Trazum at all** — any off-the-shelf draft 2020-12 validator will do.
 *
 * Authored, not generated: `conform`'s rules live as functions and a schema
 * generated from closures would be a guess wearing a standard. What keeps the
 * two doors honest instead is the guard in the suite: every fixture `conform`
 * accepts must validate against its schema, and every fixture `conform`
 * rejects for a structural reason must fail it — a schema that drifts from
 * `conform` is the two-doors defect wearing a file format.
 *
 * The schemas state **required fields and their types, and stop there** —
 * the same line `conform` holds. `additionalProperties` is never `false`:
 * these documents gain fields without a version bump, and a schema that
 * rejected tomorrow's field would be a schema nobody upgrades. Field prose
 * lives in `docs/json-output.md`; the schema carries structure.
 */

const DRAFT = 'https://json-schema.org/draft/2020-12/schema';

/** Shorthand: an object schema over required properties. */
function doc(name: ContractName, properties: Record<string, unknown>): Record<string, unknown> {
  return {
    $schema: DRAFT,
    $id: `https://github.com/Davmunrey/Trazum/schema/${name}/v1.json`,
    title: `trazum ${name} document, schemaVersion 1`,
    type: 'object',
    required: ['schemaVersion', ...Object.keys(properties)],
    properties: {
      schemaVersion: { const: 1 },
      ...properties,
    },
  };
}

const array = { type: 'array' } as const;
const object = { type: 'object' } as const;
const number = { type: 'number' } as const;
const string = { type: 'string' } as const;
const boolean = { type: 'boolean' } as const;
const objectOrNull = { type: ['object', 'null'] } as const;
const stringOrNull = { type: ['string', 'null'] } as const;

/**
 * One schema per contract, keyed by the exact names `--contract` accepts.
 *
 * The usage log is the one non-document contract: its schema describes **one
 * record** — one line of the log — because a `.jsonl` file is not itself a
 * JSON value and no JSON Schema can describe a file of lines. Validators run
 * per line, which is how the log is read everywhere else too.
 */
export const CONTRACT_SCHEMAS: Record<ContractName, Record<string, unknown>> = {
  'usage-log': {
    $schema: DRAFT,
    $id: 'https://github.com/Davmunrey/Trazum/schema/usage-log/v1.json',
    title: 'trazum usage-log record — one line of the log',
    type: 'object',
    required: ['model'],
    properties: {
      model: string,
      usage: object,
      timestamp: string,
      label: string,
      session: string,
      outcome: string,
      stop_reason: string,
    },
  },
  profile: doc('profile', {
    total: object,
    byLabel: array,
    byModel: array,
    byLabelAndModel: array,
    unpricedModels: array,
    skippedLines: array,
    span: objectOrNull,
  }),
  fleet: doc('fleet', { bySource: array, rollup: object }),
  plan: doc('plan', {
    actions: array,
    projectedSavingUsd: number,
    measuredStakeUsd: number,
    totalUsd: number,
  }),
  verification: doc('verification', {
    actions: array,
    arrived: number,
    notArrived: number,
    cannotTell: number,
  }),
  history: doc('history', { periods: array, runs: array }),
  connected: doc('connected', { provider: string, total: object, unavailable: array }),
  'cost-answer': doc('cost-answer', {
    verdict: string,
    call: objectOrNull,
    budget: objectOrNull,
  }),
  'spend-guard': doc('spend-guard', {
    verdict: string,
    cost: object,
    alternatives: array,
    because: string,
  }),
  'outcome-report': doc('outcome-report', {
    slices: array,
    undeclared: array,
    coverage: object,
    successShareOfRecordedUsd: { type: ['number', 'null'] },
    noRate: stringOrNull,
  }),
  'annual-record': doc('annual-record', {
    months: array,
    missingMonths: array,
    promises: object,
    outcomes: objectOrNull,
    cannotSay: array,
  }),
  'roll-up': doc('roll-up', {
    contributors: array,
    rejected: array,
    total: object,
    notMerged: array,
    cannotSay: array,
  }),
  'first-run': doc('first-run', { config: object, justified: array, declined: array }),
  pulse: doc('pulse', { beats: array, nowMs: number, stale: boolean }),
  'rule-yield': doc('rule-yield', {
    rules: array,
    tokensBefore: number,
    tokensSaved: number,
    floor: number,
  }),
  'gateway-refusal': doc('gateway-refusal', { error: object, reason: string, alternatives: array }),
  bench: doc('bench', { workloads: array, node: string, cpus: number }),
  'prompt-draft': doc('prompt-draft', {
    prompt: stringOrNull,
    sections: array,
    answered: array,
    declined: array,
    missing: array,
    measured: objectOrNull,
  }),
  position: doc('position', {
    // The document's own signature: no other contract names its source.
    source: { const: 'usage-log' },
    month: object,
    positions: array,
    unmeasured: array,
    cannotSay: array,
    unpricedRecords: number,
  }),
  'routing-measurement': doc('routing-measurement', {
    slice: object,
    evaluation: object,
  }),
  'example-pruning': doc('example-pruning', {
    provider: string,
    model: string,
    selfAgreement: number,
    recoverableTokens: number,
    callsMade: number,
    contributions: array,
  }),
};

/** The schema for one named contract — the object `trazum schema` prints. */
export function contractSchema(name: ContractName): Record<string, unknown> {
  return CONTRACT_SCHEMAS[name];
}
