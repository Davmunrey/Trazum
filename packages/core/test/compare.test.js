import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { comparePrompts, formatSignedUsd } from '../dist/index.js';

const USAGE = {
  model: 'claude-opus-5',
  callsPerMonth: 50_000,
  avgOutputTokens: 300,
  cacheHitRate: 0.9,
  batchEligible: false,
};

describe('the sign convention', () => {
  // Every figure in the rest of the codebase is a saving (before minus after).
  // Every figure here is a delta (after minus before). Mixing the two in one
  // report is the easiest way to make a cost tool lie, so this is pinned.
  it('positive means the prompt got worse', () => {
    const grew = comparePrompts('Summarise this.', `Summarise this. ${'Extra detail. '.repeat(40)}`, {
      usage: USAGE,
    });
    assert.ok(grew.tokenDelta > 0, 'a longer prompt should have a positive token delta');
    assert.ok(grew.deltaPct > 0);
    assert.ok(grew.monthlyDeltaUsd > 0, 'a longer prompt should cost more, not less');
    assert.ok(grew.perCallDeltaUsd > 0);
  });

  it('negative means the prompt got better', () => {
    const shrank = comparePrompts(`Summarise this. ${'Extra detail. '.repeat(40)}`, 'Summarise this.', {
      usage: USAGE,
    });
    assert.ok(shrank.tokenDelta < 0);
    assert.ok(shrank.monthlyDeltaUsd < 0);
    assert.ok(shrank.perCallDeltaUsd < 0);
  });

  it('is zero for an unchanged prompt', () => {
    const same = comparePrompts('Summarise this text.', 'Summarise this text.', { usage: USAGE });
    assert.equal(same.tokenDelta, 0);
    assert.equal(same.deltaPct, 0);
    assert.equal(same.monthlyDeltaUsd, 0);
  });

  it('formats a signed amount where the reader expects the sign', () => {
    // formatUsd renders a negative as "$-30.80", which reads as a typo.
    assert.equal(formatSignedUsd(30.8), '+$30.80');
    assert.equal(formatSignedUsd(-30.8), '-$30.80');
    assert.equal(formatSignedUsd(0), '$0');
  });

  it('does not divide by zero on an empty original', () => {
    const fromNothing = comparePrompts('', 'Summarise this text.', { usage: USAGE });
    assert.equal(fromNothing.deltaPct, 0);
    assert.ok(Number.isFinite(fromNothing.monthlyDeltaUsd));
  });
});

describe('what the comparison reports', () => {
  it('names rules that started firing', () => {
    const comparison = comparePrompts(
      'Summarise this text.',
      'Please summarise this text. Thank you.',
      { usage: USAGE },
    );
    assert.ok(comparison.rules.newlyFiring.includes('politeness'));
    assert.deepEqual(comparison.rules.noLongerFiring, []);
  });

  it('names rules that stopped firing', () => {
    const comparison = comparePrompts(
      'Please summarise this text. Thank you.',
      'Summarise this text.',
      { usage: USAGE },
    );
    assert.ok(comparison.rules.noLongerFiring.includes('politeness'));
  });

  it('names an advisory the edit introduced', () => {
    const before = 'Classify the ticket. Answer in English.';
    const after = 'Classify the ticket. Answer in English.\n\nRespond in the user language.';
    const comparison = comparePrompts(before, after, { usage: USAGE });
    assert.ok(comparison.advisories.appeared.includes('contradictory-instructions'));
  });

  it('names an advisory the edit resolved', () => {
    const before = 'Classify the ticket. Answer in English.\n\nRespond in the user language.';
    const after = 'Classify the ticket. Answer in English.';
    const comparison = comparePrompts(before, after, { usage: USAGE });
    assert.ok(comparison.advisories.resolved.includes('contradictory-instructions'));
  });
});

describe('what the figures are measured against', () => {
  const WORDY = `Please, in order to help me, ${'kindly summarise this text. '.repeat(10)}Thank you very much.`;

  it('measures the text as written by default', () => {
    // A pull request changed the file on disk, so the file on disk is what the
    // reviewer is being asked about. Optimising both sides first would hide a
    // prompt that doubled in length but happened to double in courtesy.
    const comparison = comparePrompts('Summarise this.', WORDY, { usage: USAGE });
    assert.ok(comparison.tokenDelta > 0, 'the written prompt grew and should say so');
  });

  it('measures the optimised text when asked', () => {
    const asWritten = comparePrompts('Summarise this.', WORDY, { usage: USAGE });
    const optimised = comparePrompts('Summarise this.', WORDY, {
      usage: USAGE,
      optimizeBoth: true,
    });
    assert.ok(
      optimised.tokenDelta < asWritten.tokenDelta,
      'optimising both sides should narrow the gap on a prompt that grew in courtesy',
    );
  });

  it('reports rule findings either way', () => {
    // The rule and advisory findings always come from a full optimise pass;
    // only the token and cost figures follow optimizeBoth.
    for (const optimizeBoth of [false, true]) {
      const comparison = comparePrompts('Summarise this.', WORDY, { usage: USAGE, optimizeBoth });
      assert.ok(comparison.rules.newlyFiring.length > 0, `optimizeBoth=${optimizeBoth}`);
    }
  });

  it('carries the usage profile it priced against', () => {
    const comparison = comparePrompts('a', 'b', { usage: USAGE });
    assert.equal(comparison.usage.callsPerMonth, 50_000);
    assert.equal(comparison.usage.model, 'claude-opus-5');
  });
});
