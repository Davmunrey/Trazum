import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BUNDLED_CATALOGUE, profileUsage, sessionCostShapes } from '../dist/index.js';

/**
 * Every part of a conversation's cost, and every position in its statistics.
 *
 * `session-cost.test.js` prices a conversation made of fresh input tokens and
 * nothing else, and takes its median over nine equal values and one spike.
 * Mutation testing (#690) showed what that leaves open. On 2026-11-17, in
 * `session-cost.ts`:
 *
 *   - a cache read could be *divided* by its multiplier instead of multiplied,
 *     and each of the three cache terms subtracted instead of added;
 *   - the median could take the wrong element, or the wrong pair, for any list
 *     whose middle values differ;
 *   - the 95th percentile could be the maximum under four different mistakes;
 *   - a call with no session could be counted as a conversation.
 *
 * None failed a test. Hand arithmetic throughout, on Claude Opus 5 as bundled
 * for the date below: $5 per million input tokens and $25 per million output,
 * a cache read at 0.1 of input, a five-minute write at 1.25, a one-hour write
 * at 2.
 */

const ON = new Date('2026-08-18T00:00:00Z');
const MILLION = 1_000_000;
const close = (actual, expected, what) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${what}: ${actual}, expected ${expected}`);

const call = (session, usage, label = 'chat') => JSON.stringify({ model: 'claude-opus-5', label, session, usage });
const profile = (lines) => profileUsage(lines.join('\n'), { catalogue: BUNDLED_CATALOGUE, on: ON });

/** Five conversations of one identical call: the least the report will describe. */
const five = (usage) => profile(Array.from({ length: 5 }, (_, i) => call(`s${i}`, usage))).sessionCosts[0];

/** One conversation per value, each a single call costing that many dollars of fresh input. */
const costing = (dollars) => profile(dollars.map((usd, i) => call(`s${i}`, { input_tokens: usd * 200_000, output_tokens: 0 })));

describe('each kind of token is billed at its own rate, and added', () => {
  it('bills a million cache-read tokens at a tenth of input: $0.50', () => {
    close(five({ input_tokens: 0, output_tokens: 0, cache_read_input_tokens: MILLION }).medianUsd, 0.5, 'cache read');
  });

  it('bills a million five-minute cache-write tokens at 1.25 of input: $6.25', () => {
    const shape = five({
      input_tokens: 0, output_tokens: 0, cache_creation: { ephemeral_5m_input_tokens: MILLION, ephemeral_1h_input_tokens: 0 },
    });
    close(shape.medianUsd, 6.25, 'five-minute write');
  });

  it('bills a million one-hour cache-write tokens at twice input: $10.00', () => {
    const shape = five({
      input_tokens: 0, output_tokens: 0, cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: MILLION },
    });
    close(shape.medianUsd, 10, 'one-hour write');
  });

  it('bills a million output tokens at the output rate: $25.00', () => {
    close(five({ input_tokens: 0, output_tokens: MILLION }).medianUsd, 25, 'output');
  });

  it('adds all five: $5.00 + $0.50 + $6.25 + $10.00 + $25.00 = $46.75', () => {
    const shape = five({
      input_tokens: MILLION,
      output_tokens: MILLION,
      cache_read_input_tokens: MILLION,
      cache_creation: { ephemeral_5m_input_tokens: MILLION, ephemeral_1h_input_tokens: MILLION },
    });
    close(shape.medianUsd, 46.75, 'one call');
    close(shape.totalUsd, 5 * 46.75, 'five conversations');
  });
});

describe('the median is the middle value, or the mean of the two middle values', () => {
  it('takes the third of five', () => {
    const [shape] = costing([5, 1, 4, 2, 3]).sessionCosts;
    close(shape.medianUsd, 3, 'median of 1..5');
  });

  it('takes the mean of the third and fourth of six', () => {
    const [shape] = costing([6, 1, 5, 2, 4, 3]).sessionCosts;
    close(shape.medianUsd, 3.5, 'median of 1..6');
  });

  it('takes the fourth of seven, where a middle chosen by thirds would not', () => {
    const [shape] = costing([7, 6, 5, 4, 3, 2, 1]).sessionCosts;
    close(shape.medianUsd, 4, 'median of 1..7');
  });

  it('sorts the turn counts before taking their median', () => {
    // Conversations of 3, 1, 2, 5 and 4 turns, in that order in the log. In
    // the order they arrived, or reversed, the middle one has 2.
    const lines = [];
    [3, 1, 2, 5, 4].forEach((turns, i) => {
      for (let turn = 0; turn < turns; turn += 1) lines.push(call(`s${i}`, { input_tokens: 200_000, output_tokens: 0 }));
    });
    const [shape] = profile(lines).sessionCosts;
    assert.equal(shape.medianTurns, 3);
    assert.equal(shape.calls, 15);
  });
});

describe('the 95th percentile is a conversation that happened, and not the dearest one', () => {
  // Twenty conversations costing $1 to $20. Nearest rank: 95% of twenty is the
  // nineteenth, which cost $19. Ten values cannot tell this from the maximum.
  const [shape] = costing(Array.from({ length: 20 }, (_, i) => 20 - i)).sessionCosts;

  it('is the nineteenth of twenty', () => {
    close(shape.p95Usd, 19, 'p95 of 1..20');
  });

  it('sits between the median and the maximum', () => {
    close(shape.medianUsd, 10.5, 'median of 1..20');
    close(shape.maxUsd, 20, 'maximum of 1..20');
  });

  it('is the twentieth of twenty-one, the first count at which the rank moves up', () => {
    const [more] = costing(Array.from({ length: 21 }, (_, i) => i + 1)).sessionCosts;
    close(more.p95Usd, 20, 'p95 of 1..21');
  });
});

describe('a call that belongs to no conversation is not a conversation', () => {
  it('leaves sessionless calls out of the count and out of the money', () => {
    const lines = Array.from({ length: 5 }, (_, i) => call(`s${i}`, { input_tokens: 200_000, output_tokens: 0 }));
    for (let i = 0; i < 3; i += 1) {
      lines.push(JSON.stringify({ model: 'claude-opus-5', label: 'chat', usage: { input_tokens: 2_000_000, output_tokens: 0 } }));
    }
    const [shape] = profile(lines).sessionCosts;
    assert.equal(shape.sessions, 5);
    assert.equal(shape.calls, 5);
    close(shape.totalUsd, 5, 'five $1.00 conversations');
  });
});

describe('slices are listed by money, and by name only to break a tie', () => {
  const slice = (label, usd) => Array.from({ length: 5 }, (_, i) => call(`${label}-${i}`, { input_tokens: usd * 200_000, output_tokens: 0 }, label));

  it('puts the dearer slice first even when its name sorts last', () => {
    const shapes = profile([...slice('alpha', 1), ...slice('zeta', 4)]).sessionCosts;
    assert.deepEqual(shapes.map((shape) => shape.label), ['zeta', 'alpha']);
  });

  it('orders two slices of equal cost by name, whichever the log mentioned first', () => {
    const shapes = profile([...slice('beta', 2), ...slice('alpha', 2)]).sessionCosts;
    assert.deepEqual(shapes.map((shape) => shape.label), ['alpha', 'beta']);
  });
});

describe('the list form gives the answer the streaming form gives', () => {
  it('prices a list of records as the same log read line by line', () => {
    const record = (session, inputTokens) => ({
      model: 'claude-opus-5',
      inputTokens,
      cacheReadTokens: 0,
      cacheWrite5mTokens: 0,
      cacheWrite1hTokens: 0,
      writeTtlKnown: true,
      outputTokens: 0,
      label: 'chat',
      outcome: null,
      session,
      ts: null,
      truncated: null,
    });
    const dollars = [1, 2, 3, 4, 5, 6];
    const fromList = sessionCostShapes(
      dollars.map((usd, i) => record(`s${i}`, usd * 200_000)),
      { catalogue: BUNDLED_CATALOGUE, on: ON },
    );
    assert.deepEqual(fromList, costing(dollars).sessionCosts);
    assert.equal(fromList.length, 1);
    close(fromList[0].medianUsd, 3.5, 'median of 1..6');
  });
});
