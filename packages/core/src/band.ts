/**
 * The error band Trazum is entitled to print about a given piece of text.
 *
 * ## Why this exists
 *
 * For a long time every report said `±10%`, everywhere, about everything. That
 * number came from a corpus of twenty-one samples that held **thirteen files of
 * Latin prose and exactly one each of code, numeric and punctuation** — and
 * those single files were the set the estimator's constants had been fitted to.
 * So the published band was not a measurement of the estimator. It was a
 * measurement of its own training set.
 *
 * Seven ordinary samples in the thin classes broke it. Measured against
 * Anthropic's counting endpoint, the same estimator that is 4.6% out on prose
 * is **24.9% out on a SQL migration** and **32.5% out on a CSV ledger**. Telling
 * somebody `±10%` about their ledger was telling them a number that is wrong
 * about their prompt specifically.
 *
 * ## Why it does not name a text type
 *
 * The obvious design is a classifier — prose, code, few-shot, punctuation — and
 * a band per class. The corpus says it cannot be built. Measured by character
 * mix, code and punctuation **overlap completely**: `code-sql` is 7.7% symbols
 * and `code-heavy` 15.6%, while `punctuation-markup` is 17.5% and
 * `punctuation-heavy` 29.7%. Two of the three few-shot samples are
 * indistinguishable from prose. A classifier over those would be a guess
 * wearing a measurement's name, and it would hand out the wrong band precisely
 * where the band matters most.
 *
 * So this does not classify. It sorts text into the **buckets the evidence
 * actually separates**, and where two classes overlap it gives the worse of
 * their bands. An overstated uncertainty costs a reader some confidence; an
 * understated one tells them a wrong number and lets them act on it.
 *
 * ## What holds it
 *
 * `token-band.test.js` runs every corpus sample through `bandFor` and requires
 * the sample's own measured error to be inside the band it was given. That is
 * the whole promise, and it cannot be satisfied by tuning the thresholds: a
 * sample sorted into a friendlier bucket gets a smaller band and fails.
 *
 * The figures below are derived from the fixture by the same test, which fails
 * when they drift. They are written here rather than imported because this file
 * ships and the fixture does not.
 */

/**
 * The buckets, worst measured error first.
 *
 * Every number is `Math.ceil` of the worst sample in that bucket, from
 * `test/fixtures/token-ground-truth.json` — Anthropic's, because that is the
 * tokenizer this estimator was built for and the only one whose fixture governs
 * a published claim. A DeepSeek or Mistral prompt is further out still, and
 * `providerBandCaveat` is what says so.
 */
export const BANDS = {
  /** Digit-dominant: ledgers, tables, exports. The worst the estimator does. */
  numeric: 33,
  /** Symbol-rich: code, markup, anything a merge table covers badly. */
  symbolic: 26,
  /**
   * CJK, all three scripts.
   *
   * Was 10 and is 4, and the difference is the second Korean sample rather than
   * anything in this file. Hangul had been charged a placeholder that nothing
   * measured; one sample moved it to within ten points and two moved it to
   * within three. The class's worst went from 10.6% to 3.2% and its standard
   * deviation from 4.0 to 1.0.
   */
  cjk: 4,
  /**
   * Latin prose and few-shot blocks made of it. What most prompts are.
   *
   * Widened from 5 by `numeric-matrix`, a confusion matrix whose class labels
   * make letters the dominant class: composition put it here, its error came
   * out at 5.6%, and the band follows the measurement rather than the other way
   * round. Eighteen samples, deviation 1.4 points.
   */
  prose: 6,
} as const;

export type BandBucket = keyof typeof BANDS;

/**
 * Where the thresholds come from.
 *
 * Each is the widest gap the corpus offers between the bucket it admits and
 * everything below it, so none of them is a round number somebody liked:
 *
 * - `cjk` at 0.5: the CJK samples are 90.1% to 94.5% CJK and every other sample
 *   is 0.0%. Nothing in the corpus lies between.
 * - `numeric` at 0.30: the two numeric samples are 47.7% and 49.7% digits; the
 *   next highest anywhere is `few-shot-extraction` at 15.3%.
 * - `symbolic` at 0.07: this one is thin and is stated as thin. `code-sql` is
 *   7.7% symbols and `portuguese-prose` is 6.1%, so 1.6 points of margin decide
 *   it. Thin in the safe direction: a prose sample that crosses it is given the
 *   symbolic band, which is wider than it needs, and no sample is given a band
 *   narrower than its own error.
 */
const CJK_SHARE = 0.5;
const DIGIT_SHARE = 0.3;
const SYMBOL_SHARE = 0.07;

const CJK = /[぀-ヿ㐀-䶿一-鿿가-힯豈-﫿]/;
const LETTER = /[A-Za-zÀ-ɏͰ-ϿЀ-ӿ]/;
const DIGIT = /[0-9]/;

/** The bucket a piece of text falls in, by the composition the corpus separates on. */
export function bucketFor(text: string): BandBucket {
  const chars = [...text].filter((ch) => !/\s/.test(ch));
  if (chars.length === 0) return 'prose';

  let cjk = 0;
  let digits = 0;
  let letters = 0;
  for (const ch of chars) {
    if (CJK.test(ch)) cjk += 1;
    else if (DIGIT.test(ch)) digits += 1;
    else if (LETTER.test(ch)) letters += 1;
  }
  const n = chars.length;
  const symbols = n - cjk - digits - letters;

  /*
    Order is the design. CJK first because it is the one bucket with no overlap
    at all, then digits, then symbols — each test only runs on text the previous
    one declined, so a Korean prompt with quotation marks is CJK and not
    symbolic. Reversing any two would let a wide bucket swallow a narrow one and
    hand out a band nobody measured.
  */
  if (cjk / n >= CJK_SHARE) return 'cjk';
  if (digits / n >= DIGIT_SHARE) return 'numeric';
  if (symbols / n >= SYMBOL_SHARE) return 'symbolic';
  return 'prose';
}

/**
 * The band, as a percentage, that may be printed about this text.
 *
 * Never a single number for all text again. A caller that wants one figure for
 * a mixed report should take the widest band across the texts it covers, not an
 * average: averaging two uncertainties produces a third that describes neither.
 */
export function bandFor(text: string): number {
  return BANDS[bucketFor(text)];
}

/**
 * Whether the published band applies to a model at all.
 *
 * It does not, and this is the sentence that has been missing. The estimator is
 * calibrated on Claude's tokenizer, and the same 47 samples measured against
 * DeepSeek's own counter came out **94.5% wrong** at worst and against
 * Mistral's **103.1%**. Trazum prices seven providers; the band is one
 * provider's.
 *
 * Returns null when the model is one the band was measured on, and the provider
 * id otherwise, so a caller can say which foreign tokenizer it is estimating
 * against rather than printing a figure that belongs to a different one.
 */
export function foreignTokenizer(provider: string | null): string | null {
  return provider === null || provider === 'anthropic' ? null : provider;
}

/**
 * The worst error measured against a provider's own tokenizer, where anybody
 * has run it.
 *
 * Two entries, and the emptiness of the rest is the point. `foreignTokenizer`
 * could always say *this is not Claude*; what it could not say is how far off.
 * A hedge with no figure reads as a formality, and a reader discounts it — so
 * where the corpus has been run against the family's own counter, the report
 * says the number, and where it has not, it says nobody has measured rather
 * than borrowing one of these.
 *
 * Every value is the worst of the 47 samples in
 * `test/fixtures/token-ground-truth.<provider>.json`, and
 * `token-band.test.js` recomputes both from the fixtures and fails on drift.
 * Written here rather than imported because this file ships and the fixtures
 * do not.
 */
export const MEASURED_FOREIGN_ERROR_PCT: Readonly<Record<string, number>> = {
  /** Worst on `cjk-chinese`: the estimator's CJK charge is Claude's, not this one's. */
  deepseek: 94.5,
  /** Worst on `german-technical`, where even Latin prose is more than twice out. */
  mistral: 103.1,
};

/**
 * How far out the estimator has been measured against this provider, or null.
 *
 * Null means unmeasured, never zero: a family nobody has run is an open
 * question, and answering it with a number would be the exact fault this whole
 * file exists to undo.
 */
export function measuredForeignError(provider: string | null): number | null {
  if (provider === null) return null;
  return MEASURED_FOREIGN_ERROR_PCT[provider] ?? null;
}
