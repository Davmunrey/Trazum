import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { computeSavings, formatSignedUsd, formatUsd } from '../dist/index.js';

/**
 * The monthly figures of a saving, and where a dollar amount changes format.
 *
 * Mutation testing (#690) left 22 of `savings.ts`'s 62 mutants alive on
 * 2026-11-17. Three groups, none of them held by a test until this file:
 *
 *   - a month's input and output cost could be the call's cost *divided* by
 *     the calls in a month, as long as the total was right;
 *   - the percentage saved could be a hundredth of itself, or not a number at
 *     all for a prompt that costs nothing;
 *   - every threshold at which `formatUsd` changes precision could move.
 *
 * Hand arithmetic on Claude Opus 5 as bundled for the date below: $5 per
 * million input tokens, $25 per million output.
 */

const ON = new Date('2026-08-18T00:00:00Z');
const usage = (over = {}) => ({
  model: 'claude-opus-5',
  callsPerMonth: 1000,
  avgOutputTokens: 1_000_000,
  cacheHitRate: 0,
  batchEligible: false,
  ...over,
});

describe('a month is the call, times the calls in a month, part by part', () => {
  // A million tokens in before, half a million after, a million out each time.
  const report = computeSavings(1_000_000, 500_000, usage(), ON);

  it('prices one call: $5.00 in and $25.00 out before, $2.50 in after', () => {
    assert.deepEqual(report.perCall.before, { inputUsd: 5, outputUsd: 25, totalUsd: 30 });
    assert.deepEqual(report.perCall.after, { inputUsd: 2.5, outputUsd: 25, totalUsd: 27.5 });
  });

  it('multiplies the input, the output and the total by a thousand calls', () => {
    assert.deepEqual(report.perMonth.before, { inputUsd: 5000, outputUsd: 25000, totalUsd: 30000 });
    assert.deepEqual(report.perMonth.after, { inputUsd: 2500, outputUsd: 25000, totalUsd: 27500 });
  });

  it('keeps each month\'s parts adding up to its total', () => {
    for (const month of [report.perMonth.before, report.perMonth.after]) {
      assert.equal(month.inputUsd + month.outputUsd, month.totalUsd);
    }
  });

  it('reports the saving in dollars and as a share of the month before', () => {
    assert.equal(report.monthlySavingsUsd, 2500);
    // $2,500 of $30,000.
    assert.ok(Math.abs(report.monthlySavingsPct - 100 / 12) < 1e-9, String(report.monthlySavingsPct));
  });
});

describe('the percentage saved is a percentage, whatever the bill', () => {
  it('is 50 for a prompt cut in half on a bill of half a cent', () => {
    // A thousand tokens, once a month, no output: $0.005 before. A share of a
    // small bill is still a share of it.
    const report = computeSavings(1000, 500, usage({ callsPerMonth: 1, avgOutputTokens: 0 }), ON);
    assert.ok(Math.abs(report.perMonth.before.totalUsd - 0.005) < 1e-12);
    assert.ok(Math.abs(report.monthlySavingsPct - 50) < 1e-9, String(report.monthlySavingsPct));
  });

  it('is 0, and a number, when nothing is spent', () => {
    const report = computeSavings(0, 0, usage({ avgOutputTokens: 0 }), ON);
    assert.equal(report.perMonth.before.totalUsd, 0);
    assert.equal(report.monthlySavingsPct, 0);
  });
});

describe('a dollar amount is printed with the precision its size needs', () => {
  it('prints nothing owed as $0, and one dollar as a dollar', () => {
    assert.equal(formatUsd(0), '$0');
    assert.equal(formatUsd(1), '$1.00');
  });

  it('gives five decimals under a cent', () => {
    assert.equal(formatUsd(0.005), '$0.00500');
    assert.equal(formatUsd(0.0099), '$0.00990');
  });

  it('gives four decimals from a cent up to a dollar', () => {
    assert.equal(formatUsd(0.01), '$0.0100');
    assert.equal(formatUsd(0.5), '$0.5000');
    assert.equal(formatUsd(0.9999), '$0.9999');
  });

  it('gives two decimals from a dollar up to a thousand', () => {
    assert.equal(formatUsd(1), '$1.00');
    assert.equal(formatUsd(1.5), '$1.50');
    assert.equal(formatUsd(999.4), '$999.40');
  });

  it('gives whole dollars with separators from a thousand', () => {
    assert.equal(formatUsd(1234.56), '$1,235');
    assert.equal(formatUsd(1_000_000), '$1,000,000');
  });
});

describe('a signed amount puts the sign where a reader looks for it', () => {
  it('marks a gain under a dollar as a gain', () => {
    assert.equal(formatSignedUsd(0.5), '+$0.5000');
    assert.equal(formatSignedUsd(0.004), '+$0.00400');
  });

  it('marks a loss, and leaves nothing unsigned', () => {
    assert.equal(formatSignedUsd(-0.5), '-$0.5000');
    assert.equal(formatSignedUsd(0), '$0');
  });
});
