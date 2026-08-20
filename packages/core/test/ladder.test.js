import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BREAK_EVEN_BAND,
  BUNDLED_CATALOGUE,
  MIN_CALLS_FOR_LADDER,
  ladderArithmetic,
  ladderPosition,
  validateLadder,
} from '../dist/index.js';

/**
 * Cheap first, escalate on measured failure.
 *
 * The tests that matter are the ones about the break-even rate. A ladder is
 * sold as a saving and is only a saving below a specific escalation rate —
 * above it, it is a more expensive way to get the same answers, and the
 * mistake compounds with traffic until a quarter is over.
 */

const ON = new Date('2026-08-16T00:00:00Z');
const CAT = BUNDLED_CATALOGUE;
const VOCAB = { values: ['resolved', 'escalated'], success: ['resolved'] };

/** 200k in, nothing out: $0.20 on Haiku 4.5, $1.00 on Opus 5. */
const SHAPE = { inputTokens: 200_000, outputTokens: 0 };
const LADDER = { tiers: ['claude-haiku-4-5', 'claude-opus-5'], escalateOn: ['escalated'] };

const tally = (resolved, escalated, extra = []) => {
  const byValue = [];
  if (resolved > 0) byValue.push({ value: 'resolved', calls: resolved, usd: resolved * 0.2 });
  if (escalated > 0) byValue.push({ value: 'escalated', calls: escalated, usd: escalated * 1.2 });
  byValue.push(...extra);
  const recorded = byValue.reduce((sum, v) => sum + v.calls, 0);
  return { byValue, recorded, parsed: recorded, unrecordedUsd: 0 };
};

const positionOf = (resolved, escalated, extra) =>
  ladderPosition(LADDER, tally(resolved, escalated, extra), SHAPE, VOCAB, CAT, ON);

describe('the arithmetic, stated rather than assumed', () => {
  it('states the rate at which a ladder stops saving', () => {
    /**
     * With a ladder every call pays cheap, and the escalated share pays dear
     * on top — the cheap attempt is not refunded. $0.20 + r x $1.00 equals
     * $1.00 at r = 0.8.
     */
    const a = ladderArithmetic(LADDER, SHAPE, CAT, ON);
    assert.ok(Math.abs(a.cheapUsd - 0.2) < 1e-9);
    assert.ok(Math.abs(a.dearUsd - 1) < 1e-9);
    assert.ok(Math.abs(a.breakEvenRate - 0.8) < 1e-9);
  });

  it('compares a three-rung ladder against its top rung, not its middle', () => {
    // The alternative is the model that would have been used without a ladder,
    // which is the top. Comparing against the middle reports a saving against
    // a model nobody was going to use.
    const three = { tiers: ['claude-haiku-4-5', 'claude-sonnet-5', 'claude-opus-5'], escalateOn: ['escalated'] };
    const a = ladderArithmetic(three, SHAPE, CAT, ON);
    assert.ok(Math.abs(a.dearUsd - 1) < 1e-9, 'priced against Opus, not Sonnet');
  });

  it('returns null rather than zero when a tier cannot be priced', () => {
    // Zero would read as "any escalation at all loses money", which is a
    // completely different and much more alarming claim.
    const a = ladderArithmetic({ tiers: ['nobody-priced-this', 'claude-opus-5'], escalateOn: ['x'] }, SHAPE, CAT, ON);
    assert.equal(a.breakEvenRate, null);
  });
});

describe('which side of break-even the measurement puts you on', () => {
  it('calls a low escalation rate a saving, with the delta', () => {
    // 10% escalation: $0.20 + $0.10 = $0.30 a call against $1.00.
    const p = positionOf(90, 10);
    assert.equal(p.verdict, 'saving');
    assert.ok(Math.abs(p.measuredRate - 0.1) < 1e-9);
    assert.ok(Math.abs(p.deltaUsdPerCall + 0.7) < 1e-9, String(p.deltaUsdPerCall));
  });

  it('calls a high escalation rate what it is: a bill', () => {
    /**
     * The finding this chapter exists for. 90% escalation: $0.20 + $0.90 =
     * $1.10 a call against $1.00 — the ladder costs 10% *more* than never
     * having built it, while still being describable as "we route to the
     * cheap model first".
     */
    const p = positionOf(10, 90);
    assert.equal(p.verdict, 'costing');
    assert.ok(p.deltaUsdPerCall > 0);
    assert.ok(Math.abs(p.deltaUsdPerCall - 0.1) < 1e-9);
  });

  it('refuses to claim a sign inside the break-even band', () => {
    // Inside the band the sign flips on ordinary week-to-week variation, and
    // "saving" on Monday and "costing" on Thursday teaches a reader to ignore
    // the figure.
    const p = positionOf(20, 80);
    assert.equal(p.verdict, 'at-break-even');
    assert.ok(Math.abs(p.measuredRate - 0.8) <= BREAK_EVEN_BAND);
  });
});

describe('the refusals', () => {
  it('will not state a rate from too few calls', () => {
    const p = positionOf(MIN_CALLS_FOR_LADDER - 2, 1);
    assert.equal(p.verdict, 'cannot-tell');
    assert.equal(p.unknown, 'too-few-calls');
    // The counts are still shown — the refusal is never bare.
    assert.equal(p.calls, MIN_CALLS_FOR_LADDER - 1);
  });

  it('separates nothing recorded from an unpriced tier', () => {
    assert.equal(positionOf(0, 0).unknown, 'no-outcomes-recorded');
    const unpriced = ladderPosition(
      { tiers: ['nobody-priced-this', 'claude-opus-5'], escalateOn: ['escalated'] },
      tally(90, 10),
      SHAPE,
      VOCAB,
      CAT,
      ON,
    );
    assert.equal(unpriced.unknown, 'tier-unpriced');
  });

  it('keeps an undeclared value out of the denominator as well as the numerator', () => {
    /**
     * A typo in an exporter must not move a control loop's break-even. With
     * 90 resolved, 10 escalated and 100 misspelled, counting the typos would
     * report a 5% escalation rate instead of 10% — and a ladder judged on
     * half its real escalation rate is a ladder nobody will switch off.
     */
    const p = positionOf(90, 10, [{ value: 'escalatd', calls: 100, usd: 20 }]);
    assert.equal(p.calls, 100);
    assert.ok(Math.abs(p.measuredRate - 0.1) < 1e-9);
  });

  it('will not run a ladder with no escalation values', () => {
    const p = ladderPosition({ tiers: LADDER.tiers, escalateOn: [] }, tally(90, 10), SHAPE, VOCAB, CAT, ON);
    assert.equal(p.unknown, 'no-escalation-values-declared');
  });
});

describe('validateLadder — everything wrong before it ever runs', () => {
  const problems = (policy, vocabulary = VOCAB) =>
    validateLadder(policy, vocabulary, CAT, ON).map((p) => p.kind);

  it('catches the most expensive possible typo: escalating on a success', () => {
    /**
     * A ladder that escalates on `resolved` pays twice for work that already
     * worked, on every single call, while looking exactly like a cost-saving
     * measure in the config.
     */
    assert.ok(
      problems({ tiers: LADDER.tiers, escalateOn: ['resolved'] }).includes('escalate-on-a-success'),
    );
  });

  it('catches a ladder that would silently never fire', () => {
    assert.ok(
      problems({ tiers: LADDER.tiers, escalateOn: ['nobody-declared-this'] }).includes(
        'escalate-on-undeclared',
      ),
    );
  });

  it('catches rungs that go down', () => {
    // Not a ladder: a routing rule that escalates to something cheaper and
    // then reports a saving for it.
    assert.ok(
      problems({ tiers: ['claude-opus-5', 'claude-haiku-4-5'], escalateOn: ['escalated'] }).includes(
        'tiers-not-cheapest-first',
      ),
    );
  });

  it('catches one rung, a repeated rung and an unknown model', () => {
    assert.ok(problems({ tiers: ['claude-opus-5'], escalateOn: ['escalated'] }).includes('too-few-tiers'));
    assert.ok(
      problems({ tiers: ['claude-opus-5', 'claude-opus-5'], escalateOn: ['escalated'] }).includes(
        'duplicate-tier',
      ),
    );
    assert.ok(
      problems({ tiers: ['nope', 'claude-opus-5'], escalateOn: ['escalated'] }).includes('unknown-model'),
    );
  });

  it('reports everything at once rather than one error per run', () => {
    const all = problems({ tiers: ['claude-opus-5'], escalateOn: ['resolved', 'nope'] });
    assert.ok(all.length >= 3, `expected several problems, got ${all.join(', ')}`);
  });

  it('says nothing about a valid ladder', () => {
    assert.deepEqual(problems(LADDER), []);
  });
});
