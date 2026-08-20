import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BUNDLED_CATALOGUE,
  bucketedProfile,
  bucketsFromRecords,
  identityOf,
  pruneRecords,
  recordsFromBuckets,
  resolveStore,
  storeInventory,
  STORE_SCHEMA_VERSION,
} from '../dist/index.js';

/**
 * The store: convergence on re-pull, and deduplication that cannot lie.
 *
 * Hand arithmetic as everywhere: Claude Opus 5 at $5/MTok input makes 200k
 * input tokens $1.00.
 */

const DAY = 86_400_000;

const record = (over = {}) => ({
  v: STORE_SCHEMA_VERSION,
  provider: 'anthropic',
  fromMs: Date.UTC(2026, 7, 1),
  toMs: Date.UTC(2026, 7, 2),
  model: 'claude-opus-5',
  calls: null,
  input: 200_000,
  cacheRead: 0,
  write5m: 0,
  write1h: 0,
  ttlKnown: true,
  output: 0,
  group: {},
  pulledAtMs: Date.UTC(2026, 7, 2, 1),
  ...over,
});

describe('resolveStore', () => {
  it('converges on re-pull instead of doubling the bill', () => {
    // The same day pulled at noon and again at midnight: one fact restated.
    const midday = record({ input: 100_000, pulledAtMs: Date.UTC(2026, 7, 1, 12) });
    const complete = record({ input: 200_000, pulledAtMs: Date.UTC(2026, 7, 2, 0) });
    const resolved = resolveStore([midday, complete]);
    assert.equal(resolved.records.length, 1);
    // The later pull wins: a window pulled again is at worst as complete.
    assert.equal(resolved.records[0].input, 200_000);
  });

  it('does not let an older pull overwrite a newer one, whatever the file order', () => {
    const newer = record({ input: 200_000, pulledAtMs: Date.UTC(2026, 7, 2) });
    const older = record({ input: 100_000, pulledAtMs: Date.UTC(2026, 7, 1) });
    assert.equal(resolveStore([newer, older]).records[0].input, 200_000);
    assert.equal(resolveStore([older, newer]).records[0].input, 200_000);
  });

  it('keeps different windows, models and groupings apart', () => {
    const resolved = resolveStore([
      record(),
      record({ fromMs: Date.UTC(2026, 7, 2), toMs: Date.UTC(2026, 7, 3) }),
      record({ model: 'claude-haiku-4-5' }),
      record({ group: { workspace_id: 'wrk_two' } }),
    ]);
    assert.equal(resolved.records.length, 4);
    // Identity is the whole tuple, not the window alone.
    assert.notEqual(identityOf(record()), identityOf(record({ model: 'claude-haiku-4-5' })));
  });

  it('keeps records it cannot tell apart as two, and says so', () => {
    // A zero-length window and a record with no model cannot be distinguished
    // from another like them. Merging on a guess makes a bill quietly smaller.
    const noWindow = record({ toMs: Date.UTC(2026, 7, 1) });
    const noModel = record({ model: '' });
    const resolved = resolveStore([noWindow, noWindow, noModel]);
    assert.equal(resolved.records.length, 0);
    assert.equal(resolved.possiblyDouble.length, 3);
  });

  it('keeps a line from a future schema rather than dropping or guessing at it', () => {
    const resolved = resolveStore([record(), record({ v: STORE_SCHEMA_VERSION + 1 })]);
    assert.equal(resolved.records.length, 1);
    assert.equal(resolved.unknownVersion, 1);
  });
});

describe('records and buckets round-trip', () => {
  it('prices a stored month exactly as a fresh pull does', () => {
    const buckets = [
      {
        fromMs: Date.UTC(2026, 7, 1),
        toMs: Date.UTC(2026, 7, 2),
        model: 'claude-opus-5',
        calls: null,
        inputTokens: 200_000,
        cacheReadTokens: 0,
        cacheWrite5mTokens: 0,
        cacheWrite1hTokens: 0,
        writeTtlKnown: true,
        outputTokens: 0,
        group: { workspace_id: 'wrk_one' },
      },
    ];
    const stored = recordsFromBuckets('anthropic', buckets, Date.UTC(2026, 7, 2));
    const back = bucketsFromRecords(stored);
    assert.deepEqual(back, buckets);

    const priced = bucketedProfile(
      { provider: 'anthropic', granularity: 'bucketed', buckets: back, window: null, gaps: [], unavailable: [] },
      { catalogue: BUNDLED_CATALOGUE, on: new Date('2026-08-16T00:00:00Z') },
    );
    assert.ok(Math.abs(priced.total.totalUsd - 1) < 1e-9, String(priced.total.totalUsd));
  });

  it('carries an unknown call count through the store untouched', () => {
    const [stored] = recordsFromBuckets('anthropic', [
      {
        fromMs: 0, toMs: DAY, model: 'm', calls: null, inputTokens: 1, cacheReadTokens: 0,
        cacheWrite5mTokens: 0, cacheWrite1hTokens: 0, writeTtlKnown: true, outputTokens: 0, group: {},
      },
    ], 0);
    assert.equal(stored.calls, null, 'null must not become zero on the way to disk');
  });
});

describe('storeInventory', () => {
  it('says what is in it, per provider, with the span it covers', () => {
    const inventory = storeInventory(
      resolveStore([
        record(),
        record({ fromMs: Date.UTC(2026, 7, 5), toMs: Date.UTC(2026, 7, 6) }),
        record({ provider: 'openai', model: 'gpt-5', calls: 40 }),
      ]),
    );
    assert.equal(inventory.totalRecords, 3);
    assert.deepEqual(inventory.providers.map((p) => p.provider), ['anthropic', 'openai']);
    assert.equal(new Date(inventory.span.fromMs).toISOString(), '2026-08-01T00:00:00.000Z');
    assert.equal(new Date(inventory.span.toMs).toISOString(), '2026-08-06T00:00:00.000Z');
    // One provider serves counts and the other does not: neither borrows the
    // other's answer.
    assert.equal(inventory.providers.find((p) => p.provider === 'anthropic').calls, null);
    assert.equal(inventory.providers.find((p) => p.provider === 'openai').calls, 40);
  });

  it('is empty without pretending to be zero spend', () => {
    const inventory = storeInventory(resolveStore([]));
    assert.equal(inventory.totalRecords, 0);
    assert.equal(inventory.span, null);
    assert.deepEqual(inventory.providers, []);
  });
});

describe('pruneRecords', () => {
  it('drops what ended before the cutoff and returns what went', () => {
    const old = record({ fromMs: Date.UTC(2026, 6, 1), toMs: Date.UTC(2026, 6, 2) });
    const kept = record();
    const result = pruneRecords([old, kept], Date.UTC(2026, 7, 1));
    assert.deepEqual(result.kept, [kept]);
    assert.deepEqual(result.dropped, [old]);
    assert.equal(new Date(result.droppedSpan.fromMs).toISOString(), '2026-07-01T00:00:00.000Z');
  });

  it('keeps a bucket that ends inside the retained period whole', () => {
    // Half a bucket is a measurement of nothing, so the boundary keeps it.
    const straddling = record({ fromMs: Date.UTC(2026, 6, 31), toMs: Date.UTC(2026, 7, 1, 12) });
    const result = pruneRecords([straddling], Date.UTC(2026, 7, 1));
    assert.deepEqual(result.kept, [straddling]);
    assert.equal(result.droppedSpan, null);
  });
});
