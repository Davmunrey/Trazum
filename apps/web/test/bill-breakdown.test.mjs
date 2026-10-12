import assert from 'node:assert/strict';
import { it } from 'node:test';
import { readFileSync } from 'node:fs';
import { BUNDLED_CATALOGUE, profileUsage } from '@trazum/core';
import { billBreakdownRows } from '../lib/bill-breakdown.ts';

it('keeps unpriced model cost unknown and a priced zero genuinely zero', () => {
  const report = profileUsage([
    { model: 'synthetic-unpriced', input_tokens: 100, label: 'unknown' },
    { model: 'claude-opus-5', input_tokens: 0, output_tokens: 0, label: 'zero' },
    { model: 'claude-sonnet-5', input_tokens: 100, label: 'priced' },
  ].map((row) => JSON.stringify(row)).join('\n'), { catalogue: BUNDLED_CATALOGUE });
  const models = billBreakdownRows(report, 'model');
  assert.equal(models.find(({ key }) => key === 'synthetic-unpriced').priced, false);
  const zero = models.find(({ key }) => key === 'claude-opus-5');
  assert.equal(zero.priced, true);
  assert.equal(zero.breakdown.totalUsd, 0);
  const labels = billBreakdownRows(report, 'label');
  assert.equal(labels.find(({ key }) => key === 'zero').priced, true);
  // Unknown labels are omitted by today's core; if included in a report, no
  // priced model backs them, so they must still not be formatted as free.
  const unknown = models.find(({ key }) => key === 'synthetic-unpriced');
  report.byLabel.push({ label: 'unknown', breakdown: unknown.breakdown });
  assert.equal(billBreakdownRows(report, 'label').find(({ key }) => key === 'unknown').priced, false);
});

it('uses the price-availability flag for both dollar and percentage cells', () => {
  const source = readFileSync(new URL('../components/Bill.tsx', import.meta.url), 'utf8');
  assert.match(source, /row\.priced \? formatUsd\(row\.breakdown\.totalUsd\) : t\.bill\.priceUnknown/);
  assert.match(source, /row\.priced \? pct\([\s\S]*?\) : t\.bill\.priceUnknown/);
});
