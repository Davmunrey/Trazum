import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BUNDLED_CATALOGUE, profileUsage, spendByMonth } from '../dist/index.js';

/**
 * `spendByMonth`: a bill by calendar month, one implementation for the
 * terminal, the bill's documents and the browser.
 *
 * The log: Sonnet 5.5 calls of 1,000,000 input tokens, $2.00 each at $2 per
 * million, placed on month edges, so that a month boundary drawn in a local
 * zone or off by a day moves a call and the arithmetic says so.
 */

const call = (ts, model = 'claude-sonnet-5-5') =>
  JSON.stringify({ ...(ts ? { ts } : {}), model, usage: { input_tokens: 1_000_000, output_tokens: 0 } });
const profile = (lines) => profileUsage(lines.join('\n'), { catalogue: BUNDLED_CATALOGUE });

describe('a bill by calendar month', () => {
  it('puts each call in its UTC month, oldest first, with the days that bill it alone', () => {
    const { months, undated } = spendByMonth(
      profile([
        call('2026-10-01T00:00:00Z'),
        call('2026-09-30T23:59:59Z'),
        call('2026-02-28T12:00:00Z'),
        call('2026-10-31T23:59:59Z'),
      ]),
    );
    assert.deepEqual(
      months.map(({ month, firstDay, lastDay, calls }) => [month, firstDay, lastDay, calls]),
      [
        ['2026-02', '2026-02-01', '2026-02-28', 1],
        ['2026-09', '2026-09-01', '2026-09-30', 1],
        ['2026-10', '2026-10-01', '2026-10-31', 2],
      ],
    );
    assert.ok(Math.abs(months[2].usd - 4) < 1e-9, `October ${months[2].usd}`);
    assert.deepEqual(undated, { calls: 0, usd: 0 });
  });

  it('knows a leap February from a common one', () => {
    const { months } = spendByMonth(profile([call('2028-02-29T08:00:00Z')]));
    assert.equal(months[0].lastDay, '2028-02-29');
  });

  it('says what sits in no month, so the rows and the total reconcile', () => {
    const report = profile([call('2026-09-15T00:00:00Z'), call('2026-10-15T00:00:00Z'), call(null)]);
    const { months, undated } = spendByMonth(report);
    assert.equal(undated.calls, 1);
    assert.ok(Math.abs(undated.usd - 2) < 1e-9, `undated ${undated.usd}`);
    const rows = months.reduce((sum, month) => sum + month.usd, 0);
    assert.ok(Math.abs(rows + undated.usd - report.total.totalUsd) < 1e-9, 'months plus undated is not the total');
    assert.equal(months.reduce((sum, month) => sum + month.calls, 0) + undated.calls, report.total.calls);
  });

  it('never counts an unpriced call as undated, because the total never held it', () => {
    const report = profile([call('2026-09-15T00:00:00Z'), call('2026-10-15T00:00:00Z', 'a-model-nobody-prices')]);
    assert.equal(report.unpriced.calls, 1);
    assert.deepEqual(spendByMonth(report).undated, { calls: 0, usd: 0 });
  });

  it('has no months for a log with no clock, and the whole total as undated', () => {
    const report = profile([call(null), call(null)]);
    const { months, undated } = spendByMonth(report);
    assert.deepEqual(months, []);
    assert.equal(undated.calls, 2);
    assert.ok(Math.abs(undated.usd - report.total.totalUsd) < 1e-9);
  });

  it('is empty, not an error, on an empty log', () => {
    assert.deepEqual(spendByMonth(profile([])), { months: [], undated: { calls: 0, usd: 0 } });
  });
});
