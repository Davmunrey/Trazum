import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { COVERAGE_DRIFT_MIN, coverageDrift } from '@trazum/core';

/**
 * What the comparison cannot see. A finding that vanished because it was
 * fixed and one that vanished because the log went blind are opposite facts,
 * and only coverage tells them apart.
 */

const coverage = (over) => ({
  label: 0,
  session: 0,
  ts: 0,
  stopReason: 0,
  cacheTtl: 0,
  cacheWrites: 0,
  parsed: 100,
  ...over,
});

describe('coverageDrift', () => {
  it('names a field the log stopped recording', () => {
    const [row, ...rest] = coverageDrift(
      coverage({ session: 98 }),
      coverage({ session: 4 }),
    );
    assert.equal(rest.length, 0);
    assert.equal(row.field, 'session');
    assert.ok(Math.abs(row.was - 0.98) < 1e-9);
    assert.ok(Math.abs(row.now - 0.04) < 1e-9);
    assert.ok(row.delta < 0, 'a collapse must read as negative');
  });

  it('names a field that appeared, because the second report can see more', () => {
    const [row] = coverageDrift(coverage({ ts: 0 }), coverage({ ts: 100 }));
    assert.equal(row.field, 'ts');
    assert.ok(Math.abs(row.delta - 1) < 1e-9);
  });

  it('compares shares, so two logs of different sizes are comparable', () => {
    // Same coverage, ten times the traffic: nothing moved.
    const before = { ...coverage({ session: 50 }), parsed: 100 };
    const after = { ...coverage({ session: 500 }), parsed: 1000 };
    assert.deepEqual(coverageDrift(before, after), []);
  });

  it('stays quiet under the threshold, which is a fifth of the records', () => {
    const small = coverageDrift(coverage({ label: 100 }), coverage({ label: 85 }));
    assert.deepEqual(small, [], 'a 15-point move is ordinary variation');

    const [row] = coverageDrift(coverage({ label: 100 }), coverage({ label: 80 }));
    assert.equal(row.field, 'label', 'exactly the threshold is reported');
    assert.ok(Math.abs(Math.abs(row.delta) - COVERAGE_DRIFT_MIN) < 1e-9);
  });

  it('orders by how much moved, not by field name', () => {
    const rows = coverageDrift(
      coverage({ label: 100, session: 100, ts: 100 }),
      coverage({ label: 70, session: 10, ts: 45 }),
    );
    assert.deepEqual(rows.map((r) => r.field), ['session', 'ts', 'label']);
  });

  it('refuses to speak about a log with nothing parsed', () => {
    // "0% carried a session" and "there was nothing to carry one" are the
    // distinction this module exists for; an empty log gets no shares at all.
    assert.deepEqual(coverageDrift(coverage({ parsed: 0 }), coverage({ session: 90 })), []);
    assert.deepEqual(coverageDrift(coverage({ session: 90 }), coverage({ parsed: 0 })), []);
  });

  it('reports every field that moved, not only the worst', () => {
    const rows = coverageDrift(
      coverage({ session: 100, stopReason: 100 }),
      coverage({ session: 0, stopReason: 0 }),
    );
    assert.equal(rows.length, 2);
    assert.ok(rows.every((r) => r.delta === -1));
  });
});
