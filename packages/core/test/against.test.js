import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { driversBetween } from '../dist/index.js';

/**
 * The one implementation of the change between two bills. The sign convention
 * — positive means the bill grew — has flipped once already in this
 * repository's history when restated by hand, which is why this lives in core
 * and the CLI, the MCP and the web all import it.
 */
describe('driversBetween', () => {
  it('names appeared and vanished keys instead of folding them into the total', () => {
    const drivers = driversBetween(
      [{ key: 'legacy', usd: 1 }, { key: 'chat', usd: 2 }],
      [{ key: 'chat', usd: 6 }, { key: 'rag', usd: 3 }],
    );
    assert.deepEqual(drivers, [
      { key: 'chat', was: 2, now: 6, delta: 4 },
      { key: 'rag', was: null, now: 3, delta: 3 },
      { key: 'legacy', was: 1, now: null, delta: -1 },
    ]);
  });

  it('null is not zero: a key at $0 on both sides is unchanged, not vanished', () => {
    assert.deepEqual(driversBetween([{ key: 'free', usd: 0 }], [{ key: 'free', usd: 0 }]), []);
  });

  it('two identical bills have no drivers', () => {
    const bill = [{ key: 'a', usd: 1.25 }, { key: 'b', usd: 0.75 }];
    assert.deepEqual(driversBetween(bill, bill), []);
  });

  it('sorts by magnitude, shrinkage ranked with growth', () => {
    const drivers = driversBetween(
      [{ key: 'shrank', usd: 10 }, { key: 'grew', usd: 1 }],
      [{ key: 'shrank', usd: 2 }, { key: 'grew', usd: 4 }],
    );
    assert.deepEqual(drivers.map((d) => d.key), ['shrank', 'grew']);
    assert.equal(drivers[0].delta, -8);
  });
});
