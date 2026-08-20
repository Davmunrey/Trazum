import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BUNDLED_CATALOGUE,
  MIN_COVERAGE_FOR_RATE,
  MIN_OUTCOMES_FOR_RATE,
  perOutcome,
  profileUsage,
  rankPerOutcome,
} from '../dist/index.js';

/**
 * Dollars per outcome.
 *
 * Almost every test here is about *not* doing the division. A cost per
 * resolution is the most quotable number this product will ever print — it
 * ends up in a slide and in an argument about whether to keep a feature — and
 * every way of getting it slightly wrong is a way of getting somebody's
 * decision badly wrong.
 */

const ON = new Date('2026-08-16T00:00:00Z');
const VOCAB = { values: ['resolved', 'escalated'], success: ['resolved'] };

const profile = (records) =>
  profileUsage(records.map((r) => JSON.stringify(r)).join('\n'), {
    catalogue: BUNDLED_CATALOGUE,
    on: ON,
  });

/** One $1.00 call on Opus (200k in), carrying `outcome` under `label`. */
const call = (outcome, label = 'support') => ({
  model: 'claude-opus-5',
  label,
  ...(outcome === null ? {} : { outcome }),
  usage: { input_tokens: 200_000, output_tokens: 0 },
});

const times = (n, ...args) => Array.from({ length: n }, () => call(...args));

const of = (records, vocabulary = VOCAB) => {
  const report = profile(records);
  return perOutcome(report.outcomeTally, report.total.totalUsd, vocabulary);
};

describe('perOutcome — which bill is the numerator', () => {
  it('divides recorded spend, never the whole bill', () => {
    /**
     * The decision this chapter exists to make, and the one that is wrong in
     * the obvious implementation. Ten resolved calls at $1.00 and ten calls
     * with no outcome: the honest figure is $1.00 a resolution, and dividing
     * the whole $20 bill would say $2.00 — twice the truth, silently, in the
     * direction that gets a working feature killed.
     */
    const result = of([...times(10, 'resolved'), ...times(10, null)]);
    // Coverage is 50%, below the floor, so the rate is withheld — but the
    // numerator it *would* have used is the recorded half, and that is what
    // the coverage figure is computed from.
    assert.ok(Math.abs(result.recordedUsd - 10) < 1e-9);
    assert.ok(Math.abs(result.totalUsd - 20) < 1e-9);
    assert.ok(Math.abs(result.coverage - 0.5) < 1e-9);
  });

  it('states the rate when coverage and count both clear their floors', () => {
    // Twelve resolved and one escalated: 13 recorded of 13 calls, and $13 of
    // recorded spend over 12 successes.
    const result = of([...times(12, 'resolved'), ...times(1, 'escalated')]);
    assert.equal(result.withheld, null);
    assert.ok(Math.abs(result.usdPerSuccess - 13 / 12) < 1e-9);
    assert.equal(result.coverage, 1);
  });

  it('leaves an undeclared value out of both halves', () => {
    // A typo in an exporter is a broken exporter, not a result — the same rule
    // the success rate has.
    const result = of([...times(10, 'resolved'), ...times(5, 'resolvd')]);
    assert.ok(Math.abs(result.recordedUsd - 10) < 1e-9);
    assert.equal(result.successes, 10);
  });
});

describe('perOutcome — the refusals', () => {
  it('withholds a rate below the outcome floor, and shows the count', () => {
    const result = of(times(MIN_OUTCOMES_FOR_RATE - 1, 'resolved'));
    assert.equal(result.usdPerSuccess, null);
    assert.equal(result.withheld, 'too-few-outcomes');
    assert.equal(result.successes, MIN_OUTCOMES_FOR_RATE - 1);
  });

  it('withholds a rate below the coverage floor, and shows the coverage', () => {
    // Twenty resolved, ten unrecorded: the count clears easily and two thirds
    // coverage does not. A ratio over an unknown denominator.
    const result = of([...times(20, 'resolved'), ...times(10, null)]);
    assert.equal(result.withheld, 'too-little-coverage');
    assert.ok(result.coverage < MIN_COVERAGE_FOR_RATE);
  });

  it('reports money spent with nothing resolved as exactly that', () => {
    /**
     * Not a division by zero dressed up as a figure, and not an omission
     * either — a slice that spent money and resolved nothing is the most
     * alarming thing this report can find.
     */
    const result = of(times(20, 'escalated'));
    assert.equal(result.usdPerSuccess, null);
    assert.equal(result.withheld, 'no-successes-recorded');
    assert.ok(result.recordedUsd > 0);
  });

  it('withholds without a vocabulary rather than guessing one', () => {
    assert.equal(of(times(20, 'resolved'), null).withheld, 'no-vocabulary');
    assert.equal(
      of(times(20, 'resolved'), { values: ['resolved'], success: [] }).withheld,
      'no-vocabulary',
    );
  });

  it('separates nothing recorded from nothing successful', () => {
    // Two different sentences, and a reader acts on them differently: one is
    // "instrument this", the other is "something is very wrong".
    assert.equal(of(times(20, null)).withheld, 'nothing-recorded');
    assert.equal(of(times(20, 'escalated')).withheld, 'no-successes-recorded');
  });
});

describe('rankPerOutcome — two orders, and the product prints both', () => {
  const sliceOf = (records) => {
    const report = profile(records);
    return report.outcomeTallyByLabel.map((entry) => ({
      key: entry.label,
      calls: entry.calls,
      totalUsd: entry.totalUsd,
      tally: entry.tally,
    }));
  };

  it('finds the workload that is cheap per call and dear per outcome', () => {
    /**
     * The finding a total cannot make. `cheap` runs many small calls and
     * resolves almost none of them; `dear` runs expensive calls that work.
     * Ranked by cost per call, `dear` is the problem. Ranked by cost per
     * resolution, it is the opposite — and somebody optimising on the first
     * number has been moving the wrong one.
     */
    const cheap = [
      ...Array.from({ length: 10 }, () => ({
        model: 'claude-opus-5',
        label: 'cheap',
        outcome: 'resolved',
        usage: { input_tokens: 20_000, output_tokens: 0 },
      })),
      ...Array.from({ length: 190 }, () => ({
        model: 'claude-opus-5',
        label: 'cheap',
        outcome: 'escalated',
        usage: { input_tokens: 20_000, output_tokens: 0 },
      })),
    ];
    const dear = Array.from({ length: 20 }, () => ({
      model: 'claude-opus-5',
      label: 'dear',
      outcome: 'resolved',
      usage: { input_tokens: 200_000, output_tokens: 0 },
    }));

    const ranking = rankPerOutcome(sliceOf([...cheap, ...dear]), VOCAB);

    // Per call, `dear` is ten times `cheap`.
    assert.equal(ranking.byCall[0].key, 'dear');
    // 200 calls at $0.10 is $20.00 over 10 resolutions: $2.00 each. `dear` is
    // 20 calls at $1.00 over 20 resolutions: $1.00 each. The order flips.
    assert.equal(ranking.byOutcome[0].key, 'cheap');
    assert.ok(Math.abs(ranking.byOutcome[0].per.usdPerSuccess - 2) < 1e-9);
    assert.ok(Math.abs(ranking.byOutcome[1].per.usdPerSuccess - 1) < 1e-9);
    /**
     * And the disagreement is reported. A complete reversal of a two-slice
     * ranking is a distance of exactly one, which a distance threshold alone
     * would have called noise — it is the sharpest case there is.
     */
    assert.deepEqual(
      ranking.disagreements.map((d) => [d.slice.key, d.callRank, d.outcomeRank]),
      [
        ['cheap', 1, 0],
        ['dear', 0, 1],
      ],
    );
  });

  it('keeps a withheld slice out of the outcome order entirely', () => {
    /**
     * A withheld figure has no position in an order. Giving it one would place
     * a slice somewhere on the strength of a number this module declined to
     * state, which is worse than leaving it out — the reader sees a rank and
     * assumes a rate.
     */
    const ranking = rankPerOutcome(
      sliceOf([...times(20, 'resolved', 'good'), ...times(3, 'resolved', 'thin')]),
      VOCAB,
    );
    assert.deepEqual(ranking.byCall.map((s) => s.key).sort(), ['good', 'thin']);
    assert.deepEqual(ranking.byOutcome.map((s) => s.key), ['good']);
  });

  it('never reports a disagreement produced by the two lists being different lengths', () => {
    /**
     * The artefact this guards against: with ten slices ranked by call and
     * three by outcome, comparing raw positions reports a disagreement for
     * every rankable slice. The comparison is against position among the
     * rankable slices only.
     */
    const records = [];
    for (let i = 0; i < 8; i += 1) records.push(...times(2, 'resolved', `thin-${i}`));
    records.push(...times(20, 'resolved', 'a'));
    records.push(...times(20, 'resolved', 'b'));
    const ranking = rankPerOutcome(sliceOf(records), VOCAB);
    assert.equal(ranking.byOutcome.length, 2);
    assert.deepEqual(ranking.disagreements, []);
  });
});

describe('the profile slices the numerator the same way it slices the bill', () => {
  it('tallies per label, with each slice\'s own call count as the denominator', () => {
    const report = profile([
      ...times(3, 'resolved', 'a'),
      ...times(2, null, 'a'),
      ...times(4, 'escalated', 'b'),
    ]);
    const a = report.outcomeTallyByLabel.find((e) => e.label === 'a');
    assert.equal(a.tally.recorded, 3);
    assert.equal(a.tally.parsed, 5, "the slice's own calls, not the log's");
    assert.ok(Math.abs(a.tally.unrecordedUsd - 2) < 1e-9);
  });

  it('tallies per model too', () => {
    const report = profile([
      ...times(3, 'resolved'),
      { model: 'claude-haiku-4-5', label: 'support', outcome: 'escalated', usage: { input_tokens: 200_000, output_tokens: 0 } },
    ]);
    assert.deepEqual(
      report.outcomeTallyByModel.map((e) => e.model).sort(),
      ['claude-haiku-4-5', 'claude-opus-5'],
    );
  });
});
