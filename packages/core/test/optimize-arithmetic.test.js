import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DEFAULT_USAGE, catalogueFromOverlay, optimize, withExactTokenCounts } from '../dist/index.js';

/**
 * The numbers an optimisation reports, by hand.
 *
 * Mutation testing (#690) showed that the suite held what `optimize` does to
 * a prompt far better than what it says about it. On 2026-11-17, in
 * `optimize.ts`, no test failed when:
 *
 *   - the tokens saved became the tokens before *plus* the tokens after;
 *   - the percentage reduced became a hundredth of itself, or stopped being
 *     computed at all;
 *   - a rule that fired on two passes reported only its second;
 *   - any of the assumed usage figures moved, which every dollar amount in a
 *     report is multiplied by;
 *   - a result said its counts were an estimate when a counter had been given.
 *
 * Every count here comes from a counter that returns the number of
 * characters, so each expected figure can be read off the strings.
 */

const characters = (text) => text.length;

describe('the usage a report assumes when it is told nothing', () => {
  it('is a thousand calls a month of 500 output tokens, cached nine times in ten, not batched', () => {
    // The README says which of these a reader will see; this is what holds it.
    assert.deepEqual(
      { ...DEFAULT_USAGE, model: null },
      { model: null, callsPerMonth: 1000, avgOutputTokens: 500, cacheHitRate: 0.9, batchEligible: false },
    );
  });

  it('is what a report carries, with anything the caller gave laid over it', () => {
    assert.deepEqual(optimize('Summarise this text.').usage, DEFAULT_USAGE);
    assert.deepEqual(optimize('Summarise this text.', { usage: { callsPerMonth: 7 } }).usage, {
      ...DEFAULT_USAGE,
      callsPerMonth: 7,
    });
  });
});

describe('the counts of one optimisation', () => {
  // "Please " goes: 27 characters become 20.
  const result = optimize('Please summarise this text.', { tokenCounter: characters });

  it('counts the prompt before and after with the counter it was given', () => {
    assert.equal(result.optimized, 'Summarise this text.');
    assert.equal(result.tokensBefore, 27);
    assert.equal(result.tokensAfter, 20);
  });

  it('reports the difference as saved, and as a share of the count before', () => {
    assert.equal(result.tokensSaved, 7);
    assert.ok(Math.abs(result.reductionPct - (7 / 27) * 100) < 1e-9, String(result.reductionPct));
  });

  it('credits the rule that did it with what it saved', () => {
    assert.deepEqual(result.rules.map((rule) => [rule.id, rule.hits, rule.tokensSaved]), [['politeness', 1, 7]]);
  });

  it('says whose counts these are', () => {
    assert.equal(result.tokenSource, 'external');
    assert.equal(optimize('Please summarise this text.').tokenSource, 'heuristic');
  });

  it('reports 100% for a prompt of one token that becomes none, and 0% for no prompt', () => {
    const blank = optimize(' ', { tokenCounter: characters });
    assert.deepEqual([blank.tokensBefore, blank.tokensAfter, blank.reductionPct], [1, 0, 100]);
    const empty = optimize('', { tokenCounter: characters });
    assert.deepEqual([empty.tokensBefore, empty.tokensSaved, empty.reductionPct], [0, 0, 0]);
  });
});

describe('a rule that fires on two passes is reported once, with both', () => {
  // Pass one: the repeated first line goes (38 characters with its line
  // end), and then "IMPORTANT: " goes (11), which makes the last two lines
  // equal. Pass two: the repeat that has just appeared goes (32).
  const prompt = [
    'Return the answer as valid JSON only.',
    'Return the answer as valid JSON only.',
    'Write every date in ISO format.',
    'IMPORTANT: Write every date in ISO format.',
  ].join('\n');
  const result = optimize(prompt, { level: 'aggressive', tokenCounter: characters });

  it('reaches the text a second run would not change', () => {
    assert.equal(result.optimized, 'Return the answer as valid JSON only.\nWrite every date in ISO format.');
    assert.equal(optimize(result.optimized, { level: 'aggressive' }).optimized, result.optimized);
  });

  it('adds the second pass to the first: two hits, 38 + 32 characters, two changes', () => {
    const lines = result.rules.find((rule) => rule.id === 'duplicate-lines');
    assert.equal(lines.hits, 2);
    assert.equal(lines.tokensSaved, 70);
    assert.equal(lines.changes.length, 2);
  });

  it('accounts for every character that went: 70 + 11 = 81 of 150', () => {
    assert.deepEqual(result.rules.map((rule) => [rule.id, rule.tokensSaved]), [['duplicate-lines', 70], ['emphasis', 11]]);
    assert.equal(result.tokensSaved, 81);
    assert.equal(result.rules.reduce((sum, rule) => sum + rule.tokensSaved, 0), result.tokensSaved);
  });

  it('credits a rule with nothing when the counter says nothing was saved', () => {
    // A counter that cannot tell the texts apart. The rules still fire; a
    // saving of zero is zero, on the first application and on the second.
    const flat = optimize(prompt, { level: 'aggressive', tokenCounter: () => 10 });
    assert.deepEqual(flat.rules.map((rule) => [rule.id, rule.hits, rule.tokensSaved]), [
      ['duplicate-lines', 2, 0],
      ['emphasis', 1, 0],
    ]);
    assert.equal(flat.tokensSaved, 0);
  });
});

describe('a prompt is given back whole whatever is in it', () => {
  it('keeps every protected span when there are more of them than masks', () => {
    // 6,143 masks exist. Past that a span is left in place unmasked, and the
    // text around it must still be put together as text.
    const prompt = Array.from({ length: 6200 }, (_, index) => `Use \`k${index}\` now.`).join('\n');
    assert.equal(optimize(prompt).optimized, prompt);
  });

  it('leaves alone a character sequence that looks like one of its own masks', () => {
    const lookalike = '';
    const result = optimize(`Keep ${lookalike} as it is.`);
    assert.ok(result.optimized.includes(lookalike), JSON.stringify(result.optimized));
    assert.equal(result.optimized.includes('undefined'), false);
  });
});

describe('recounting with an exact counter recomputes every figure', () => {
  const estimated = optimize('Please summarise this text.');

  it('replaces the counts, the saving and the percentage', async () => {
    const exact = await withExactTokenCounts(estimated, async (text) => text.length);
    assert.deepEqual([exact.tokensBefore, exact.tokensAfter, exact.tokensSaved], [27, 20, 7]);
    assert.ok(Math.abs(exact.reductionPct - (7 / 27) * 100) < 1e-9, String(exact.reductionPct));
    assert.equal(exact.tokenSource, 'external');
  });

  it('reports 100% for one token that became none, and 0% for no prompt', async () => {
    const blank = await withExactTokenCounts(optimize(' '), async (text) => text.length);
    assert.deepEqual([blank.tokensBefore, blank.tokensAfter, blank.reductionPct], [1, 0, 100]);
    const empty = await withExactTokenCounts(optimize(''), async (text) => text.length);
    assert.deepEqual([empty.tokensSaved, empty.reductionPct], [0, 0]);
  });

  it('refuses the bundled prices for a result priced with one added model', async () => {
    // One model added and none overridden is still an overlay.
    const pricing = catalogueFromOverlay(JSON.stringify({
      lastReviewed: '2027-01-15',
      models: {
        'claude-future-6': {
          displayName: 'Claude Future 6',
          inputPerMTok: 2,
          outputPerMTok: 8,
          contextWindow: 2_000_000,
          cacheMinTokens: 256,
          capability: 'large',
        },
      },
    }));
    assert.deepEqual([pricing.addedModels.length, pricing.overriddenModels.length], [1, 0]);
    const result = optimize('Please summarise this text.', { usage: { model: 'claude-future-6' }, pricing });
    await assert.rejects(
      withExactTokenCounts(result, async (text) => text.length),
      /needs the same catalogue passed as its third argument/,
    );
    const recounted = await withExactTokenCounts(result, async (text) => text.length, pricing);
    assert.equal(recounted.tokensSaved, 7);
  });
});
