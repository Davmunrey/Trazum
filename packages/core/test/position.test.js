import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BUNDLED_CATALOGUE, indexUsage, positionAt } from '../dist/index.js';

/**
 * The measured side of the limits policy: null is "unknown", zero is "a
 * history that is complete and empty", and every case here is one where
 * collapsing the two would let a dead log approve a live spend.
 */

const catalogue = BUNDLED_CATALOGUE;
const NOW = new Date('2026-08-24T12:00:00Z');
const TODAY = new Date('2026-08-24T09:00:00Z').getTime();
const YESTERDAY = new Date('2026-08-23T09:00:00Z').getTime();

const record = (over = {}) => ({
  model: 'claude-opus-5',
  inputTokens: 1_000_000,
  cacheReadTokens: 0,
  cacheWrite5mTokens: 0,
  cacheWrite1hTokens: 0,
  writeTtlKnown: true,
  outputTokens: 0,
  label: 'chat',
  outcome: null,
  session: 's1',
  ts: TODAY,
  truncated: null,
  ...over,
});

describe('indexing a usage log for the limits policy', () => {
  it('sums the day, the labels and the sessions, priced like everything else', () => {
    const index = indexUsage([record(), record({ ts: YESTERDAY, session: 's2', label: 'batch' })], {
      catalogue,
      on: NOW,
    });
    // $5/MTok input on claude-opus-5: one record is $5.
    assert.equal(index.dayUsd, 5);
    assert.deepEqual(index.dayWindow, {
      fromMs: Date.parse('2026-08-24T00:00:00Z'),
      toMs: Date.parse('2026-08-25T00:00:00Z'),
    });
    const position = positionAt(index, { label: 'chat', session: 's1' });
    assert.equal(position.labelUsd, 5);
    assert.equal(position.sessionUsd, 5);
  });

  it('answers null for a scope the log cannot see, and 0 for one it can and holds nothing for', () => {
    const blind = indexUsage([record({ label: null, session: null, ts: null })], { catalogue, on: NOW });
    const unseen = positionAt(blind, { label: 'chat', session: 's1' });
    assert.equal(unseen.dayUsd, null, 'no clock anywhere: today is unknowable');
    assert.equal(unseen.labelUsd, null, 'no labels anywhere: label spend is unknowable');
    assert.equal(unseen.sessionUsd, null);

    const sighted = indexUsage([record()], { catalogue, on: NOW });
    const fresh = positionAt(sighted, { label: 'new-label', session: 'new-session' });
    assert.equal(fresh.labelUsd, 0, 'the log records labels and has never seen this one: measured empty');
    assert.equal(fresh.sessionUsd, 0, 'a conversation that has not started has a complete, empty history');
  });

  it('an empty log measures nothing, and a call with no label or session asks for nothing', () => {
    const empty = indexUsage([], { catalogue, on: NOW });
    assert.deepEqual(positionAt(empty, { label: 'chat', session: 's1' }), {
      dayUsd: null,
      sessionUsd: null,
      labelUsd: null,
    });
    const index = indexUsage([record()], { catalogue, on: NOW });
    const bare = positionAt(index, {});
    assert.equal(bare.labelUsd, null);
    assert.equal(bare.sessionUsd, null);
    assert.equal(bare.dayUsd, 5, 'the day does not need the call to name anything');
  });

  it('counts unpriced records instead of silently dropping their money', () => {
    const index = indexUsage([record(), record({ model: 'no-such-model' })], { catalogue, on: NOW });
    assert.equal(index.unpriced, 1);
    assert.equal(index.dayUsd, 5, 'the unpriced record contributes nothing, visibly');
  });
});
