import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { UNLABELLED, allocate, validateOwners } from '../dist/index.js';

/**
 * Whose money.
 *
 * The test that matters most is the one about the unallocated line, because
 * spreading it proportionally is the single most common lie in cost reporting
 * — attractive because it makes every line add up, and wrong because it makes
 * every team's number wrong by an amount nobody can see.
 *
 * Doctrine: [An unallocated share is never spread](../../../docs/doctrine.md#an-unallocated-share-is-never-spread)
 */

const CONFIG = {
  patterns: {
    payments: ['billing-*', 'invoice-*'],
    support: ['support-*'],
  },
  budgets: { payments: 100, support: 100 },
};

const spend = (label, usd, calls = 10) => ({ label, usd, calls });

describe('the unallocated is its own line, and it is never spread', () => {
  it('keeps unmatched spend out of every owner', () => {
    /**
     * The whole module in one assertion. Splitting $60 of mystery across two
     * teams proportionally would make both figures wrong, in a direction
     * neither can check, and it would hit the team with the cleanest
     * instrumentation hardest — because their known spend is largest, so they
     * absorb the biggest share of somebody else's unknown.
     */
    const result = allocate(
      [spend('billing-run', 20), spend('support-chat', 20), spend('search-v2', 60)],
      CONFIG,
    );
    assert.equal(result.owners.find((o) => o.owner === 'payments').usd, 20);
    assert.equal(result.owners.find((o) => o.owner === 'support').usd, 20);
    assert.equal(result.unallocated.usd, 60);
  });

  it('names the labels in it, so somebody can claim them', () => {
    // "unallocated: $60" invites somebody to divide it. "unallocated: $60
    // across search-v2 and internal-eval" invites somebody to claim it.
    const result = allocate([spend('search-v2', 40), spend('internal-eval', 20)], CONFIG);
    assert.deepEqual(result.unallocated.labels, ['internal-eval', 'search-v2']);
  });

  it('puts unlabelled calls there rather than guessing an owner', () => {
    const result = allocate([spend(UNLABELLED, 30)], CONFIG);
    assert.equal(result.unallocated.usd, 30);
  });

  it('every owner plus the unallocated equals the bill, exactly', () => {
    const all = [spend('billing-run', 20), spend('support-chat', 15), spend('other', 65)];
    const result = allocate(all, CONFIG);
    const total = result.owners.reduce((sum, o) => sum + o.usd, 0) + result.unallocated.usd;
    assert.ok(Math.abs(total - 100) < 1e-9, 'no money is lost and none is invented');
  });
});

describe('shared cost is declared, and the rule travels with the report', () => {
  const shared = {
    ...CONFIG,
    shared: { search: { payments: 0.6, support: 0.4 } },
  };

  it('splits by the rule somebody wrote', () => {
    const result = allocate([spend('search', 100)], shared);
    assert.equal(result.owners.find((o) => o.owner === 'payments').usd, 60);
    assert.equal(result.owners.find((o) => o.owner === 'support').usd, 40);
  });

  it('carries the rule, so the argument is about the rule and not the number', () => {
    const result = allocate([spend('search', 100)], shared);
    assert.deepEqual(result.sharedApplied, [{ label: 'search', split: { payments: 0.6, support: 0.4 } }]);
    // And each owner's line says how the money got there.
    const line = result.owners.find((o) => o.owner === 'payments');
    assert.equal(line.from[0].via, 'shared');
    assert.equal(line.from[0].share, 0.6);
  });

  it('refuses a split that does not sum to one, rather than normalising it', () => {
    /**
     * Not a rounding problem. A split summing to 0.9 loses a tenth of that
     * workload's money; one summing to 1.1 invents a tenth. Both are silent,
     * and both are exactly what a chargeback report exists to make impossible.
     */
    const broken = { ...CONFIG, shared: { search: { payments: 0.6, support: 0.3 } } };
    const problems = validateOwners(broken).map((p) => p.kind);
    assert.ok(problems.includes('split-does-not-sum'));
  });

  it('sends a workload with a broken split to unallocated, whole', () => {
    // Applying a 0.9 split would put ten per cent nowhere while every line
    // still looked complete. Unallocated puts the whole workload somewhere
    // visible, next to the problem that explains it.
    const broken = { ...CONFIG, shared: { search: { payments: 0.6, support: 0.3 } } };
    const result = allocate([spend('search', 100)], broken);
    assert.equal(result.unallocated.usd, 100);
    assert.equal(result.owners.find((o) => o.owner === 'payments').usd, 0);
  });

  it('catches a split naming an owner that does not exist', () => {
    const bad = { ...CONFIG, shared: { search: { payments: 0.5, nobody: 0.5 } } };
    assert.ok(validateOwners(bad).some((p) => p.kind === 'split-names-unknown-owner'));
  });

  it('catches a "shared" workload with one owner', () => {
    // A pattern written the long way. Reading it as a share invites a second
    // owner to be added without the first being adjusted.
    const odd = { ...CONFIG, shared: { search: { payments: 1 } } };
    assert.ok(validateOwners(odd).some((p) => p.kind === 'split-has-one-owner'));
  });

  it('catches a budget for an owner nobody declared', () => {
    const bad = { ...CONFIG, budgets: { ...CONFIG.budgets, ghost: 50 } };
    assert.ok(validateOwners(bad).some((p) => p.kind === 'budget-for-unknown-owner'));
  });
});

describe('an owner with no measured data is not an owner under budget', () => {
  it('says not-measured rather than within', () => {
    /**
     * The 1.37 refusal applied to people. A team whose logs never arrived
     * passes every budget it has, forever, and a green tick beside their name
     * tells somebody the opposite of the truth.
     */
    const result = allocate([spend('billing-run', 20)], CONFIG);
    assert.equal(result.owners.find((o) => o.owner === 'payments').verdict, 'within');
    assert.equal(result.owners.find((o) => o.owner === 'support').verdict, 'not-measured');
  });

  it('gives every declared owner a line, measured or not', () => {
    // An owner absent from the report is an owner nobody looks at, and the
    // refusal above cannot be printed for somebody who is not on the page.
    const result = allocate([], CONFIG);
    assert.deepEqual(result.owners.map((o) => o.owner).sort(), ['payments', 'support']);
  });

  it('separates over, within, not-measured and no-budget', () => {
    const config = { patterns: CONFIG.patterns, budgets: { payments: 10 } };
    const result = allocate([spend('billing-run', 20), spend('support-chat', 5)], config);
    assert.equal(result.owners.find((o) => o.owner === 'payments').verdict, 'over');
    assert.equal(result.owners.find((o) => o.owner === 'support').verdict, 'no-budget');
  });
});

describe('attribution is by the most specific pattern, as everywhere', () => {
  it('lets a specific pattern beat a general one across owners', () => {
    const config = {
      patterns: { everyone: ['*'], payments: ['billing-*'] },
    };
    const result = allocate([spend('billing-run', 10), spend('anything', 10)], config);
    assert.equal(result.owners.find((o) => o.owner === 'payments').usd, 10);
    assert.equal(result.owners.find((o) => o.owner === 'everyone').usd, 10);
  });

  it('shows which labels landed where, largest first', () => {
    const result = allocate([spend('billing-run', 10), spend('invoice-send', 40)], CONFIG);
    const line = result.owners.find((o) => o.owner === 'payments');
    assert.deepEqual(line.from.map((f) => f.label), ['invoice-send', 'billing-run']);
  });
});
