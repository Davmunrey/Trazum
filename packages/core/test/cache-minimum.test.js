import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildAdvisories, estimateTokens } from '../dist/index.js';

/**
 * `below-cache-minimum`, and the estimate it used to assert from.
 *
 * The advisory compares the *estimated* stable prefix against a hard threshold —
 * 512 tokens on Claude Opus 5 — and then tells the reader caching will not work.
 * On a prefix near that line an underestimate makes that wrong advice rather than
 * an imprecise figure, and it costs them the largest saving Trazum offers.
 *
 * So near the line it hedges, and only when the number is an estimate.
 */

const USAGE = {
  model: 'claude-opus-5',
  callsPerMonth: 10_000,
  avgOutputTokens: 500,
  cacheHitRate: 0.9,
  batchEligible: false,
};

const HEDGE = /estimate and it is close to the line/;
const promptOf = (repeats) =>
  `${'You are a support assistant and the reply is for the customer. '.repeat(repeats)}\n\nCustomer query: {{query}}`;

const advisoryFor = (prompt, options) =>
  buildAdvisories(prompt, estimateTokens(prompt), USAGE, options).find(
    (a) => a.id === 'below-cache-minimum',
  );

describe('below-cache-minimum hedges near the threshold', () => {
  it('warns that the real prefix may already be over the line', () => {
    // 28 repetitions puts the stable prefix just under 512, which is exactly the
    // case where a -9% estimate could be hiding a prefix that does cache.
    const advisory = advisoryFor(promptOf(28));
    assert.ok(advisory, 'the fixture no longer lands below the minimum — retune it');
    assert.match(advisory.detail, HEDGE);
    assert.match(advisory.detail, /--exact-tokens/, 'does not name the way to settle it');
    assert.match(advisory.detail, /free/, 'does not say the counting endpoint costs nothing');
  });

  it('says nothing extra when the prefix is genuinely far below', () => {
    // Hedging every case would make the hedge noise, and this prompt is not near
    // anything: no estimate error of the measured size reaches the threshold.
    const advisory = advisoryFor(promptOf(20));
    assert.ok(advisory, 'expected the advisory for a short prefix');
    assert.doesNotMatch(advisory.detail, HEDGE);
  });

  it('does not hedge a number the caller measured', () => {
    /**
     * A caller who supplied their own counter — `--exact-tokens`, or the official
     * endpoint — has an authoritative figure. Telling them it might be wrong is
     * its own kind of dishonesty, and it would push them toward a check they have
     * already done.
     */
    const exact = (text) => estimateTokens(text);
    const advisory = advisoryFor(promptOf(28), { count: exact });
    assert.ok(advisory, 'expected the advisory');
    assert.doesNotMatch(advisory.detail, HEDGE);
  });

  it('hedges in Spanish too', () => {
    const advisory = advisoryFor(promptOf(28), { locale: 'es' });
    assert.ok(advisory);
    assert.match(advisory.detail, /una estimación y está cerca del límite/);
  });
});
