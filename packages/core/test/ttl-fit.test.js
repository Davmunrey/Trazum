import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BUNDLED_CATALOGUE,
  TTL_1H_MS,
  TTL_5M_MS,
  parseUsageLine,
  profileUsage,
} from '../dist/index.js';

/**
 * The clock: parsing, the span, and whether the cache TTL fits the gaps.
 *
 * Every dollar asserted here is hand arithmetic against the published rates,
 * never a snapshot — a snapshot of a wrong number passes forever.
 */

const ON = new Date('2026-08-18T00:00:00Z');
const T0 = Date.parse('2026-08-01T10:00:00Z');

const line = (record) => JSON.stringify(record);
const profile = (lines) =>
  profileUsage(lines.join('\n'), { catalogue: BUNDLED_CATALOGUE, on: ON });

/** A turn with 5-minute cache writes, `offsetMs` after T0. */
const turn5m = (session, offsetMs, writes = 10_000) =>
  line({
    model: 'claude-opus-5',
    label: 'chat',
    session,
    ts: new Date(T0 + offsetMs).toISOString(),
    usage: {
      input_tokens: 500,
      output_tokens: 100,
      cache_creation_input_tokens: writes,
      cache_creation: { ephemeral_5m_input_tokens: writes, ephemeral_1h_input_tokens: 0 },
    },
  });

describe('the clock is parsed under the same rules as the counts', () => {
  const base = { model: 'claude-opus-5', usage: { input_tokens: 10, output_tokens: 1 } };

  it('reads ISO strings, epoch seconds and epoch milliseconds as one moment', () => {
    const iso = parseUsageLine(line({ ...base, ts: '2026-08-01T10:00:00Z' }));
    const seconds = parseUsageLine(line({ ...base, ts: T0 / 1000 }));
    const millis = parseUsageLine(line({ ...base, ts: T0 }));
    assert.equal(iso.ts, T0);
    assert.equal(seconds.ts, T0);
    assert.equal(millis.ts, T0);
  });

  it("reads OpenAI's created field, which is epoch seconds on every response", () => {
    const record = parseUsageLine(line({ ...base, created: T0 / 1000 }));
    assert.equal(record.ts, T0);
  });

  it('absent is null, not zero and not an error', () => {
    assert.equal(parseUsageLine(line(base)).ts, null);
  });

  it('present and unreadable rejects the line, exactly like a corrupt count', () => {
    // A null out of a database round-trip, prose, and a number too small to
    // name any moment a usage log could contain.
    for (const ts of [null, 'yesterday', 5]) {
      assert.equal(parseUsageLine(line({ ...base, ts })), null, `ts=${JSON.stringify(ts)}`);
    }
  });
});

describe('the span states the period, and never extrapolates from it', () => {
  it('is the first and last recorded moment, with how many calls carried one', () => {
    const report = profile([
      line({ model: 'claude-opus-5', ts: '2026-08-01T00:00:00Z', usage: { input_tokens: 10, output_tokens: 1 } }),
      line({ model: 'claude-opus-5', usage: { input_tokens: 10, output_tokens: 1 } }),
      line({ model: 'claude-opus-5', ts: '2026-08-14T00:00:00Z', usage: { input_tokens: 10, output_tokens: 1 } }),
    ]);
    assert.equal(report.span.fromMs, Date.parse('2026-08-01T00:00:00Z'));
    assert.equal(report.span.toMs, Date.parse('2026-08-14T00:00:00Z'));
    // Two of three: the report can say the span covers a slice of the log.
    assert.equal(report.span.calls, 2);
  });

  it('is null when no record carries a clock — absent, not a zero-length span', () => {
    const report = profile([
      line({ model: 'claude-opus-5', usage: { input_tokens: 10, output_tokens: 1 } }),
    ]);
    assert.equal(report.span, null);
  });

  it('covers unpriced models too: when a call happened is a fact about the log', () => {
    const report = profile([
      line({ model: 'unknown-model-x', ts: '2026-08-01T00:00:00Z', usage: { input_tokens: 10, output_tokens: 1 } }),
    ]);
    assert.equal(report.span.calls, 1);
  });
});

describe('whether the TTL fits the gaps', () => {
  it('5-minute writes on 9-minute gaps expire before reuse', () => {
    const report = profile([
      turn5m('a', 0),
      turn5m('a', 9 * 60 * 1000),
      turn5m('a', 18 * 60 * 1000),
    ]);
    assert.equal(report.cacheTtlFit.length, 1);
    const fit = report.cacheTtlFit[0];
    assert.equal(fit.verdict, 'expires-before-reuse');
    assert.equal(fit.medianGapMs, 9 * 60 * 1000);
    assert.equal(fit.sessions, 1);
    assert.equal(fit.gaps, 2);
    assert.equal(fit.overpayUsd, 0);
  });

  it('1-hour writes on 30-second gaps overpay, priced to the cent by hand', () => {
    const writes = 1_000_000;
    const report = profile([0, 30_000, 60_000].map((offset) =>
      line({
        model: 'claude-opus-5',
        label: 'chat',
        session: 'a',
        ts: T0 + offset,
        usage: {
          input_tokens: 500,
          output_tokens: 100,
          cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: writes },
        },
      }),
    ));
    const fit = report.cacheTtlFit[0];
    assert.equal(fit.verdict, 'overlong-ttl');
    /**
     * 3M written tokens × $5/MTok input on Claude Opus 5 × (2.0 − 1.25)
     * = 3 × 5 × 0.75 = $11.25. The same tokens at the shorter TTL.
     */
    assert.equal(fit.overpayUsd.toFixed(2), '11.25');
  });

  it('writes with no recorded TTL on gaps between the two are unsettled', () => {
    const report = profile([
      line({ model: 'claude-opus-5', label: 'chat', session: 'a', ts: T0, usage: { input_tokens: 500, output_tokens: 1, cache_creation_input_tokens: 10_000 } }),
      line({ model: 'claude-opus-5', label: 'chat', session: 'a', ts: T0 + 20 * 60 * 1000, usage: { input_tokens: 500, output_tokens: 1, cache_creation_input_tokens: 10_000 } }),
    ]);
    // 20 minutes: a 5-minute entry is gone, a 1-hour one survives. Neither is
    // asserted, because the log never said which it was.
    assert.equal(report.cacheTtlFit[0].verdict, 'unsettled');
  });

  it('and past an hour the unknown TTL no longer matters: expired either way', () => {
    const report = profile([
      line({ model: 'claude-opus-5', label: 'chat', session: 'a', ts: T0, usage: { input_tokens: 500, output_tokens: 1, cache_creation_input_tokens: 10_000 } }),
      line({ model: 'claude-opus-5', label: 'chat', session: 'a', ts: T0 + 2 * 60 * 60 * 1000, usage: { input_tokens: 500, output_tokens: 1, cache_creation_input_tokens: 10_000 } }),
    ]);
    assert.equal(report.cacheTtlFit[0].verdict, 'expires-before-reuse');
  });

  it('5-minute writes on 30-second gaps fit, and the report says so', () => {
    const report = profile([turn5m('a', 0), turn5m('a', 30_000), turn5m('a', 60_000)]);
    assert.equal(report.cacheTtlFit[0].verdict, 'fits');
  });

  it('a broken TTL outranks a working one in the same slice', () => {
    // Mixed writes, 10-minute gaps: the 5-minute half expires while the 1-hour
    // half works. Reporting the slice as anything but broken would let the
    // working half hide the failing one.
    const report = profile([0, 10 * 60 * 1000, 20 * 60 * 1000].map((offset) =>
      line({
        model: 'claude-opus-5',
        label: 'chat',
        session: 'a',
        ts: T0 + offset,
        usage: {
          input_tokens: 500,
          output_tokens: 1,
          cache_creation: { ephemeral_5m_input_tokens: 5_000, ephemeral_1h_input_tokens: 5_000 },
        },
      }),
    ));
    assert.equal(report.cacheTtlFit[0].verdict, 'expires-before-reuse');
  });

  it('is independent of the order of the log', () => {
    const lines = [
      turn5m('a', 0), turn5m('a', 9 * 60 * 1000), turn5m('a', 18 * 60 * 1000),
      turn5m('b', 4 * 60 * 1000), turn5m('b', 13 * 60 * 1000),
    ];
    const forward = profile(lines);
    const reversed = profile([...lines].reverse());
    assert.deepEqual(reversed.cacheTtlFit, forward.cacheTtlFit);
  });

  it('writes without sessions or clocks produce no row — unmeasured, not fine', () => {
    const report = profile([
      line({ model: 'claude-opus-5', label: 'chat', usage: { input_tokens: 500, output_tokens: 1, cache_creation_input_tokens: 10_000 } }),
    ]);
    assert.deepEqual(report.cacheTtlFit, []);
  });

  it('gaps alone, with no writes anywhere, are not a finding', () => {
    const report = profile([
      line({ model: 'claude-opus-5', label: 'chat', session: 'a', ts: T0, usage: { input_tokens: 500, output_tokens: 1 } }),
      line({ model: 'claude-opus-5', label: 'chat', session: 'a', ts: T0 + 1000, usage: { input_tokens: 500, output_tokens: 1 } }),
    ]);
    assert.deepEqual(report.cacheTtlFit, []);
  });

  it('never carries the session key out', () => {
    const secret = 'sess-CUSTOMER-9f3e';
    const report = profile([
      line({ model: 'claude-opus-5', label: 'chat', session: secret, ts: T0, usage: { input_tokens: 500, output_tokens: 1, cache_creation_input_tokens: 10_000 } }),
      line({ model: 'claude-opus-5', label: 'chat', session: secret, ts: T0 + 1000, usage: { input_tokens: 500, output_tokens: 1, cache_creation_input_tokens: 10_000 } }),
    ]);
    assert.ok(report.cacheTtlFit.length > 0);
    assert.ok(!JSON.stringify(report.cacheTtlFit).includes(secret));
  });

  it('the two lifetimes are the published ones, in milliseconds', () => {
    assert.equal(TTL_5M_MS, 300_000);
    assert.equal(TTL_1H_MS, 3_600_000);
  });
});
