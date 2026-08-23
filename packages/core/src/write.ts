/**
 * The interview behind `trazum write`.
 *
 * Every other command in this product reads a prompt somebody already wrote.
 * This one starts from nothing and asks. What it asks is the product: a
 * question whose answer cannot change the output is waste, and waste is this
 * tool's entire subject.
 *
 * **Deterministic, and deliberately so.** No model decides what to ask. The
 * catalogue below is fixed, the gates are predicates over the answers so far,
 * and the same answers produce the same interview on any machine — which is
 * what lets the offline rule hold without a footnote.
 *
 * **Ids here, words in the CLI.** Same split as the rules catalogue: this file
 * knows a slot exists and what opens it; `packages/cli/src/i18n` knows how to
 * ask it in a locale. A locale changes the question, never which questions.
 */

/**
 * The sections of an assembled prompt, in the order they are written.
 *
 * The order is fixed, and for a reason this tool can price: prompt caching is
 * a byte-for-byte prefix match, so everything stable goes first and everything
 * that varies per call goes last, which makes the cacheable prefix as long as
 * the prompt allows.
 */
export const SECTIONS = [
  'role',
  'task',
  'inputs',
  'output',
  'constraints',
  'examples',
  'failure-modes',
] as const;

export type Section = (typeof SECTIONS)[number];

/**
 * An answer, or an explicit decline.
 *
 * `null` is a decline and not an absence: somebody was asked and said no. The
 * difference is the one this product refuses to lose everywhere else, and a
 * declined slot is named in the output rather than silently dropped.
 */
export type Answer = string | null;

export type Answers = Readonly<Record<string, Answer>>;

export interface Slot {
  readonly id: string;
  /**
   * The section it fills, or `null` when it changes the report and never the
   * prompt — the model to price against, the budget to check.
   */
  readonly section: Section | null;
  /** A prompt cannot be assembled while a required, open slot is unanswered. */
  readonly required: boolean;
  /**
   * Open only when this returns true. Absent means always open.
   *
   * Every gate here has an answer set that opens it and one that does not — a
   * gate that is always true or always false does nothing, and a test proves
   * both directions for each.
   */
  readonly opensWhen?: (answers: Answers) => boolean;
}

/**
 * The closed vocabulary `output-shape` accepts.
 *
 * Named `OutputFormat` rather than `OutputShape` because that name is already
 * taken by the usage report's finding about where output spend concentrates,
 * and two unrelated things under one name in one package is how a consumer
 * imports the wrong one.
 */
export const OUTPUT_FORMATS = ['prose', 'json', 'list', 'table'] as const;
export type OutputFormat = (typeof OUTPUT_FORMATS)[number];

const answered = (answers: Answers, id: string): boolean =>
  Object.prototype.hasOwnProperty.call(answers, id) && answers[id] !== null;

const shapeIs = (...formats: readonly OutputFormat[]) => (answers: Answers): boolean => {
  const shape = answers['output-shape'];
  return typeof shape === 'string' && formats.includes(shape as OutputFormat);
};

/**
 * The catalogue, in the order the interview walks it.
 *
 * Required first is not an accident: somebody who abandons the interview
 * halfway should have answered the things without which there is no prompt at
 * all, rather than having spent their attention on the optional half.
 */
export const SLOTS: readonly Slot[] = [
  { id: 'task', section: 'task', required: true },
  { id: 'role', section: 'role', required: true },
  { id: 'inputs', section: 'inputs', required: true },
  { id: 'output-shape', section: 'output', required: true },
  { id: 'output-schema', section: 'output', required: true, opensWhen: shapeIs('json', 'table') },
  { id: 'output-length', section: 'output', required: false, opensWhen: shapeIs('prose', 'list') },
  { id: 'audience', section: 'role', required: false },
  { id: 'constraints', section: 'constraints', required: false },
  { id: 'refusal', section: 'constraints', required: false },
  { id: 'examples', section: 'examples', required: false },
  {
    id: 'example-inputs',
    section: 'examples',
    required: false,
    opensWhen: (answers) => answered(answers, 'examples'),
  },
  { id: 'failure-modes', section: 'failure-modes', required: false },
  { id: 'model', section: null, required: false },
  { id: 'budget', section: null, required: false },
];

export const SLOT_IDS: readonly string[] = SLOTS.map((entry) => entry.id);

export function slot(id: string): Slot | undefined {
  return SLOTS.find((entry) => entry.id === id);
}

/** Whether a slot is worth asking, given what is known so far. */
export function isOpen(entry: Slot, answers: Answers): boolean {
  return entry.opensWhen === undefined || entry.opensWhen(answers);
}

export interface Interview {
  /** The next question to ask, or null when there is nothing left worth asking. */
  readonly next: string | null;
  /**
   * True when every open slot has an answer or a decline.
   *
   * The interview says it is finished rather than continuing to be thorough at
   * somebody's expense. Being asked a question whose answer changes nothing is
   * the same waste this tool charges people to find in their prompts.
   */
  readonly done: boolean;
  readonly open: readonly string[];
  readonly answered: readonly string[];
  readonly declined: readonly string[];
  /**
   * Required, open, and unanswered.
   *
   * A refusal never arrives bare: whatever cannot be built is reported with
   * these named, and the CLI renders what each one unlocks beside it.
   */
  readonly missing: readonly string[];
}

export function interview(answers: Answers): Interview {
  const open = SLOTS.filter((entry) => isOpen(entry, answers));
  const has = (entry: Slot) => Object.prototype.hasOwnProperty.call(answers, entry.id);
  const unasked = open.filter((entry) => !has(entry));
  return {
    next: unasked[0]?.id ?? null,
    done: unasked.length === 0,
    open: open.map((entry) => entry.id),
    answered: open.filter((entry) => answered(answers, entry.id)).map((entry) => entry.id),
    declined: open
      .filter((entry) => has(entry) && answers[entry.id] === null)
      .map((entry) => entry.id),
    missing: unasked.filter((entry) => entry.required).map((entry) => entry.id),
  };
}
