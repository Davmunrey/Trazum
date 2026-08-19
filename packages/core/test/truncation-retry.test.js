import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BUNDLED_CATALOGUE, profileUsage } from '../dist/index.js';

/**
 * The retry bill of truncation.
 *
 * Hand arithmetic: on Claude Opus 5, 200k input tokens are $1.00 and 40k
 * output tokens are $1.00 — so a call of 200k in / 40k out is $2.00, and
 * every figure below is checkable by eye.
 */

const profile = (records) =>
  profileUsage(records.map((r) => JSON.stringify(r)).join('\n'), {
    catalogue: BUNDLED_CATALOGUE,
    on: new Date('2026-08-18T00:00:00Z'),
  });

const turn = (seconds, over = {}) => ({
  model: 'claude-opus-5',
  label: 'chat',
  session: 's1',
  ts: new Date(Date.UTC(2026, 7, 1, 10, 0, seconds)).toISOString(),
  stop_reason: 'end_turn',
  usage: { input_tokens: 200_000, output_tokens: 40_000 },
  ...over,
});

const cut = (seconds, over = {}) => turn(seconds, { stop_reason: 'max_tokens', ...over });

describe('the retry bill of truncation', () => {
  it('pairs a truncated answer with its follow-up and prices both sides', () => {
    // Two cut answers, each followed 30s later: 2 retried of 2 truncated.
    // Each call is $2.00, so $4.00 wasted and $4.00 in retries.
    const rows = profile([cut(0), turn(30), cut(120), turn(150)]).truncationRetries;
    assert.equal(rows.length, 1);
    const [row] = rows;
    assert.equal(row.retried, 2);
    assert.equal(row.truncatedCalls, 2);
    assert.ok(Math.abs(row.wastedUsd - 4) < 1e-9, String(row.wastedUsd));
    assert.ok(Math.abs(row.retryUsd - 4) < 1e-9, String(row.retryUsd));
  });

  it('carries the denominator: retried of truncated, not retried alone', () => {
    // Three truncations, two followed up: "2 of 3" is a different sentence
    // from "2 of 2", and the reader needs to know which.
    const rows = profile([cut(0), turn(30), cut(120), turn(150), cut(3000)]).truncationRetries;
    assert.equal(rows[0].retried, 2);
    assert.equal(rows[0].truncatedCalls, 3);
  });

  it('does not call the next question a retry', () => {
    // The follow-up lands ten minutes later: whatever it is, it is not a
    // retry of the cut answer, and counting it would invent a finding.
    assert.deepEqual(profile([cut(0), turn(600), cut(1200), turn(1800)]).truncationRetries, []);
  });

  it('needs the previous call to be the truncated one, not any earlier call', () => {
    // cut, then a clean turn, then another clean turn: the third call follows
    // a clean answer, and only s1's *immediately previous* call is compared.
    assert.deepEqual(profile([cut(0), turn(30), turn(60), cut(3000), turn(3600)]).truncationRetries, []);
  });

  it('keeps conversations apart', () => {
    const rows = profile([
      cut(0),
      turn(10, { session: 's2' }),
      cut(60, { session: 's3' }),
      turn(70, { session: 's4' }),
    ]).truncationRetries;
    assert.deepEqual(rows, []);
  });

  it('says nothing about a single pair — one retry is an anecdote', () => {
    assert.deepEqual(profile([cut(0), turn(30)]).truncationRetries, []);
  });

  it('attributes the pair to the truncated call’s slice, where the ceiling lives', () => {
    // The cut calls are labelled 'draft'; the follow-ups 'chat'. The fix — a
    // higher max_tokens — belongs to 'draft', so the row does too.
    const rows = profile([
      cut(0, { label: 'draft' }),
      turn(30),
      cut(120, { label: 'draft' }),
      turn(150),
    ]).truncationRetries;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].label, 'draft');
  });

  it('stays silent without a session, a clock or a stop reason', () => {
    const noSession = profile([
      cut(0, { session: undefined }),
      turn(30, { session: undefined }),
      cut(120, { session: undefined }),
      turn(150, { session: undefined }),
    ]);
    assert.deepEqual(noSession.truncationRetries, []);

    const noStop = profile([
      turn(0, { stop_reason: undefined }),
      turn(30, { stop_reason: undefined }),
      turn(120, { stop_reason: undefined }),
      turn(150, { stop_reason: undefined }),
    ]);
    assert.deepEqual(noStop.truncationRetries, []);
  });
});
