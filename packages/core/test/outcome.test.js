import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BUNDLED_CATALOGUE,
  judgeOutcome,
  outcomeReport,
  profileUsage,
} from '../dist/index.js';

/**
 * The counterpart every figure in this product has been missing.
 *
 * The tests that matter here are the ones about what this module *refuses* to
 * conclude. Anything can compute a success rate; the work is in never
 * computing one from a guess, never letting "nobody told me" and "it failed"
 * come out as the same number, and never deciding on somebody's behalf which
 * of their words means success.
 */

const ON = new Date('2026-08-16T00:00:00Z');

const profile = (records) =>
  profileUsage(records.map((r) => JSON.stringify(r)).join('\n'), {
    catalogue: BUNDLED_CATALOGUE,
    on: ON,
  });

/** One call on Opus with `usd`-worth of input, carrying `outcome`. */
const call = (outcome, inputTokens = 200_000) => ({
  model: 'claude-opus-5',
  label: 'support',
  ...(outcome === undefined ? {} : { outcome }),
  usage: { input_tokens: inputTokens, output_tokens: 0 },
});

const VOCAB = { values: ['resolved', 'escalated', 'abandoned'], success: ['resolved'] };

describe('judgeOutcome — three answers, never two', () => {
  it('separates a declared success, a declared non-success, and a value nobody declared', () => {
    assert.equal(judgeOutcome('resolved', VOCAB), 'success');
    assert.equal(judgeOutcome('escalated', VOCAB), 'other');
    assert.equal(judgeOutcome('resolvd', VOCAB), 'undeclared');
  });

  it('returns null for a call that recorded nothing, which is not a verdict', () => {
    // Not-recorded is not not-happened, and it is certainly not a failure.
    assert.equal(judgeOutcome(null, VOCAB), null);
  });
});

describe('the profile tallies outcomes without judging them', () => {
  it('reads the field from either spelling', () => {
    // `outcome` in a log somebody wrote for this, `trazum_outcome` where a
    // namespace was wanted. A field nobody sets measures nothing.
    const report = profile([
      call('resolved'),
      { ...call(undefined), trazum_outcome: 'escalated' },
    ]);
    assert.deepEqual(
      report.outcomeTally.byValue.map((v) => v.value).sort(),
      ['escalated', 'resolved'],
    );
  });

  it('counts what carried one and what it all cost', () => {
    const report = profile([call('resolved'), call('resolved'), call('escalated'), call(undefined)]);
    assert.equal(report.outcomeTally.recorded, 3);
    assert.equal(report.outcomeTally.parsed, 4);
    // 200k Opus input is $1.00 a call, so the one unrecorded call is $1.00.
    assert.ok(Math.abs(report.outcomeTally.unrecordedUsd - 1) < 1e-9);
    assert.equal(report.fieldCoverage.outcome, 3);
  });

  it('is an aggregate and never a list of calls', () => {
    // The privacy line does not move: counting outcomes never means keeping
    // calls, the same shape the store has had since 1.42.
    const report = profile([call('resolved'), call('resolved')]);
    const [entry] = report.outcomeTally.byValue;
    assert.deepEqual(Object.keys(entry).sort(), ['calls', 'usd', 'value']);
  });

  it('tallies from the same per-record dollar as the bill it is a share of', () => {
    const report = profile([call('resolved'), call('escalated')]);
    const tallied = report.outcomeTally.byValue.reduce((sum, v) => sum + v.usd, 0);
    assert.ok(
      Math.abs(tallied + report.outcomeTally.unrecordedUsd - report.total.totalUsd) < 1e-9,
      'the outcome tally and the total must be one arithmetic, not two that drifted',
    );
  });
});

describe('outcomeReport — the rate, and every reason there is not one', () => {
  const reportOf = (records, vocabulary = VOCAB) =>
    outcomeReport(profile(records).outcomeTally, vocabulary);

  it('states the rate by spend, not by call', () => {
    /**
     * The two figures diverge exactly when it matters. A rate weighted by call
     * count reads well while the expensive half of the traffic fails, which is
     * the case somebody needs to see.
     */
    const report = reportOf([
      call('resolved', 100_000), // $0.50
      call('escalated', 300_000), // $1.50
    ]);
    // One of two calls succeeded, but only a quarter of the money did.
    assert.ok(Math.abs(report.successShareOfRecordedUsd - 0.25) < 1e-9);
  });

  it('returns null and says why when nothing was recorded — never zero', () => {
    /**
     * A rate of zero is a real and terrible measurement. A tool that spells
     * "nobody told me" the same way has destroyed the difference between a
     * product that is failing and a product nobody instrumented.
     */
    const report = reportOf([call(undefined), call(undefined)]);
    assert.equal(report.successShareOfRecordedUsd, null);
    assert.equal(report.noRate, 'nothing-recorded');
  });

  it('returns null when the vocabulary declares no successes', () => {
    const report = reportOf([call('escalated')], { values: ['escalated'], success: [] });
    assert.equal(report.successShareOfRecordedUsd, null);
    assert.equal(report.noRate, 'no-success-values-declared');
  });

  it('names an undeclared value rather than bucketing it', () => {
    /**
     * A misspelled `resolvd` is a broken exporter. Folding it into the failure
     * side would report a product regression that never happened — the
     * direction that gets somebody paged at four in the morning.
     */
    const report = reportOf([call('resolved'), call('resolvd')]);
    assert.deepEqual(report.undeclared.map((s) => s.value), ['resolvd']);
    assert.equal(report.slices.length, 1);
    // And it is out of both halves of the rate, not counted as a failure.
    assert.equal(report.successShareOfRecordedUsd, 1);
  });

  it('treats every value as undeclared when no vocabulary exists', () => {
    // Somebody has been writing outcomes into a log the config never
    // described: this tool knows what happened and not what any of it means.
    const report = reportOf([call('resolved')], null);
    assert.deepEqual(report.undeclared.map((s) => s.value), ['resolved']);
    assert.equal(report.noRate, 'no-success-values-declared');
  });

  it('carries the unrecorded spend, so a rate is never read as covering the bill', () => {
    /**
     * The figure that decides whether the rate means anything. A rate over
     * eight per cent of the bill is a rate about eight per cent of the bill,
     * and printing it beside the total without this is how a sample becomes a
     * claim about the whole.
     */
    const report = reportOf([call('resolved'), call(undefined), call(undefined)]);
    assert.equal(report.coverage.recorded, 1);
    assert.equal(report.coverage.parsed, 3);
    assert.ok(Math.abs(report.coverage.unrecordedUsd - 2) < 1e-9);
  });

  it('ranks by money, because that is what there is to act on', () => {
    const report = reportOf([call('escalated', 400_000), call('resolved', 100_000)]);
    assert.deepEqual(report.slices.map((s) => s.value), ['escalated', 'resolved']);
  });

  it('never infers an outcome from anything', () => {
    /**
     * Asserted as the absence of the shape that would allow it: the tally is
     * built from the recorded field alone, so a log rich in every other signal
     * — sessions, timestamps, stop reasons, retries — still records nothing.
     *
     * Every one of those is a plausible heuristic somebody would then optimise
     * against, which is how a tool ends up rewarding conversations that ended
     * early because the user gave up.
     */
    const suggestive = [
      { ...call(undefined), session: 's1', timestamp: '2026-01-01T00:00:00Z', stop_reason: 'end_turn' },
      { ...call(undefined), session: 's1', timestamp: '2026-01-01T00:00:01Z', stop_reason: 'max_tokens' },
    ];
    const report = reportOf(suggestive);
    assert.equal(report.coverage.recorded, 0);
    assert.equal(report.successShareOfRecordedUsd, null);
    assert.equal(report.noRate, 'nothing-recorded');
  });
});
