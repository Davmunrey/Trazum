/**
 * Reading a dropped `route --json` verdict, so quality can stand beside cost.
 *
 * The bill is arithmetic: every figure in it comes from records already on
 * disk, and it can say exactly what a cheaper model would have saved. It can
 * say nothing at all about whether that model still does the job. That answer
 * costs provider calls and a credential, which is why `trazum route` exists
 * and why no surface that only reads a log will ever produce it.
 *
 * This is the bridge between the two, and it is deliberately one-directional:
 * the measurement is made where the credential is, written out as the
 * `routing-measurement` contract, and read back here by a pure function that
 * touches no network and holds no key. A reader who has run `route` once can
 * carry the verdict to any surface that prices the same workload.
 *
 * It was not possible to write until the document was worth reading. Before
 * the JSON-text sweep, `route --json` printed the whole `EvalReport` — every
 * case input and three model answers per case — so a bridge would have been a
 * feature for carrying prompt text into a browser. The document carries the
 * measurement and nothing else now, and `conform` is what says so rather than
 * this file's own reading: the contract validates, the bridge only maps.
 */

import { conform } from './conform.js';
import type { EvalVerdict } from './evaluate.js';
import { UNLABELLED } from './usage.js';

/** What a dropped routing measurement says, mapped onto what a bill can match. */
export interface DroppedVerdict {
  /** The workload the measurement was made on, or null when it was unlabelled. */
  label: string | null;
  /**
   * The model those calls go to today, from the bill's own slice.
   *
   * Not the model that answered. `route` builds its baseline provider from
   * the environment, so the model in the measurement is whatever
   * `TRAZUM_LLM_MODEL` names, and it is only the log's model when the reader
   * configured it that way. Pairing on it matched nothing on a real run
   * against an OpenAI-compatible endpoint — `evaluation.model` said
   * `stub-strong` while the log said `claude-opus-5` — and the bill would
   * have shown no verdict at all with no explanation.
   */
  model: string;
  /**
   * The model that actually answered, when it is not the one the log records.
   *
   * Null when they agree, which is the ordinary case. Not null is worth
   * saying out loud rather than smoothing over: a verdict measured on a
   * stand-in is a weaker claim about this workload than one measured on the
   * model the workload actually uses, and only this field can tell the
   * difference.
   */
  measuredOn: string | null;
  /** The model measured against it. */
  candidateModel: string;
  verdict: EvalVerdict;
  /** The model's agreement with itself. The yardstick the other rate is read against. */
  selfAgreement: number;
  /** Agreement between the two models, same prompt on both sides. */
  crossAgreement: number;
  /** Cases the measurement covered, so a two-case verdict cannot pose as a hundred. */
  cases: number;
  /** Calls it cost to reach. */
  callsMade: number;
  /**
   * What the measurement's own bill priced the route at, when the document
   * carried it. Null rather than zero when it did not: a saving nobody
   * measured is not a saving of nothing.
   */
  savingUsd: number | null;
}

/**
 * What the bridge did with a file.
 *
 * `null` is not a failure: it means the file is not a routing measurement at
 * all, and the caller should go on treating it as whatever else it was. A
 * refusal is the other case — it looked like one and could not be read — and
 * it names what is missing, because a refusal with nothing after it is
 * indistinguishable from a bug.
 */
export type BridgeReading =
  | { kind: 'verdict'; verdict: DroppedVerdict }
  | { kind: 'refusal'; because: string };

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Whether this file is even claiming to be a routing measurement.
 *
 * Shape only, and deliberately narrow: an `evaluation` object carrying a
 * `verdict`. Anything looser would swallow a usage log or a profile and
 * refuse it in this file's words instead of letting the caller price it.
 */
function claimsToBeOne(parsed: unknown): boolean {
  if (!isObject(parsed)) return false;
  const evaluation = parsed.evaluation;
  return isObject(evaluation) && typeof evaluation.verdict === 'string';
}

/**
 * Reads a dropped `trazum route --json` document.
 *
 * Returns null when the text is something else entirely. Validation is
 * `conform`'s, against the published `routing-measurement` contract, so this
 * function cannot drift from the schema a connector author builds against —
 * and a document that fails carries the contract's own sentences back to the
 * reader rather than a second opinion written here.
 */
export function readDroppedVerdict(text: string): BridgeReading | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!claimsToBeOne(parsed)) return null;

  const report = conform(text, { contract: 'routing-measurement' });
  if (!report.conforms) {
    const detail =
      report.problems.length > 0
        ? report.problems.map((problem) => `${problem.at}: ${problem.detail}`).join('; ')
        : (report.because ?? 'it does not match the routing-measurement contract');
    return { kind: 'refusal', because: detail };
  }

  const document = parsed as { slice?: unknown; evaluation?: unknown };
  const slice = isObject(document.slice) ? document.slice : {};
  const evaluation = document.evaluation as Record<string, unknown>;

  /**
   * Every field below is read defensively even though `conform` has passed,
   * because the contract requires `slice` and `evaluation` to be objects and
   * says nothing about what is inside them. A document from a future version
   * with a thinner slice is a document this reads what it can from, not one
   * it crashes on.
   */
  const answered = typeof evaluation.model === 'string' ? evaluation.model : null;
  // The slice's model first: that is the fact the bill can be matched against.
  const model = typeof slice.model === 'string' ? slice.model : answered;
  const candidateModel =
    typeof evaluation.candidateModel === 'string' ? evaluation.candidateModel : null;
  const verdict = typeof evaluation.verdict === 'string' ? (evaluation.verdict as EvalVerdict) : null;
  if (model === null || candidateModel === null || verdict === null) {
    return {
      kind: 'refusal',
      because:
        'the evaluation names no model, candidate model or verdict, so there is nothing to set beside a bill',
    };
  }

  const number = (value: unknown): number => (typeof value === 'number' ? value : 0);
  const route = isObject(slice.route) ? slice.route : null;
  const rawLabel = typeof slice.label === 'string' ? slice.label : null;

  return {
    kind: 'verdict',
    verdict: {
      // `UNLABELLED` is the profile's own sentinel for calls that carry no
      // label. It travels through the document as that sentinel and comes
      // back as null here, so the bridge speaks the bill's language rather
      // than leaking an internal marker into a caption.
      label: rawLabel === null || rawLabel === UNLABELLED ? null : rawLabel,
      model,
      measuredOn: answered !== null && answered !== model ? answered : null,
      candidateModel,
      verdict,
      selfAgreement: number(evaluation.selfAgreement),
      crossAgreement: number(evaluation.crossAgreement),
      cases: Array.isArray(evaluation.cases) ? evaluation.cases.length : 0,
      callsMade: number(evaluation.callsMade),
      savingUsd: route !== null && typeof route.savingUsd === 'number' ? route.savingUsd : null,
    },
  };
}

/**
 * Whether a verdict describes the route a given slice of the bill is offering.
 *
 * Both halves must agree or the pairing is a lie: the same workload, the same
 * model it goes to now, and the same candidate. A verdict measured on `chat`
 * shown against `summarise`'s saving would be the exact fault this repository
 * keeps finding in itself — a number describing something other than what was
 * measured — and matching on the model alone would produce it on any log with
 * two workloads on one model.
 */
export function verdictMatchesSlice(
  verdict: DroppedVerdict,
  slice: { label: string; model: string; route: { candidate: { id: string } } | null },
): boolean {
  if (slice.route === null) return false;
  const sliceLabel = slice.label === UNLABELLED ? null : slice.label;
  return (
    sliceLabel === verdict.label &&
    slice.model === verdict.model &&
    slice.route.candidate.id === verdict.candidateModel
  );
}
