import { PROVIDER_REVIEWED, modelFrom } from './pricing.js';
import type { PricingCatalogue } from './pricing.js';
import { UNLABELLED } from './usage.js';
import type { UsageBreakdown, UsageProfileReport } from './usage.js';

/**
 * The receipt: a bill's counts, with the provenance of every figure attached.
 *
 * ## What it is for
 *
 * A profile answers a question on the terminal where it ran. A receipt is the
 * same figures shaped so they can still answer it somewhere else: aggregated by
 * somebody's dashboard, filed against an invoice, or compared against last
 * month's by a reader who was not there when the command ran.
 *
 * That is why every line carries the rate behind its money and the date that
 * rate was last read. A dollar figure with no provenance cannot tell a
 * repricing from a team whose spend moved, and the consumer that most needs
 * that distinction is the one that cannot read a sentence explaining it.
 *
 * ## Why a line carries money per bucket and not only a rate
 *
 * The first version of this module published the catalogue's `inputPerMTok`
 * and `outputPerMTok` beside a dollar figure computed by `profileUsage`. Those
 * are not always the same rates. A model in a promotional window, or one whose
 * long-context tier applied, is billed at `effectivePricing`'s figure, and a
 * cached read is billed at a fraction of input that no published field named at
 * all. **A consumer multiplying the stated rates by the stated tokens got a
 * different number from the stated total, with nothing saying which was
 * wrong.**
 *
 * That is a bad defect in a document whose entire purpose is that a figure can
 * be recomputed by whoever receives it, and it is the exact failure the
 * doctrine line at the foot of this comment is about.
 *
 * So a line now carries the **money as it was actually apportioned** -- input,
 * cache reads, cache writes and output -- and `usd` is their sum. The rates stay
 * as provenance, labelled as the catalogue's published figures rather than as
 * the arithmetic. `receipt-arithmetic.test.js` fails if the four stop adding up,
 * which is a property a reader can check on any receipt they are handed rather
 * than a promise they have to take.
 *
 * ## What it carries, and what it has no field for
 *
 * Counts, model, provider, the money split by bucket, the published rates, the
 * review date, the label the log carried, the period, and what could not be
 * priced. There is **no field
 * for prompt text, for an answer, for a file path, for a branch name or for a
 * credential** — not redacted, not hashed, absent, because the input this takes
 * has nowhere to hold them either.
 *
 * `receipt-redaction.test.js` holds that by planting all 4 in a log — in the
 * session field among other places, which is the value this package has
 * promised since it shipped never comes back out — and failing if any reaches
 * the output. A property about what a document does not contain is exactly the
 * kind this repository proves by breaking rather than by asserting.
 *
 * ## What it is not
 *
 * **Not a transport.** Nothing here opens a socket, reads an environment
 * variable or takes an endpoint. `receiptFrom` returns a value; where it goes
 * is the caller's decision. A module in this package that phoned home would
 * break the roadmap's first rule, which is that no feature may make a network
 * call a prerequisite for anything.
 *
 * **Not a new measurement.** Every figure is one `profileUsage` already
 * produced. This adds provenance around them and takes nothing away.
 *
 * Doctrine: [A machine reader gets the provenance too](../../../docs/doctrine.md#a-machine-reader-gets-the-provenance-too)
 */

/**
 * The catalogue's published rates for this model, and when a human last read
 * them off the provider's own page.
 *
 * **Provenance, not the arithmetic.** These are list rates. The money that was
 * actually apportioned is in `ReceiptLine.money`, and the two differ whenever a
 * promotion or a long-context tier applied, or for any token billed at a
 * fraction of input -- which is every cached read. A consumer wanting the rate
 * that was really charged divides a bucket's money by its tokens; a consumer
 * wanting to know whether a provider repriced compares these.
 */
export interface ReceiptPricing {
  provider: string;
  inputPerMTok: number;
  outputPerMTok: number;
  /**
   * The date this provider's rates were last read off its own page, `null`
   * when the catalogue carries no date for that provider.
   *
   * Per provider rather than per catalogue, because that is how the prices are
   * actually reviewed: looking at one page and finding nothing changed is not
   * the same event as not looking. A server comparing two receipts a month
   * apart reads a repricing as a repricing instead of as a team missing a
   * target.
   */
  reviewedOn: string | null;
}

/** Where a line's money went. The four add to `ReceiptLine.usd`. */
export interface ReceiptMoney {
  inputUsd: number;
  cacheReadUsd: number;
  cacheWriteUsd: number;
  outputUsd: number;
}

/** One slice of a bill: a label's calls to one model. */
export interface ReceiptLine {
  /**
   * The attribution the log carried, or `null` for the unlabelled bucket.
   *
   * `null` rather than the sentinel, which is an internal grouping key and is
   * never serialised. A consumer that saw the raw sentinel would have to know
   * this package's internals to render it.
   */
  label: string | null;
  model: string;
  calls: number;
  inputTokens: number;
  cacheReadTokens: number;
  /** Every cache write, whatever its TTL. The sum of the two fields below. */
  cacheWriteTokens: number;
  /**
   * The two write TTLs kept apart, because they are billed at different rates.
   *
   * They are here for the same reason `UsageBreakdown` keeps them: the ratio
   * between them is not a constant across providers, so a total that has lost
   * the split can be repriced only by guessing at it. A consumer repricing this
   * traffic against another model's rates needs both.
   */
  cacheWrite5mTokens: number;
  cacheWrite1hTokens: number;
  outputTokens: number;
  /**
   * What it cost, which is exactly the sum of `money` below.
   *
   * Every line here is priced; what is not is in `gaps`.
   */
  usd: number;
  /**
   * Where the money went, as it was apportioned rather than as it might be
   * recomputed.
   *
   * This is the field that makes a receipt checkable. `usd` alone can only be
   * believed; these four can be added up, and each can be divided by its own
   * token count to recover the rate that was really charged -- including the
   * one for cached reads, which no published rate names.
   */
  money: ReceiptMoney;
  /** The catalogue's published rates, as provenance. */
  pricing: ReceiptPricing;
  /**
   * The largest single call in this slice, cache reads and writes included.
   *
   * **The one number that says whether these calls would fit somewhere else.**
   * A cheaper model with a smaller context window does not make a 400k-token
   * call cheaper, it makes it impossible, and counting an impossible call's
   * price difference as a saving is the flattering direction this repository
   * refuses. The maximum rather than an average, for the same reason: one call
   * over the ceiling is a failed call, and a mean hides it.
   *
   * Added in 2.1.0, and the gap it closes is worth naming. The two cache-write
   * TTL fields above have always been here *so a consumer could reprice this
   * traffic against another model's rates* -- and `repriceProfile` refuses to
   * price traffic that would not fit, which no reader of a receipt could
   * honour, because the receipt did not carry this. The format was built for
   * repricing and stopped one field short of it.
   */
  maxCallInputTokens: number;
  /**
   * Calls in this slice whose cache-write TTL the log did not state, so the
   * cheaper 5-minute rate was assumed.
   *
   * The document already reports the organisation-wide figure as an
   * `assumed-write-ttl` gap. This is the same fact per slice, which is the
   * resolution a repricing needs: the assumption travels into the comparison,
   * and a reader is entitled to know which slices carry it.
   */
  assumedWriteTtlCalls: number;
}

/** Everything a receipt refuses to answer, typed rather than left implicit. */
export type ReceiptGap =
  /**
   * Models the catalogue does not price, with the size of what they used.
   *
   * The counts are here rather than in a line, and the first draft of this
   * module got that wrong in a way its own guard caught. `byLabelAndModel`
   * excludes unpriced calls on purpose — the profile keeps them apart so that
   * a total is never tokens from one set of calls over dollars from another —
   * so a receipt built from that list alone silently loses them.
   *
   * The obvious repair was worse than the bug: emit a line with `label: null`.
   * That reads as *this call carried no label*, when in fact it carried one the
   * profile could not attach to a priced slice. Conflating "unlabelled" with
   * "unattributable" is the exact failure this project refuses elsewhere, so
   * the gap carries the magnitude instead and nothing pretends to an
   * attribution it does not have.
   */
  | { kind: 'unpriced'; models: string[]; calls: number; inputTokens: number; outputTokens: number }
  | { kind: 'unread-lines'; count: number }
  | { kind: 'no-clock' }
  /**
   * Calls whose cache-write TTL the log did not state, so the cheaper rate was
   * assumed.
   *
   * Reported because it changes what kind of figure this is. A total that
   * includes an assumed TTL is a **floor** on those calls, not a measurement,
   * and a document that says `counting: 'counted'` while quietly resting on an
   * assumption is claiming a precision it does not have.
   */
  | { kind: 'assumed-write-ttl'; calls: number };

export interface ReceiptDocument {
  /** The one thing a consumer must branch on. Set here, by the builder. */
  schemaVersion: 1;
  /**
   * When this receipt was made, or `null`.
   *
   * Optional on purpose, and the reason is the same one `plan.json` gives: a
   * document without a stamp is undated, which a reader can act on. A document
   * with an invented stamp is wrong, which they cannot.
   */
  emittedAt: string | null;
  /** The period the counts cover, from the log's own clock. */
  span: { fromMs: number; toMs: number; calls: number } | null;
  /**
   * How the tokens were arrived at.
   *
   * `counted` for every receipt this function builds, because a usage log
   * carries the provider's own counts. The field exists because a receipt built
   * from an estimate would be a different kind of evidence, and a consumer must
   * never have to guess which one it is holding.
   */
  counting: 'counted';
  lines: ReceiptLine[];
  total: { calls: number; usd: number };
  /**
   * What this receipt cannot say, and why.
   *
   * Present and empty rather than absent when there is nothing to report:
   * "nothing was refused" and "this document does not record refusals" are
   * different statements, and a server aggregating a thousand receipts has to
   * be able to tell them apart.
   */
  gaps: ReceiptGap[];
}

/**
 * The fields that leave this machine, keyed by the interface they describe.
 *
 * `Record<keyof ReceiptLine, true>` is what holds the two together: a field
 * added to `ReceiptLine` and not added here is a **compile error**, and so is
 * an entry here that `ReceiptLine` does not have. A whitelist maintained in two
 * places is a whitelist with a hole in it.
 *
 * **This used to say the redaction guard held that, and it did not.** The guard
 * reads the emitted lines and checks every key it finds against this list,
 * which catches an emitter that emits an unlisted field — a real property, kept
 * below. It cannot catch a field added to the *type*: a plant added
 * `operator?: string` to `ReceiptLine`, emitted it on no line the fixture
 * built, and all twelve checks passed. A field populated in one branch is
 * exactly the shape a leak takes, and the published whitelist customers read to
 * see what leaves their machine would have been wrong while its own guard said
 * otherwise.
 */
const RECEIPT_LINE_FIELD_MAP = {
  label: true,
  model: true,
  calls: true,
  inputTokens: true,
  cacheReadTokens: true,
  cacheWriteTokens: true,
  cacheWrite5mTokens: true,
  cacheWrite1hTokens: true,
  outputTokens: true,
  usd: true,
  money: true,
  pricing: true,
  maxCallInputTokens: true,
  assumedWriteTtlCalls: true,
} satisfies Record<keyof ReceiptLine, true>;

/**
 * The same list, published.
 *
 * Derived from the map rather than written again, because writing it twice is
 * the fault this exists to prevent. Key order is insertion order, so the array
 * a consumer reads is unchanged.
 */
export const RECEIPT_LINE_FIELDS: readonly string[] = Object.freeze(
  Object.keys(RECEIPT_LINE_FIELD_MAP),
);

const lineFrom = (
  label: string,
  model: string,
  breakdown: UsageBreakdown,
  catalogue: PricingCatalogue,
): ReceiptLine => {
  /*
   * Every slice reaching here is priced: `byLabelAndModel` holds only what the
   * catalogue knows. What it does not know is reported by the `unpriced` gap,
   * with its size, so the receipt's total is never mistaken for the whole bill.
   */
  const priced = modelFrom(catalogue, model);
  return {
    label: label === UNLABELLED ? null : label,
    model,
    calls: breakdown.calls,
    inputTokens: breakdown.inputTokens,
    cacheReadTokens: breakdown.cacheReadTokens,
    cacheWriteTokens: breakdown.cacheWriteTokens,
    cacheWrite5mTokens: breakdown.cacheWrite5mTokens,
    cacheWrite1hTokens: breakdown.cacheWrite1hTokens,
    outputTokens: breakdown.outputTokens,
    usd: breakdown.totalUsd,
    /*
     * Copied from the breakdown rather than recomputed from the rates below.
     * Recomputing would reintroduce the defect this field exists to fix: the
     * published rates are list rates, and a promotion, a long-context tier or
     * any cached token is billed at something else.
     */
    money: {
      inputUsd: breakdown.inputUsd,
      cacheReadUsd: breakdown.cacheReadUsd,
      cacheWriteUsd: breakdown.cacheWriteUsd,
      outputUsd: breakdown.outputUsd,
    },
    pricing: {
      provider: priced.provider ?? 'unknown',
      inputPerMTok: priced.inputPerMTok,
      outputPerMTok: priced.outputPerMTok,
      reviewedOn: PROVIDER_REVIEWED[priced.provider ?? ''] ?? null,
    },
    /* Copied, never derived. Neither can be recovered from the aggregates
       above: a maximum is not a mean, and how many calls were silent about
       their TTL is not visible in a token total. */
    maxCallInputTokens: breakdown.maxCallInputTokens,
    assumedWriteTtlCalls: breakdown.assumedWriteTtlCalls,
  };
};

export interface ReceiptOptions {
  /** Stamp the document. Omit for an undated receipt, which is valid. */
  emittedAt?: Date;
}

/**
 * Build a receipt from a profile the caller already computed.
 *
 * Takes the report rather than the log text, and that is the guarantee rather
 * than an ergonomic choice: `UsageProfileReport` has no field that can hold
 * prompt content, so this function could not emit any even if it tried. The
 * narrow input is what makes the promise checkable instead of merely stated.
 */
export function receiptFrom(
  report: UsageProfileReport,
  catalogue: PricingCatalogue,
  options: ReceiptOptions = {},
): ReceiptDocument {
  const lines = report.byLabelAndModel.map((slice) =>
    lineFrom(slice.label, slice.model, slice.breakdown, catalogue),
  );

  const gaps: ReceiptGap[] = [];
  if (report.unpricedModels.length > 0) {
    gaps.push({
      kind: 'unpriced',
      models: [...report.unpricedModels],
      calls: report.unpriced.calls,
      inputTokens: report.unpriced.inputTokens,
      outputTokens: report.unpriced.outputTokens,
    });
  }
  if (report.skippedLines.length > 0) {
    gaps.push({ kind: 'unread-lines', count: report.skippedLines.length });
  }
  if (report.span === null) gaps.push({ kind: 'no-clock' });

  /*
   * Summed across the lines rather than read off a total, because the profile
   * keeps this per slice and a receipt reports it once for the document.
   */
  const assumed = report.byLabelAndModel.reduce(
    (sum, slice) => sum + slice.breakdown.assumedWriteTtlCalls,
    0,
  );
  if (assumed > 0) gaps.push({ kind: 'assumed-write-ttl', calls: assumed });

  return {
    schemaVersion: 1,
    emittedAt: options.emittedAt?.toISOString() ?? null,
    span: report.span === null ? null : { ...report.span },
    counting: 'counted',
    lines,
    /*
     * `report.total` already excludes what could not be priced — the profile
     * keeps those in `unpriced` precisely so a total is never tokens from one
     * set of calls divided by dollars from another. The receipt inherits that
     * separation rather than re-deriving it, and `gaps` carries the size of
     * what is missing.
     */
    total: { calls: report.total.calls, usd: report.total.totalUsd },
    gaps,
  };
}
