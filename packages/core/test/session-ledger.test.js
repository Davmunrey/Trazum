import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BUNDLED_CATALOGUE, profileUsage, singleTurnCacheWrites, parseUsageLine } from '../dist/index.js';

/**
 * Cache writes by conversations that never came back.
 *
 * Every dollar is hand arithmetic against the published rates: on Claude
 * Opus 5, input is $5/MTok; a 5-minute cache write is 1.25x input, so
 * 1,000,000 written tokens are $6.25; a 1-hour write is 2x, so $10.00.
 * Never a snapshot.
 */

const ON = new Date('2026-08-18T00:00:00Z');

const line = (record) => JSON.stringify(record);
const profile = (lines) =>
  profileUsage(lines.join('\n'), { catalogue: BUNDLED_CATALOGUE, on: ON });

/** One turn of a session, writing 5-minute cache entries. */
const turn = (session, over = {}) =>
  line({
    model: 'claude-opus-5',
    label: 'chat',
    session,
    usage: {
      input_tokens: 1_000,
      output_tokens: 100,
      ...(over.usage ?? {}),
    },
    ...Object.fromEntries(Object.entries(over).filter(([k]) => k !== 'usage')),
  });

const writes5m = (tokens) => ({
  cache_creation_input_tokens: tokens,
  cache_creation: { ephemeral_5m_input_tokens: tokens, ephemeral_1h_input_tokens: 0 },
});

describe('the ledger of conversations that never came back', () => {
  it('prices a one-turn session’s 5-minute writes exactly: 1M tokens are $6.25', () => {
    const report = profile([
      turn('drive-by', { usage: writes5m(1_000_000) }),
      turn('stayer', { usage: writes5m(10) }),
      turn('stayer'),
    ]);
    assert.equal(report.singleTurnCacheWrites.length, 1);
    const row = report.singleTurnCacheWrites[0];
    assert.equal(row.sessions, 2);
    assert.equal(row.singleTurnSessions, 1);
    assert.equal(row.singleTurnWriteTokens, 1_000_000);
    // 1M tokens × $5/MTok × 1.25 = $6.25, and the stayer's writes are not in it.
    assert.ok(Math.abs(row.singleTurnWriteUsd - 6.25) < 1e-9, String(row.singleTurnWriteUsd));
    assert.equal(row.assumedTtlTokens, 0);
  });

  it('prices 1-hour writes at 2x and unstated TTLs at the bill’s own floor', () => {
    const report = profile([
      turn('a', {
        usage: {
          cache_creation_input_tokens: 1_000_000,
          cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 1_000_000 },
        },
      }),
      turn('b', { usage: { cache_creation_input_tokens: 1_000_000 } }),
    ]);
    const row = report.singleTurnCacheWrites[0];
    // $10.00 for the 1-hour million plus $6.25 for the assumed one — the same
    // 5-minute floor the totals stand on, never a new guess.
    assert.ok(Math.abs(row.singleTurnWriteUsd - 16.25) < 1e-9, String(row.singleTurnWriteUsd));
    assert.equal(row.assumedTtlTokens, 1_000_000);
  });

  it('is independent of the order of the log', () => {
    const interleaved = profile([
      turn('a', { usage: writes5m(500_000) }),
      turn('b', { usage: writes5m(200_000) }),
      turn('b'),
      turn('c'),
      turn('c'),
      turn('c'),
    ]);
    const row = interleaved.singleTurnCacheWrites[0];
    assert.equal(row.sessions, 3);
    assert.equal(row.singleTurnSessions, 1);
    assert.equal(row.medianTurns, 2);
    assert.equal(row.singleTurnWriteTokens, 500_000);
  });

  it('says nothing about one-turn sessions that wrote nothing', () => {
    const report = profile([turn('a'), turn('b', { usage: writes5m(1_000) }), turn('b')]);
    // The only single-turn session wrote no cache: no waste, no row.
    assert.deepEqual(report.singleTurnCacheWrites, []);
  });

  it('needs a session key and a priced model, and never leaks the key', () => {
    const report = profile([
      line({ model: 'claude-opus-5', usage: { input_tokens: 100, ...writes5m(1_000) } }),
      turn('secret-user-42@corp', { usage: writes5m(1_000_000) }),
      line({ model: 'ft:acme-custom', session: 's', usage: { input_tokens: 5, ...writes5m(999) } }),
    ]);
    assert.equal(report.singleTurnCacheWrites.length, 1);
    assert.ok(!JSON.stringify(report.singleTurnCacheWrites).includes('secret-user-42'));
  });

  it('sorts by money, the order somebody would act in', () => {
    const records = [
      { model: 'claude-opus-5', label: 'small', session: 'x', usage: { input_tokens: 1, ...writes5m(10_000) } },
      { model: 'claude-opus-5', label: 'big', session: 'y', usage: { input_tokens: 1, ...writes5m(2_000_000) } },
    ].map((r) => parseUsageLine(JSON.stringify(r)));
    const rows = singleTurnCacheWrites(records, { catalogue: BUNDLED_CATALOGUE, on: ON });
    assert.deepEqual(rows.map((r) => r.label), ['big', 'small']);
  });
});
