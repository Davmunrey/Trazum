import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildAdvisories, estimateTokens, getModel, reorderForCache } from '../dist/index.js';

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
const MODEL = getModel('claude-opus-5');
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

describe('cache-prefix-reorder cannot promise what caching will not give', () => {
  /**
   * Two advisories were contradicting each other in the same report, and the one
   * with a dollar sign was winning.
   *
   * `cache-prefix-reorder` fired whenever enough stable content sat after the
   * first placeholder, and priced moving it forward at 90% off. It never asked
   * whether the prefix that rearrangement would build actually clears the model's
   * cacheable minimum. On a 306-token support prompt against Claude Opus 5's
   * 512-token minimum the best possible prefix is 302 — nothing caches — and the
   * advisory offered **$48.67 a month that cannot be collected**, in the same
   * report as `below-cache-minimum` saying caching would not work here at all.
   *
   * `reorderForCache` had refused these prompts from the start, for precisely this
   * reason. So Trazum's advice and Trazum's action disagreed: take the advice, run
   * `--reorder`, watch nothing happen.
   *
   * A money figure in the flattering direction is the one fault this file exists
   * to catch.
   */

  /** Stable content after the placeholder, sized by how much of it there is. */
  const promptWithTrailingRules = (rules) =>
    `You are a support assistant for Acme Corp.\n\nCustomer question: {{question}}\n\n${Array.from(
      { length: rules },
      (_, i) =>
        `Rule ${i + 1}: when the customer mentions a topic in category ${i + 1}, check the internal policy index first and then answer with the confirmed wording only, never paraphrasing the legal text.`,
    ).join('\n')}\n`;

  const advisories = (prompt) => buildAdvisories(prompt, estimateTokens(prompt), USAGE, {});
  const idsOf = (prompt) => advisories(prompt).map((a) => a.id);

  it('never offers a saving the reorder command would refuse to deliver', () => {
    /**
     * The invariant, and it took two attempts to state.
     *
     * The first version asserted that `cache-prefix-reorder` and
     * `below-cache-minimum` never appear together — and that was wrong about the
     * product, not about the code. On a prompt with plenty of movable content both
     * are true and both are useful: "as written this does not cache" followed by
     * "move these blocks and it will" is a diagnosis and its fix, not a
     * contradiction. Sweeping the sizes proved the pair is normal, which is how the
     * bad premise surfaced.
     *
     * What was actually broken is narrower and worse: the advisory priced a
     * rearrangement that `reorderForCache` — in the same package, on the same
     * prompt — refuses to perform, because no ordering of that prompt clears the
     * minimum. Advice and action disagreeing, with money on the advice side.
     *
     * So the property is one-directional, and the direction matters. **If the
     * report offers the saving, the command must deliver movement.** The converse
     * is not required and asserting it was the second wrong premise: below 200
     * movable tokens the advisory stays deliberately quiet, because a forty-token
     * rearrangement is not worth a line in a report — while the command remains
     * available to anyone who asks for it. Silence about a small win is not the
     * same fault as a promise about an impossible one.
     */
    const disagreements = [];
    for (let rules = 0; rules <= 30; rules += 1) {
      const prompt = promptWithTrailingRules(rules);
      const offered = idsOf(prompt).includes('cache-prefix-reorder');
      if (!offered) continue;
      // The floor the CLI passes. `reorderForCache` takes the minimum as a
      // parameter rather than reading a catalogue, so a test that omits it is
      // testing a configuration nothing ships — which is how this test first
      // reported eight failures against working code.
      const moved = reorderForCache(prompt, {
        minPrefixTokens: MODEL.cacheMinTokens ?? 0,
      }).moved.length;
      if (moved === 0) {
        disagreements.push(`${rules} rules: the report offers a saving the command refuses`);
      }
    }

    assert.deepEqual(
      disagreements,
      [],
      `the advice and the action disagree:\n  ${disagreements.join('\n  ')}`,
    );
  });

  it('stays quiet when no rearrangement could clear the minimum', () => {
    // Small enough that the whole prompt is under the threshold, so moving every
    // movable token forward still caches nothing.
    const prompt = promptWithTrailingRules(6);
    const ids = idsOf(prompt);
    assert.ok(ids.includes('below-cache-minimum'), 'the fixture is no longer below the minimum');
    assert.ok(
      !ids.includes('cache-prefix-reorder'),
      'it offered a saving on a prompt that cannot cache at any ordering',
    );
  });

  it('fires when the rearrangement genuinely reaches the minimum', () => {
    // The other half. A gate that never opens is not a fix, it is a deletion.
    const prompt = promptWithTrailingRules(25);
    const advisory = advisories(prompt).find((a) => a.id === 'cache-prefix-reorder');
    assert.ok(advisory, 'a prompt with plenty of movable content got no advisory');
    assert.ok(
      (advisory.estimatedMonthlyUsd ?? 0) > 0,
      'the advisory fired without a saving attached',
    );
  });

  it('names the command that does it, because Trazum can', () => {
    /**
     * It described the rearrangement in prose and left the reader to perform it by
     * hand, while `reorderForCache` sat in the same package able to attempt it —
     * whole blocks only, refusing any block that refers back to earlier text.
     *
     * An advisory that withholds the command is the shape of the whole product
     * problem: Trazum knowing something worth more than what it does about it.
     */
    const advisory = advisories(promptWithTrailingRules(25)).find(
      (a) => a.id === 'cache-prefix-reorder',
    );
    assert.match(advisory.detail, /--reorder/, 'the advisory does not name the command');
    // And it still says to read the diff, because this one moves text.
    assert.match(advisory.detail, /diff/i, 'it no longer tells the reader to check the result');
  });
});
