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
 * ## What it carries, and what it has no field for
 *
 * Counts, model, provider, the rates applied, the review date, the label the
 * log carried, the period, and what could not be priced. There is **no field
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

/** Which price produced a line's money, and when a human last checked it. */
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
  cacheWriteTokens: number;
  outputTokens: number;
  /** What it cost. Every line here is priced; what is not is in `gaps`. */
  usd: number;
  /** The rates behind `usd`. */
  pricing: ReceiptPricing;
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
  | { kind: 'no-clock' };

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
 * The fields that leave this machine, listed once, in one place.
 *
 * The redaction guard reads this array rather than a copy of it, so a field
 * added to `ReceiptLine` and not added here fails the guard. A whitelist
 * maintained in two places is a whitelist with a hole in it.
 */
export const RECEIPT_LINE_FIELDS = Object.freeze([
  'label',
  'model',
  'calls',
  'inputTokens',
  'cacheReadTokens',
  'cacheWriteTokens',
  'outputTokens',
  'usd',
  'pricing',
] as const);

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
    outputTokens: breakdown.outputTokens,
    usd: breakdown.totalUsd,
    pricing: {
      provider: priced.provider ?? 'unknown',
      inputPerMTok: priced.inputPerMTok,
      outputPerMTok: priced.outputPerMTok,
      reviewedOn: PROVIDER_REVIEWED[priced.provider ?? ''] ?? null,
    },
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
