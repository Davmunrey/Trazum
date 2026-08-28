import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { annualRecord, conform } from '../dist/index.js';

/**
 * The year, assembled from what was already written down.
 *
 * An annual report is the document most likely to be quoted out of the room it
 * was written in, and the one nobody goes back to verify. So the tests are
 * about what it refuses to say.
 *
 * Doctrine: [Report the record, not the team](../../../docs/doctrine.md#report-the-record-not-the-team)
 */

const period = (month, usd, over = {}) => ({ month, usd, calls: Math.round(usd), ...over });
const plan = (actions, projectedSavingUsd) => ({
  actions: Array.from({ length: actions }, (_, i) => ({ kind: 'route', label: `a${i}` })),
  projectedSavingUsd,
});
const verification = (arrived, notArrived, cannotTell) => ({
  actions: [],
  arrived,
  notArrived,
  cannotTell,
});

describe('four questions, and the fourth is the one that matters', () => {
  it('keeps the three outcomes apart across the whole year', () => {
    /**
     * "Eleven of fourteen actions arrived" reads better than "eleven arrived,
     * one did not, and two could not be judged" — and the second sentence is
     * the one that tells somebody their measurement has a hole in it.
     */
    const record = annualRecord('2026', [
      period('2026-01', 100, { plan: plan(7, 500), verification: verification(5, 1, 1) }),
      period('2026-02', 100, { plan: plan(7, 400), verification: verification(6, 0, 1) }),
    ]);
    assert.deepEqual(
      { ...record.promises },
      { planned: 14, arrived: 11, notArrived: 1, cannotTell: 2, projectedUsd: 900 },
    );
  });

  it('names the months it does not have rather than filling them', () => {
    // A year report that quietly covers two months and prints an annual total
    // is wrong by five sixths and says nothing about it.
    const record = annualRecord('2026', [period('2026-01', 100), period('2026-02', 100)]);
    assert.equal(record.missingMonths.length, 10);
    assert.equal(record.missingMonths[0], '2026-03');
    assert.ok(record.cannotSay.includes('months-missing'));
  });

  it('ignores months from another year rather than counting them', () => {
    const record = annualRecord('2026', [period('2025-12', 999), period('2026-01', 100)]);
    assert.equal(record.totalUsd, 100);
  });
});

describe('it refuses to put a figure on what arrived', () => {
  it('has no arrivedUsd at all, and says why in cannotSay', () => {
    /**
     * A verification says whether each action arrived; it has never carried a
     * per-action dollar figure for the saving that landed. Summing one out of
     * the observations would mean deciding which of several numbers is "the
     * saving" — a judgement the verification refused to make.
     *
     * Assembling a plausible number here is precisely the annual-report
     * arithmetic this document exists to replace.
     */
    const record = annualRecord('2026', [
      period('2026-01', 100, { plan: plan(3, 500), verification: verification(3, 0, 0) }),
    ]);
    assert.equal(record.promises.arrivedUsd, undefined);
    assert.equal(record.promises.projectedUsd, 500);
    assert.ok(record.cannotSay.includes('arrived-savings-not-quantified'));
  });

  it('says when nothing was planned, and when nothing was verified', () => {
    // Two different holes, and a reader acts on them differently.
    const nothing = annualRecord('2026', [period('2026-01', 100)]);
    assert.ok(nothing.cannotSay.includes('nothing-was-planned'));

    const unverified = annualRecord('2026', [period('2026-01', 100, { plan: plan(3, 500) })]);
    assert.ok(unverified.cannotSay.includes('nothing-was-verified'));
    assert.ok(!unverified.cannotSay.includes('nothing-was-planned'));
  });

  it('flags a year with unjudgeable promises in it', () => {
    const record = annualRecord('2026', [
      period('2026-01', 100, { plan: plan(3, 500), verification: verification(1, 0, 2) }),
    ]);
    assert.ok(record.cannotSay.includes('some-promises-unjudgeable'));
  });

  it('reports outcomes as null rather than a rate of zero', () => {
    // An uninstrumented year and a failing year are different sentences.
    const record = annualRecord('2026', [period('2026-01', 100)]);
    assert.equal(record.outcomes, null);
    assert.ok(record.cannotSay.includes('no-outcomes-recorded'));
  });

  it('flags partial outcome coverage', () => {
    const outcomes = { coverage: { recorded: 40, parsed: 100, unrecordedUsd: 60 } };
    const record = annualRecord('2026', [period('2026-01', 100, { outcomes })]);
    assert.deepEqual(record.outcomes, { recorded: 40, parsed: 100, unrecordedUsd: 60 });
    assert.ok(record.cannotSay.includes('outcome-coverage-partial'));
  });
});

describe('it reports the record, not the team', () => {
  it('holds nothing that could name a person', () => {
    /**
     * The doctrine rule from 1.44, and it matters most here: an annual
     * document is exactly where a cost tool starts being used for performance
     * review, and the way to not be is to hold no data that could be.
     */
    const record = annualRecord('2026', [
      period('2026-01', 100, { plan: plan(3, 500), verification: verification(3, 0, 0) }),
    ]);
    const serialised = JSON.stringify(record);
    for (const forbidden of ['author', 'owner', 'user', 'who', 'commit', 'email']) {
      assert.doesNotMatch(serialised, new RegExp(forbidden, 'i'), `the record carries "${forbidden}"`);
    }
  });
});

describe('the standard carries its refusals', () => {
  it('recognises an annual record and an outcome report', () => {
    const record = annualRecord('2026', [period('2026-01', 100)]);
    assert.equal(conform(JSON.stringify(record)).contract, 'annual-record');

    const outcome = {
      slices: [],
      undeclared: [],
      coverage: { recorded: 0, parsed: 10, unrecordedUsd: 5 },
      successShareOfRecordedUsd: null,
      noRate: 'nothing-recorded',
    };
    assert.equal(conform(JSON.stringify(outcome)).contract, 'outcome-report');
  });

  it('tells another tool that a rate of zero is not an absence', () => {
    /**
     * The standard is only worth something if its refusals travel with it. A
     * format that carried the fields and lost the refusals would be worse than
     * no format, because it would look interoperable.
     */
    const wrong = {
      slices: [],
      undeclared: [],
      coverage: { recorded: 0, parsed: 10, unrecordedUsd: 5 },
      successShareOfRecordedUsd: 0,
      noRate: null,
    };
    const report = conform(JSON.stringify(wrong));
    assert.equal(report.contract, 'outcome-report');
    const problem = report.problems.find((p) => p.at === 'successShareOfRecordedUsd');
    assert.ok(problem, 'the zero was not caught');
    assert.equal(problem.kind, 'absence-as-zero');
  });

  it('requires the reason beside a missing rate', () => {
    const bare = {
      slices: [],
      undeclared: [],
      coverage: { recorded: 0, parsed: 10, unrecordedUsd: 5 },
      successShareOfRecordedUsd: null,
    };
    const report = conform(JSON.stringify(bare));
    assert.ok(report.problems.some((p) => p.at === 'noRate' && p.kind === 'missing'));
  });

  it('requires undeclared values to have their own list', () => {
    // Folded into the failures they would move a success rate, which is a
    // product regression reported for a broken exporter.
    const merged = {
      slices: [],
      coverage: { recorded: 5, parsed: 10, unrecordedUsd: 5 },
      successShareOfRecordedUsd: 0.5,
      noRate: null,
    };
    // With no `undeclared` array it is not recognised as this contract at all,
    // which is the strongest possible statement that the field is not optional.
    assert.notEqual(conform(JSON.stringify(merged)).contract, 'outcome-report');
  });
});
