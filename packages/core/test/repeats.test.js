import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BUNDLED_CATALOGUE, profileUsage } from '../dist/index.js';

/**
 * The same request, sent again a moment later.
 *
 * A conversation's input grows with every turn, so two consecutive calls in
 * one conversation carrying the same input size seconds apart is a retry, an
 * agent step repeating, or a loop — not a working conversation. Hand
 * arithmetic: 200k input tokens on Claude Opus 5 are $1.00.
 */

const ON = new Date('2026-08-18T00:00:00Z');

const profile = (records) =>
  profileUsage(records.map((r) => JSON.stringify(r)).join('\n'), {
    catalogue: BUNDLED_CATALOGUE,
    on: ON,
  });

const at = (seconds, inputTokens, over = {}) => ({
  model: 'claude-opus-5',
  label: 'agent',
  session: 's1',
  ts: new Date(Date.UTC(2026, 7, 1, 10, 0, seconds)).toISOString(),
  usage: { input_tokens: inputTokens, output_tokens: 0 },
  ...over,
});

describe('the same request, sent again', () => {
  it('counts a repeat and prices it in full', () => {
    // Three calls of 200k tokens, seconds apart: two of them repeat the one
    // before, at $1.00 each.
    const [row] = profile([at(0, 200_000), at(5, 200_000), at(10, 200_000)]).repeatedTurns;
    assert.ok(row, 'no repeat was reported for three identical consecutive calls');
    assert.equal(row.repeats, 2);
    assert.equal(row.checkedCalls, 3);
    assert.ok(Math.abs(row.usd - 2) < 1e-9, String(row.usd));
    assert.equal(row.label, 'agent');
  });

  it('says nothing about a conversation that is simply growing', () => {
    // The ordinary shape: every turn carries more than the last.
    assert.deepEqual(
      profile([at(0, 100_000), at(5, 200_000), at(10, 300_000), at(15, 400_000)]).repeatedTurns,
      [],
    );
  });

  it('ignores a repeat outside the window', () => {
    // Same size, ten minutes later: that is the next turn of a slow
    // conversation, not a retry, and calling it one would be an invention.
    assert.deepEqual(profile([at(0, 200_000), at(600, 200_000), at(1200, 200_000)]).repeatedTurns, []);
  });

  it('does not treat two conversations as one', () => {
    const records = [
      at(0, 200_000),
      at(1, 200_000, { session: 's2' }),
      at(2, 200_000, { session: 's3' }),
    ];
    assert.deepEqual(profile(records).repeatedTurns, []);
  });

  it('refuses to judge records out of time order', () => {
    // A negative gap means the log is not ordered, not that a call repeated.
    assert.deepEqual(profile([at(30, 200_000), at(20, 200_000), at(10, 200_000)]).repeatedTurns, []);
  });

  it('stays silent on a log with no session or no clock', () => {
    const noSession = profile([
      at(0, 200_000, { session: undefined }),
      at(5, 200_000, { session: undefined }),
      at(10, 200_000, { session: undefined }),
    ]);
    assert.deepEqual(noSession.repeatedTurns, []);

    const noClock = profile([
      { model: 'claude-opus-5', label: 'agent', session: 's1', usage: { input_tokens: 200_000, output_tokens: 0 } },
      { model: 'claude-opus-5', label: 'agent', session: 's1', usage: { input_tokens: 200_000, output_tokens: 0 } },
      { model: 'claude-opus-5', label: 'agent', session: 's1', usage: { input_tokens: 200_000, output_tokens: 0 } },
    ]);
    assert.deepEqual(noClock.repeatedTurns, []);
  });

  it('needs more than one repeat before it says anything', () => {
    // One repeated call is a retry after a timeout — ordinary, and not worth
    // a section that implies a pattern.
    assert.deepEqual(profile([at(0, 200_000), at(5, 200_000)]).repeatedTurns, []);
  });

  it('counts cache reads toward the size, since that is what was re-sent', () => {
    const cached = { usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 200_000 } };
    const [row] = profile([at(0, 0, cached), at(5, 0, cached), at(10, 0, cached)]).repeatedTurns;
    assert.equal(row.repeats, 2);
    // Cache reads are a tenth of input: $0.10 each, $0.20 for the two.
    assert.ok(Math.abs(row.usd - 0.2) < 1e-9, String(row.usd));
  });

  it('reports the window it judged against, so the threshold is never hidden', () => {
    const [row] = profile([at(0, 200_000), at(5, 200_000), at(10, 200_000)]).repeatedTurns;
    assert.equal(row.withinMs, 60_000);
  });
});
