import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ESTIMATE_ERROR_BAND_PCT,
  analyzeCachePrefix,
  buildAdvisories,
  estimateTokens,
  getModel,
  reorderForCache,
} from '../dist/index.js';

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

describe('prompt-caching hedges above the line, not only below it', () => {
  /**
   * An asymmetry that was a real gap, found by asking whether the bug just fixed
   * in `cache-prefix-reorder` had a twin.
   *
   * `below-cache-minimum` hedges when an estimated prefix lands just *under* the
   * threshold: the real one may already be over, and refusing to mention the
   * largest saving Trazum offers on the strength of a ±10% figure is wrong advice.
   *
   * `prompt-caching` did not hedge when an estimate landed just *over* it. With a
   * ±10% band an estimated 528-token prefix can truly be 475, in which case
   * nothing caches and the dollar figure printed beside the advisory is
   * uncollectable. Same fault as the reorder advisory, opposite direction, and the
   * direction with money attached is the one that needed it more.
   */
  const HEDGE = /close to the line/;
  const cachingFor = (prompt, options = {}) =>
    buildAdvisories(prompt, estimateTokens(prompt), USAGE, options).find(
      (a) => a.id === 'prompt-caching',
    );

  it('warns when the real prefix may be under the minimum after all', () => {
    // 29 repetitions estimates ~528 against a 512 minimum, so the low end of the
    // band is ~475 — under the line, and the saving would not exist.
    const advisory = cachingFor(promptOf(29));
    assert.ok(advisory, 'the fixture no longer clears the minimum — retune it');
    assert.match(advisory.detail, HEDGE);
    assert.match(advisory.detail, /--exact-tokens/, 'does not name the way to settle it');
    assert.match(advisory.detail, /free/, 'does not say the counting endpoint costs nothing');
    // The figure is still offered — the hedge qualifies it rather than withdrawing
    // it, because the prefix probably does clear the line.
    assert.ok((advisory.estimatedMonthlyUsd ?? 0) > 0, 'the saving vanished instead of being qualified');
  });

  it('says nothing extra when the prefix is comfortably over', () => {
    // Hedging every case makes the hedge noise. No error of the measured size
    // brings this prefix near the threshold.
    const advisory = cachingFor(promptOf(40));
    assert.ok(advisory, 'expected the advisory for a long prefix');
    assert.doesNotMatch(advisory.detail, HEDGE);
  });

  it('does not hedge a number the caller measured', () => {
    /**
     * Same rule as `below-cache-minimum`. A caller who supplied their own counter
     * has an authoritative prefix, and telling them it might be wrong pushes them
     * toward a check they have already done — which is its own kind of dishonesty.
     */
    const prompt = promptOf(29);
    const exact = buildAdvisories(prompt, 528, USAGE, { count: () => 528 }).find(
      (a) => a.id === 'prompt-caching',
    );
    assert.ok(exact, 'expected the advisory with an exact counter');
    assert.doesNotMatch(exact.detail, HEDGE);
  });

  it('hedges in both directions across the whole window', () => {
    /**
     * The property rather than two samples of it. Somewhere around the threshold
     * every prompt is either told "below the minimum, but maybe not" or "above it,
     * but maybe not" — and there must be no size that gets a bare, unqualified
     * claim while the band still straddles the line.
     */
    const min = MODEL.cacheMinTokens ?? 0;
    const band = ESTIMATE_ERROR_BAND_PCT / 100;
    const unqualified = [];

    for (let reps = 20; reps <= 40; reps += 1) {
      const prompt = promptOf(reps);
      const all = buildAdvisories(prompt, estimateTokens(prompt), USAGE, {});
      const advisory =
        all.find((a) => a.id === 'prompt-caching') ??
        all.find((a) => a.id === 'below-cache-minimum');
      if (!advisory) continue;

      /**
       * Read from the analysis, not parsed out of the prose. The first version of
       * this scraped `~528` from the sentence and defaulted to "straddles" when
       * the regex missed, which reported two failures against correct behaviour —
       * a test asserting its own parsing rather than the property.
       */
      const prefix = analyzeCachePrefix(prompt, estimateTokens).stablePrefixTokens;
      const straddles = prefix * (1 - band) < min && prefix * (1 + band) >= min;
      if (straddles && !HEDGE.test(advisory.detail)) unqualified.push(`${reps} (prefix ~${prefix})`);
    }

    assert.deepEqual(
      unqualified,
      [],
      `these sizes make an unqualified claim while the band straddles the minimum: ${unqualified.join(', ')}`,
    );
  });
});

describe('the context window is an estimate against a hard edge too', () => {
  /**
   * The third place a ±10% number was compared against a threshold and the answer
   * stated as fact, after `cache-prefix-reorder` and `prompt-caching`. This one
   * carries no dollar figure and is the most absolute of the three:
   * **"The call will fail."**
   *
   * It is wrong in both directions. An estimated 205,000 tokens against a 200,000
   * window can truly be 184,500 — the call succeeds, and the reader has been sent
   * to split a prompt that fitted. An estimated 199,000 can truly be 218,900,
   * which does not fit, and **nothing warned at all**.
   *
   * The silent direction is the worse one. A prompt over the window fails outright
   * rather than degrading, so there is no partial result to notice and no other
   * advisory covers it.
   */
  const HAIKU = getModel('claude-haiku-4-5');
  const WINDOW = HAIKU.contextWindow;
  const USAGE_H = { ...USAGE, model: 'claude-haiku-4-5' };

  const contextIdsFor = (tokens, options = {}) =>
    buildAdvisories('x', tokens, USAGE_H, options)
      .map((a) => a.id)
      .filter((id) => id.startsWith('context'));

  it('warns when an estimate fits but its error range does not', () => {
    // The gap that was silent. Under the window, band reaching over it.
    const tokens = Math.round(WINDOW * 0.97);
    assert.ok(tokens < WINDOW, 'the fixture no longer fits');
    assert.deepEqual(contextIdsFor(tokens), ['context-near-limit']);
  });

  it('says nothing when the estimate is comfortably inside', () => {
    // Warning on every prompt would make the warning noise. No error of the
    // measured size brings this one near the edge.
    assert.deepEqual(contextIdsFor(Math.round(WINDOW * 0.5)), []);
  });

  it('softens "the call will fail" when the estimate is barely over', () => {
    const advisory = buildAdvisories('x', Math.round(WINDOW * 1.02), USAGE_H, {}).find(
      (a) => a.id === 'context-overflow',
    );
    assert.ok(advisory, 'the overflow advisory stopped firing');
    assert.match(advisory.title, /probably/, 'it still states a prediction as a fact');
    assert.match(advisory.detail, /--exact-tokens/, 'it does not name the way to settle it');
  });

  it('keeps stating it flatly when nothing could rescue the prompt', () => {
    // Far over the line, no band reaches back. Hedging here would be its own
    // dishonesty: the call does fail.
    const advisory = buildAdvisories('x', WINDOW * 2, USAGE_H, {}).find(
      (a) => a.id === 'context-overflow',
    );
    assert.doesNotMatch(advisory.title, /probably/);
    assert.match(advisory.detail, /will fail/);
  });

  it('does not hedge, or warn, about a number the caller measured', () => {
    /**
     * The same rule the other two advisories follow. An exact count near the edge
     * is not uncertain, so `context-near-limit` must not fire at all and the
     * overflow message must not soften — telling somebody their measurement might
     * be wrong pushes them toward a check they have already done.
     */
    const near = Math.round(WINDOW * 0.97);
    assert.deepEqual(contextIdsFor(near, { count: () => near }), []);

    const over = Math.round(WINDOW * 1.02);
    const advisory = buildAdvisories('x', over, USAGE_H, { count: () => over }).find(
      (a) => a.id === 'context-overflow',
    );
    assert.doesNotMatch(advisory.title, /probably/, 'it hedged an exact count');
  });

  it('leaves no silent gap anywhere around the edge', () => {
    /**
     * The property, swept. Every size whose band crosses the window must produce
     * some context advisory — the fault was a range of sizes where none did, and
     * only a sweep shows the seam between "fits" and "does not" is covered.
     */
    const band = ESTIMATE_ERROR_BAND_PCT / 100;
    const silent = [];
    for (let pct = 80; pct <= 125; pct += 1) {
      const tokens = Math.round((WINDOW * pct) / 100);
      const straddles = tokens * (1 - band) <= WINDOW && tokens * (1 + band) > WINDOW;
      if (straddles && contextIdsFor(tokens).length === 0) silent.push(`${pct}%`);
    }

    assert.deepEqual(
      silent,
      [],
      `these sizes straddle the window and produce no warning: ${silent.join(', ')}`,
    );
  });
});
