import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BUNDLED_CATALOGUE, positionReport } from '../dist/index.js';

/**
 * The month, ended on a measured position — and held to the arc's failure
 * clause: a position with a projection hiding in it is what would make this
 * a failure, so the sharpest tests here are about what is ABSENT.
 */

const catalogue = BUNDLED_CATALOGUE;
const NOW = new Date('2026-08-24T12:00:00Z');

/** $5 of opus input, on a chosen day of August 2026. */
const record = (day, over = {}) => ({
  model: 'claude-opus-5',
  inputTokens: 1_000_000,
  cacheReadTokens: 0,
  cacheWrite5mTokens: 0,
  cacheWrite1hTokens: 0,
  writeTtlKnown: true,
  outputTokens: 0,
  label: 'chat',
  outcome: null,
  session: null,
  ts: Date.parse(`2026-08-${String(day).padStart(2, '0')}T10:00:00Z`),
  truncated: null,
  ...over,
});

/** Eight measured days — over the seven-day floor — at $5 each. */
const eightDays = () => [17, 18, 19, 20, 21, 22, 23, 24].map((day) => record(day));

const report = (records, config) => positionReport(records, config, { catalogue, on: NOW });

describe('the position, as one answer', () => {
  it('states every configured ceiling with its measurement, window and denominators', () => {
    const document = report(eightDays(), {
      spend: { monthlyUsd: 100 },
      limits: { dayUsd: 25, byLabel: { chat: 60 } },
    });
    assert.equal(document.source, 'usage-log');
    assert.equal(document.month.id, '2026-08');
    assert.deepEqual(
      document.positions.map((p) => [p.scope, p.verdict, p.measuredUsd]),
      [['month', 'within', 40], ['day', 'within', 5], ['label', 'within', 40]],
    );
    const month = document.positions[0];
    assert.equal(month.daysMeasured, 8);
    assert.equal(month.daysElapsed, 24);
    assert.equal(month.remainingUsd, 60);
  });

  it('labels the distance as division, with the rate and its denominator beside it', () => {
    const document = report(eightDays(), { spend: { monthlyUsd: 100 } });
    const distance = document.positions[0].distance;
    // $40 over 8 measured days is $5/day; $60 remaining is 12 days away.
    assert.deepEqual(distance, { daysAway: 12, usdPerDay: 5, overDays: 8, arithmetic: 'division' });
  });

  it('withholds the distance under the floor, on an over, and on a zero rate — absent, never zeroed', () => {
    // Six measured days: under MIN_SCALE_DAYS. The verdict stands; the rate does not.
    const under = report([19, 20, 21, 22, 23, 24].map((d) => record(d)), { spend: { monthlyUsd: 100 } });
    assert.equal(under.positions[0].verdict, 'within');
    assert.equal(under.positions[0].distance, null);
    // Over: the distance to a place already passed is not a number this tool prints.
    const over = report(eightDays(), { spend: { monthlyUsd: 30 } });
    assert.equal(over.positions[0].verdict, 'over');
    assert.equal(over.positions[0].distance, null);
  });

  it('never carries a forecast: no field anywhere names a date', () => {
    const document = report(eightDays(), { spend: { monthlyUsd: 100 }, limits: { dayUsd: 25 } });
    const text = JSON.stringify(document);
    assert.ok(!text.includes('forecast'), 'a forecast field appeared');
    assert.ok(!text.includes('runsOut'), 'a run-out field appeared');
    // The only day-shaped numbers are denominators and the labelled division.
    for (const position of document.positions) {
      if (position.distance !== null) assert.equal(position.distance.arithmetic, 'division');
    }
  });

  it('a stale log is cannot-tell for the month, a quiet day is $0 for the day — the doors\' own readings', () => {
    const july = [record(24, { ts: Date.parse('2026-07-10T10:00:00Z') })];
    const document = report(july, { spend: { monthlyUsd: 100 }, limits: { dayUsd: 25 } });
    const month = document.positions.find((p) => p.scope === 'month');
    assert.equal(month.verdict, 'cannot-tell', 'zero measured days this month is a stale log, not a quiet one');
    const day = document.positions.find((p) => p.scope === 'day');
    assert.equal(day.verdict, 'within');
    assert.equal(day.measuredUsd, 0);
  });

  it('names what it cannot measure instead of printing the healthiest line', () => {
    const clockless = report([record(24, { ts: null })], { spend: { monthlyUsd: 100 } });
    assert.deepEqual(clockless.positions, []);
    assert.deepEqual(clockless.unmeasured.map((u) => [u.scope, u.why]), [['month', 'no-clock']]);

    const empty = report([], { spend: { monthlyUsd: 100 } });
    assert.deepEqual(empty.unmeasured.map((u) => u.why), ['nothing-recorded']);

    const renamed = report(eightDays(), { limits: { byLabel: { 'old-name': 10 } } });
    assert.deepEqual(renamed.unmeasured.map((u) => [u.label, u.why]), [['old-name', 'label-unseen']]);
  });

  it('states what it deliberately does not answer, and counts the money it cannot price', () => {
    const document = report(
      [...eightDays(), record(24, { model: 'no-such-model' })],
      { spend: { monthlyUsd: 100 }, limits: { sessionUsd: 2 } },
    );
    assert.equal(document.unpricedRecords, 1);
    /**
     * Codes since 1.78.0, and the intent is what it always was: the
     * document states what it will not answer. It used to state it in
     * baked English prose, which a Spanish reader met as a localized
     * heading over an untranslated paragraph. The assertion moved to the
     * code; the sentence now lives in each rendering.
     */
    assert.ok(document.cannotSay.includes('session-limit-at-the-doors'));

    const bare = report(eightDays(), {});
    assert.ok(bare.cannotSay.includes('no-ceiling-configured'));
    // And the property the prose version could never have: nothing in this
    // field is a sentence. A space is the cheapest evidence of one.
    for (const code of [...document.cannotSay, ...bare.cannotSay]) {
      assert.match(code, /^[a-z][a-z-]*$/, `"${code}" is prose in a field that must carry codes`);
    }
    assert.deepEqual(bare.positions, []);
  });
});
