import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ESTIMATE_ERROR_BAND_PCT,
  buildAdvisories,
  estimateTokens,
  listModels,
} from '../dist/index.js';

/**
 * Every hard threshold in the catalogue, checked against the estimate that meets it.
 *
 * **This exists because the same fault was found and fixed three times.** Trazum
 * compares token counts against thresholds that are absolute — a model's cacheable
 * minimum, its context window — while the counts themselves carry a ±10% band. Each
 * comparison therefore has two failure modes:
 *
 * - **the loud one**: state the answer as a fact when the band reaches the other
 *   side of the line, so the report asserts something that may not be true;
 * - **the quiet one**: say nothing at all, because the estimate landed on the
 *   comfortable side while the truth may be on the other.
 *
 * The three that shipped:
 *
 * 1. `cache-prefix-reorder` priced a rearrangement without checking the prefix it
 *    would build could clear the minimum — $48.67 a month that could not be
 *    collected, printed beside `below-cache-minimum` saying caching would not work.
 * 2. `prompt-caching` hedged an estimate landing just *under* the minimum and
 *    promised money on one landing just *over* it.
 * 3. `context-overflow` said "the call will fail" as a certainty, and said nothing
 *    at all when an estimate that fitted might really not.
 *
 * Each was fixed where it was found. Fixing a fault three times is evidence it will
 * recur, so this asserts the **property** instead: derived from the pricing
 * catalogue rather than from a list of thresholds typed here, so a model added with
 * a new window or minimum is covered without anybody remembering to.
 *
 * The assertion is deliberately weak about *wording* and strong about *presence*.
 * It does not care what the caveat says, only that a report facing a threshold its
 * own error band straddles admits the uncertainty somewhere. Pinning the phrasing
 * would make this a copy test, and copy changes without a version bump.
 *
 * **What it covers, stated exactly.** Reintroducing faults 2 and 3 fails this file,
 * both halves of 3 included. Fault 1 does **not** — and that is a boundary rather
 * than a hole. Its property is different: not "does the report admit uncertainty"
 * but "does the report offer a saving the tool would refuse to deliver", which is
 * checked by the advice-matches-action sweep in `cache-minimum.test.js`. Two
 * properties, two tests, and saying so beats implying one file guards everything.
 *
 * The first version of this file also skipped when no relevant finding existed,
 * which meant it missed the quiet half of fault 3 — the exact bug it was written
 * for. Silence is a failure here now. That mistake is recorded at the assertion
 * rather than in a commit message, because it is the kind that gets made again.
 */

const BAND = ESTIMATE_ERROR_BAND_PCT / 100;

/** Words that count as admitting the number might be on the other side. */
const ADMITS_UNCERTAINTY = /close to the line|may be|might|probably|reaches past|error range|--exact-tokens/;

const usageFor = (model) => ({
  model: model.id,
  callsPerMonth: 50_000,
  avgOutputTokens: 500,
  cacheHitRate: 0.9,
  batchEligible: false,
});

/**
 * Two ways in, because the two thresholds read different inputs.
 *
 * The first version of this passed a bare token count with a placeholder prompt for
 * both, and that shortcut broke the thing it was measuring: the cache advisories
 * reason about the **stable prefix of the actual text**, not the total handed in, so
 * a two-token prompt labelled 486 tokens was nowhere near any minimum and the test
 * reported eighteen failures against correct code.
 *
 * A test that feeds an advisory something other than what it reasons about is
 * measuring its own fixture.
 */

/** The context advisories read the count directly, so a number is the real input. */
const reportForCount = (model, tokens) => buildAdvisories('x {{q}}', tokens, usageFor(model), {});

/**
 * The cache advisories read the prompt, so this builds one whose stable prefix —
 * everything before the first placeholder — lands as close to `target` as a whole
 * number of sentences allows.
 */
const promptWithPrefix = (target) => {
  const sentence = 'You are a support assistant and the reply is for the customer. ';
  let text = '';
  while (estimateTokens(text) < target) text += sentence;
  return `${text}\n\nCustomer query: {{query}}`;
};

const reportForPrefix = (model, target) => {
  const prompt = promptWithPrefix(target);
  return buildAdvisories(prompt, estimateTokens(prompt), usageFor(model), {});
};

describe('no threshold produces an unqualified claim', () => {
  const models = listModels();

  it('covers every model in the catalogue', () => {
    // Derived, not typed. A catalogue this test silently stopped reading would
    // report success over nothing at all.
    assert.ok(models.length >= 10, `only ${models.length} models — is listModels still working?`);
    assert.ok(
      models.some((m) => m.contextWindow > 0),
      'no model declares a context window',
    );
  });

  for (const model of listModels()) {
    describe(model.id, () => {
      /**
       * Thresholds this model actually has. `cacheMinTokens` is null on providers
       * whose caching nobody recorded, and advising anything about a threshold that
       * does not exist would be the invention this repository refuses.
       */
      const thresholds = [
        ['context window', model.contextWindow],
        ['cacheable minimum', model.cacheMinTokens],
      ].filter(([, value]) => typeof value === 'number' && value > 0);

      for (const [name, threshold] of thresholds) {
        it(`admits uncertainty on both sides of the ${name}`, () => {
          /**
           * Sampled just inside the band on each side, which is where the fault
           * lived. A point far from the line is a different case and already
           * covered: it should be flat, not hedged.
           */
          const straddling = [
            Math.round(threshold * (1 - BAND * 0.5)),
            Math.round(threshold * (1 + BAND * 0.5)),
          ];

          const isWindow = name === 'context window';
          for (const tokens of straddling) {
            if (tokens < 1) continue;
            const advisories = isWindow
              ? reportForCount(model, tokens)
              : reportForPrefix(model, tokens);
            // Only the findings that reason about this threshold can be expected to
            // mention it. A prompt near a cache minimum says nothing about windows.
            const relevant = advisories.filter((a) =>
              isWindow ? a.id.startsWith('context') : a.id.includes('cach'),
            );

            /**
             * **Silence is a failure here, not a skip**, and getting that wrong is
             * how the first version of this guard missed the very bug it was written
             * for. It skipped when no relevant finding existed — which is precisely
             * the quiet failure mode: an estimate landing on the comfortable side of
             * a line the truth may be over, and nothing said at all. Deleting the
             * near-limit advisory left this test green.
             *
             * The one legitimate silence is a threshold the model does not have. A
             * provider whose caching nobody recorded gets no caching advice, because
             * advising about a mechanism that may not exist is the invention this
             * repository refuses.
             */
            const applies = isWindow || (model.caching !== 'none' && model.cacheMinTokens !== null);
            if (!applies) continue;

            assert.ok(
              relevant.length > 0,
              `${model.id} at ${tokens.toLocaleString()} tokens is within the band of its ` +
                `${threshold.toLocaleString()}-token ${name} and says nothing about it. ` +
                'Silence is the dangerous half of this fault: the estimate landed on the ' +
                'comfortable side and the truth may be over the line.',
            );

            assert.ok(
              relevant.some((a) => ADMITS_UNCERTAINTY.test(`${a.title} ${a.detail}`)),
              `${model.id} at ${tokens.toLocaleString()} tokens is within the band of its ` +
                `${threshold.toLocaleString()}-token ${name}, and every finding states its ` +
                `answer flatly:\n  ${relevant.map((a) => `${a.id}: ${a.title}`).join('\n  ')}`,
            );
          }
        });
      }
    });
  }
});
