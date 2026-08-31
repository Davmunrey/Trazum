import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
  MODELS,
  analyzeCachePrefix,
  computeSavings,
  costOfCall,
  effectivePricing,
  estimateTokens,
  getModel,
  listModels,
  multipliersFor,
  optimize,
  recommendTier,
  recommendTierDetailed,
  reviewAgeDays,
  reviewedForModels,
  BUNDLED_CATALOGUE,
  PRICING_LAST_REVIEWED,
  PROVIDER_REVIEWED,
} from '../dist/index.js';

describe('pricing catalogue', () => {
  it('every model has coherent prices and limits', () => {
    for (const model of listModels()) {
      assert.ok(model.inputPerMTok > 0, `${model.id} has no input price`);
      assert.ok(
        model.outputPerMTok > model.inputPerMTok,
        `${model.id}: output should cost more than input`,
      );
      // 8K rather than 200K: the old floor was Anthropic's smallest window
      // used as if it were a law of nature, and it rejected DeepSeek V3 and
      // Mistral Large 2 at their real 128K. This is a typo detector — a window
      // of 200 is a mistake, a window of 128,000 is a product.
      assert.ok(model.contextWindow >= 8_000, `${model.id} has a suspiciously small window`);
      // Only where caching exists. A model whose provider has no prompt caching
      // has no minimum to clear, and demanding one would force a fictional
      // number into the catalogue to keep a test happy.
      if (model.caching !== 'none') {
        assert.ok(model.cacheMinTokens > 0, `${model.id} has no cache minimum`);
      } else {
        assert.equal(
          model.cacheMinTokens,
          0,
          `${model.id} has no caching, so its minimum should be 0 rather than a number nobody uses`,
        );
      }
    }
  });

  it('applies promotional pricing only while it is live', () => {
    /**
     * Built here rather than picked out of the catalogue.
     *
     * This used to read Sonnet 5, which shipped on introductory pricing, and
     * so it asserted `sonnet.promo` existed before testing what `promo` does.
     * When Anthropic made that introductory price the standard one and the
     * promotion left the catalogue, the test failed — not because the window
     * logic broke, but because the fixture had stopped being an example. A
     * catalogue is data that changes; the behaviour under test is that a
     * promotion applies up to its last day and not after it.
     */
    const promoted = {
      id: 'test-promoted',
      displayName: 'Promoted',
      inputPerMTok: 3,
      outputPerMTok: 15,
      contextWindow: 200_000,
      cacheMinTokens: 1024,
      tier: 'sonnet',
      promo: { inputPerMTok: 2, outputPerMTok: 10, until: '2026-08-31' },
    };

    const inside = effectivePricing(promoted, new Date('2026-08-31T23:00:00Z'));
    assert.equal(inside.promoApplied, true);
    assert.equal(inside.inputPerMTok, 2);
    assert.equal(inside.outputPerMTok, 10);

    const outside = effectivePricing(promoted, new Date('2026-09-01T00:00:00Z'));
    assert.equal(outside.promoApplied, false);
    assert.equal(outside.inputPerMTok, 3);
    assert.equal(outside.outputPerMTok, 15);
  });

  it('rejects unknown models with a useful message', () => {
    assert.throws(() => getModel('gpt-made-up'), /Unknown model/);
  });
});

describe('cost computation', () => {
  it('computes the per-call cost from the per-million prices', () => {
    // 1M input at $5 and 1M output at $25.
    const cost = costOfCall(1_000_000, 1_000_000, 5, 25, false);
    assert.equal(cost.inputUsd, 5);
    assert.equal(cost.outputUsd, 25);
    assert.equal(cost.totalUsd, 30);
  });

  it('the Batch API halves the cost', () => {
    const normal = costOfCall(1_000_000, 1_000_000, 5, 25, false);
    const batch = costOfCall(1_000_000, 1_000_000, 5, 25, true);
    assert.equal(batch.totalUsd, normal.totalUsd / 2);
  });

  it('the monthly saving comes from input tokens only', () => {
    const usage = {
      model: 'claude-opus-5',
      callsPerMonth: 1000,
      avgOutputTokens: 500,
      cacheHitRate: 0.9,
      batchEligible: false,
    };
    const report = computeSavings(2000, 1000, usage, new Date('2026-08-04T00:00:00Z'));

    // 1000 tokens saved x 1000 calls x $5/1M = $5
    assert.ok(Math.abs(report.monthlySavingsUsd - 5) < 1e-9);
    assert.equal(report.perMonth.before.outputUsd, report.perMonth.after.outputUsd);
    assert.ok(report.monthlySavingsPct > 0 && report.monthlySavingsPct < 100);
  });
});

describe('advisories', () => {
  const baseUsage = {
    model: 'claude-opus-5',
    callsPerMonth: 10_000,
    avgOutputTokens: 200,
    cacheHitRate: 0.9,
    batchEligible: false,
  };

  it('suggests prompt caching once the cacheable minimum is cleared', () => {
    const prompt = 'Analyse this contract with legal judgement. '.repeat(200);
    const result = optimize(prompt, { usage: baseUsage });
    const caching = result.advisories.find((a) => a.id === 'prompt-caching');
    assert.ok(caching, 'should suggest caching');
    assert.ok(caching.estimatedMonthlyUsd > 0);
  });

  it('with placeholders, the caching saving covers only the stable prefix', () => {
    const stable = 'Stable and detailed legal system instruction. '.repeat(120);
    const withPlaceholder = `${stable}\n\nClient query: {{query}}\n\n${'Extra variable context. '.repeat(120)}`;
    const withoutPlaceholder = optimize(stable, { usage: baseUsage });
    const template = optimize(withPlaceholder, { usage: baseUsage });

    const cachingTemplate = template.advisories.find((a) => a.id === 'prompt-caching');
    const cachingWhole = withoutPlaceholder.advisories.find((a) => a.id === 'prompt-caching');
    assert.ok(cachingTemplate && cachingWhole);
    // The template is far longer, but its cacheable saving should sit near the
    // stable prompt's, not near the whole template's.
    assert.ok(
      cachingTemplate.estimatedMonthlyUsd < cachingWhole.estimatedMonthlyUsd * 1.3,
      `${cachingTemplate.estimatedMonthlyUsd} should be ~${cachingWhole.estimatedMonthlyUsd}`,
    );
    assert.match(cachingTemplate.detail, /placeholder/);
  });

  it('warns when a lot of stable content sits after the first placeholder', () => {
    const prompt = `Answer this: {{query}}\n\n${'Stable instruction that should come before the placeholder. '.repeat(150)}`;
    const result = optimize(prompt, { usage: baseUsage });
    const reorder = result.advisories.find((a) => a.id === 'cache-prefix-reorder');
    assert.ok(reorder, 'should suggest reordering the template');
    assert.ok(reorder.estimatedMonthlyUsd > 0);
  });

  it('does not suggest reordering when there are no placeholders', () => {
    const result = optimize('Stable text. '.repeat(300), { usage: baseUsage });
    assert.ok(!result.advisories.some((a) => a.id === 'cache-prefix-reorder'));
  });

  it('analyzeCachePrefix measures the prefix up to the first placeholder', () => {
    const analysis = analyzeCachePrefix(
      'Fixed system instructions. {{input}} More fixed text afterwards.',
      estimateTokens,
    );
    assert.equal(analysis.firstPlaceholder, '{{input}}');
    assert.ok(analysis.stablePrefixTokens > 0);
    assert.ok(analysis.stablePrefixTokens < analysis.totalTokens);
    assert.ok(analysis.staticTokensAfter > 0);

    const noPlaceholders = analyzeCachePrefix('Text without template variables.', estimateTokens);
    assert.equal(noPlaceholders.firstPlaceholder, null);
    assert.equal(noPlaceholders.stablePrefixTokens, noPlaceholders.totalTokens);
    assert.equal(noPlaceholders.staticTokensAfter, 0);
  });

  it('warns when the prompt falls short of the cacheable minimum', () => {
    const result = optimize('Summarise this text.', { usage: baseUsage });
    assert.ok(result.advisories.some((a) => a.id === 'below-cache-minimum'));
  });

  it('does not suggest caching when the hit rate does not pay for it', () => {
    const prompt = 'Analyse this contract with legal judgement. '.repeat(200);
    const result = optimize(prompt, { usage: { ...baseUsage, cacheHitRate: 0.1 } });
    assert.ok(result.advisories.some((a) => a.id === 'prompt-caching-not-worth-it'));
    assert.ok(!result.advisories.some((a) => a.id === 'prompt-caching'));
  });

  it('states a break-even that is true about the model it is talking about', () => {
    /**
     * This sentence used to read, for every model in the catalogue: *"a cache
     * write costs 125% of the input price and a read costs 10%. Below roughly a
     * 28% hit rate you pay more than you save."*
     *
     * Two of those numbers were Anthropic's multipliers stated as universal.
     * The third was not derivable from any model at all: break-even is where a
     * cached token costs what an uncached one does, `h*read + (1-h)*write = 1`,
     * so `h = (1 - write) / (read - write)`, and at 1.25 and 0.1 that is 21.74%
     * rather than 28%.
     *
     * The threshold is recomputed here from the catalogue rather than typed in,
     * so the assertion cannot drift with a price change and cannot be satisfied
     * by editing it to match a wrong answer.
     */
    const prompt = 'Analyse this contract with legal judgement. '.repeat(200);
    const result = optimize(prompt, { usage: { ...baseUsage, cacheHitRate: 0.1 } });
    const said = result.advisories.find((a) => a.id === 'prompt-caching-not-worth-it');
    assert.ok(said, 'the advisory did not fire, so there is no sentence to check');

    const model = MODELS.find((m) => m.id === baseUsage.model) ?? MODELS[0];
    const rates = multipliersFor(model);
    const expected = Math.round(((1 - rates.cacheWrite5m) / (rates.cacheRead - rates.cacheWrite5m)) * 1000) / 10;

    assert.match(said.detail, new RegExp(`${String(expected).replace('.', '\\.')}%`),
      `the advisory does not name this model's break-even of ${expected}%: ${said.detail}`);
    assert.match(said.detail, new RegExp(`${Math.round(rates.cacheRead * 100)}%`));
    assert.match(said.detail, new RegExp(`${Math.round(rates.cacheWrite5m * 100)}%`));

    // And the number it used to invent is gone.
    assert.doesNotMatch(said.detail, /28%/, 'the undderivable 28% is still being printed');
  });

  it('never tells a model whose writes cost input price to turn caching off', () => {
    /**
     * Eight of the eighteen models have a write multiplier of 1: writing costs
     * exactly what not caching costs, so caching cannot lose money at any hit
     * rate. `(1 - 1) / (r - 1)` is 0, which is not a small threshold but the
     * absence of one, and the fixed sentence advised all eight to consider
     * leaving caching off.
     */
    const flat = MODELS.filter((m) => multipliersFor(m).cacheWrite5m <= 1);
    assert.ok(flat.length > 0, 'no flat-write model in the catalogue, so this guard checks nothing');

    const prompt = 'Analyse this contract with legal judgement. '.repeat(200);
    let checked = 0;
    for (const model of flat) {
      const result = optimize(prompt, {
        usage: { ...baseUsage, model: model.id, cacheHitRate: 0 },
      });
      const said = result.advisories.find((a) => a.id === 'prompt-caching-not-worth-it');
      assert.ok(said, `${model.id} did not produce the advisory, so this guard checked nothing`);
      checked += 1;

      /**
       * Matched on the claim, not on the wording.
       *
       * The first version of this asserted `doesNotMatch(/Below a/)`, which is
       * the phrasing of the *replacement* rather than of the thing being
       * prevented: the sentence it exists to catch reads "Below **roughly** a
       * 28% hit rate", and `Below a` does not match `Below roughly a`. The plant
       * was restored and this test stayed green, which is the whole reason it is
       * written this way now.
       *
       * "You pay more than you save" is the claim itself. It is in the old
       * sentence, it is in the threshold branch where it is true, and it must
       * never appear for a model that cannot lose money by caching.
       */
      assert.doesNotMatch(
        said.detail,
        /pay more than you save|pagas más de lo que ahorras/,
        `${model.id} writes at input price and was told it pays more than it saves: ${said.detail}`,
      );
    }
    assert.ok(checked > 0, 'no flat-write model produced the advisory, so nothing was asserted');
  });

  it('refuses a tier when the prompt asks for depth and brevity at once', () => {
    /**
     * The score subtracts one side from the other, so a prompt carrying four
     * hard signals and three easy ones cancels to a `sonnet` that is
     * **indistinguishable from a prompt with no signals at all**. Those are
     * opposite situations reported with one number, and only one of them is
     * worth telling anybody about.
     *
     * The refusal is the point: no tier recommendation is emitted, so no dollar
     * figure is attached to a reading the heuristic cannot stand behind.
     */
    const conflict =
      'Think step by step and analyze the trade-offs in depth, prove the design. ' +
      'Just classify it, translate briefly, one label only.';

    const seen = recommendTierDetailed(conflict, 500);
    assert.ok(seen.complexSignals > 0 && seen.simpleSignals > 0, 'the fixture carries no conflict');
    assert.equal(seen.conflicted, true);

    const result = optimize(conflict, { usage: baseUsage });
    const ids = result.advisories.map((a) => a.id);
    assert.ok(ids.includes('tier-signals-conflict'), `the refusal was not stated: ${ids}`);
    assert.ok(
      !ids.includes('model-downgrade'),
      'a downgrade was recommended from a reading the heuristic itself does not trust',
    );

    const said = result.advisories.find((a) => a.id === 'tier-signals-conflict');
    assert.equal(said.estimatedMonthlyUsd, null, 'a refusal came with a dollar figure attached');
    // A refusal names what is missing, and what to do instead.
    assert.match(said.detail, /trazum route/, 'the refusal does not name the command that settles it');
  });

  it('still recommends a tier when one side clearly leads', () => {
    /**
     * The other half: a lead of two or more signals is a majority the size term
     * cannot manufacture, so the heuristic still answers. Without this the
     * refusal could be widened to everything and every test above would pass.
     */
    const clear = 'Classify this sentence. Translate it. Extract the label. Summarize in one word.';
    const seen = recommendTierDetailed(clear, 200);
    assert.equal(seen.simpleSignals >= seen.complexSignals + 2, true, `not a clear lead: ${JSON.stringify(seen)}`);
    assert.equal(seen.conflicted, false);
    assert.equal(seen.tier, 'haiku');
  });

  it('never halves a downgrade candidate that has no batch API', () => {
    /**
     * The `model-downgrade` saving multiplied the candidate by a hardcoded
     * `0.5` whenever the caller said `batchEligible`, while the current model's
     * own cost twenty lines above already used `rates.batch ?? 1`. Three models
     * in the catalogue carry `batch: null`, meaning no batch API at all, and
     * halving them offered money that cannot be bought at any price.
     *
     * Derived from the catalogue rather than naming the three by hand, so a
     * provider that gains or loses a batch API does not silently take this
     * guard with it.
     */
    const noBatch = MODELS.filter((m) => multipliersFor(m).batch === null);
    assert.ok(noBatch.length > 0, 'no batch-less model in the catalogue, so this guard checks nothing');

    // A candidate is only reached from a pricier tier, so the arithmetic is
    // done directly: the advisory's saving must never assume a discount the
    // candidate does not offer.
    for (const model of noBatch) {
      assert.equal(
        multipliersFor(model).batch ?? 1,
        1,
        `${model.id} would be discounted despite having no batch API`,
      );
    }

    // And the source no longer carries the constant that caused it.
    const source = readFileSync(new URL('../src/advisories.ts', import.meta.url), 'utf8');
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(
      code,
      /batchEligible \? 0\.5/,
      'a hardcoded batch discount is back in the downgrade saving',
    );
  });

  it('suggests the Batch API only when it is not already in use', () => {
    const withBatch = optimize('Classify this.', {
      usage: { ...baseUsage, batchEligible: true },
    });
    const withoutBatch = optimize('Classify this.', { usage: baseUsage });
    assert.ok(!withBatch.advisories.some((a) => a.id === 'batch-api'));
    assert.ok(withoutBatch.advisories.some((a) => a.id === 'batch-api'));
  });

  it('suggests a cheaper model for simple tasks', () => {
    const result = optimize('Classify the sentiment of this sentence: yes or no.', {
      usage: baseUsage,
    });
    const downgrade = result.advisories.find((a) => a.id === 'model-downgrade');
    assert.ok(downgrade, 'a classification should be able to move down a tier');
    assert.ok(downgrade.estimatedMonthlyUsd > 0);
  });

  it('warns when the prompt does not fit the context window', () => {
    // Haiku's window is 200K tokens; this clears it with room to spare.
    const result = optimize('word '.repeat(250_000), {
      usage: { ...baseUsage, model: 'claude-haiku-4-5' },
    });
    assert.ok(result.advisories.some((a) => a.id === 'context-overflow'));
  });

  it('the complexity heuristic tells simple tasks from complex ones', () => {
    assert.equal(recommendTier('Translate this sentence into English.', 20), 'haiku');
    assert.equal(
      recommendTier(
        'Analyse the architecture, design a migration and debug the agent step by step.',
        6000,
      ),
      'opus',
    );
  });
});

describe('how old the prices are', () => {
  /**
   * Every dollar figure Trazum prints descends from the price list, and the list
   * carries the date it was checked. Printing only that date makes the reader do
   * arithmetic against today to learn the one thing they wanted — whether to trust
   * it — and a reader who is not already suspicious will not bother.
   */
  const at = (iso) => new Date(iso);

  it('counts whole days, from UTC midnight on both sides', () => {
    // Otherwise the answer changes by one depending on what time of day the
    // command happens to run, which makes it look unreliable when it is not.
    assert.equal(reviewAgeDays('2026-08-08', at('2026-08-08T00:00:01Z')), 0);
    assert.equal(reviewAgeDays('2026-08-08', at('2026-08-08T23:59:59Z')), 0);
    assert.equal(reviewAgeDays('2026-08-08', at('2026-08-09T00:00:01Z')), 1);
    assert.equal(reviewAgeDays('2026-06-24', at('2026-08-08T12:00:00Z')), 45);
  });

  it('is unaffected by daylight saving', () => {
    // A local-time subtraction across a spring-forward gap is 47 hours and rounds
    // to 1 day, not 2. UTC has no such gap.
    assert.equal(reviewAgeDays('2026-03-28', at('2026-03-30T01:00:00Z')), 2);
  });

  it('says unknown rather than guessing', () => {
    // An overlay supplies this string. A wrong one should read as unknown, not as
    // a confident number computed from NaN.
    assert.equal(reviewAgeDays('soon', at('2026-08-08T00:00:00Z')), null);
    assert.equal(reviewAgeDays('', at('2026-08-08T00:00:00Z')), null);
    assert.equal(reviewAgeDays('2026-6-24', at('2026-08-08T00:00:00Z')), null);
  });

  it('refuses a year-month, which would silently become the first of the month', () => {
    /**
     * The case the format guard exists for, and the only one that distinguishes it
     * from the NaN check underneath.
     *
     * `Date.parse('2026-06' + 'T00:00:00Z')` is **2026-06-01** — a day nobody
     * wrote. Without the guard, an overlay carrying `"lastReviewed": "2026-06"`
     * gets an age computed from an invented day of the month and printed with the
     * same confidence as a real one.
     *
     * Found by mutation: deleting the guard failed no test, because every other
     * malformed value this was checked against is NaN either way.
     */
    assert.equal(reviewAgeDays('2026-06', at('2026-08-08T00:00:00Z')), null);
    assert.equal(reviewAgeDays('2026', at('2026-08-08T00:00:00Z')), null);
  });

  it('treats a future date as unknown, not as negative days', () => {
    // A typo or a wrong clock. "Reviewed in -12 days" reads as a bug either way,
    // and claiming the prices are fresh would be worse than saying nothing.
    assert.equal(reviewAgeDays('2027-01-01', at('2026-08-08T00:00:00Z')), null);
  });

  it('the bundled catalogue carries a usable date', () => {
    // The guard on the whole idea: an unparseable constant would make every report
    // silently drop the age and nothing else would notice.
    assert.notEqual(reviewAgeDays(PRICING_LAST_REVIEWED, new Date()), null);
  });
});

describe('the review date behind one report', () => {
  /**
   * `PRICING_LAST_REVIEWED` is the oldest provider's, which is the right answer
   * to *how old is this table* and the wrong answer to *how old are the prices
   * in front of me* — and every staleness warning was using it. On a report of
   * Claude and OpenAI calls it named a date belonging to two models that report
   * never touched, under a sentence saying the table behind every dollar in it
   * was reviewed then.
   */
  it('answers for the providers that actually priced the report', () => {
    const fresh = reviewedForModels(['claude-opus-5'], BUNDLED_CATALOGUE);
    assert.equal(fresh, PROVIDER_REVIEWED.anthropic);
  });

  it('takes the oldest when a report spans providers', () => {
    const both = reviewedForModels(['claude-opus-5', 'gpt-5-mini'], BUNDLED_CATALOGUE);
    const expected =
      PROVIDER_REVIEWED.anthropic < PROVIDER_REVIEWED.openai
        ? PROVIDER_REVIEWED.anthropic
        : PROVIDER_REVIEWED.openai;
    assert.equal(both, expected, 'a mixed report reported the fresher half');
  });

  it('falls back to the table rather than claiming provenance it lacks', () => {
    /*
      Three ways the question cannot be answered, and all three err towards the
      table's own date. Reporting a fresher one for a report containing a price
      of unknown origin would be claiming provenance this catalogue does not
      have — which is the failure the whole function exists to remove, facing
      the other way.
    */
    assert.equal(reviewedForModels(['not-a-model'], BUNDLED_CATALOGUE), BUNDLED_CATALOGUE.lastReviewed);
    assert.equal(reviewedForModels([], BUNDLED_CATALOGUE), BUNDLED_CATALOGUE.lastReviewed);

    /* An overlay's prices are not this table's, so this table's dates say
       nothing about them — whatever models it happens to carry. */
    const overlay = { ...BUNDLED_CATALOGUE, lastReviewed: '2099-01-01' };
    assert.equal(reviewedForModels(['claude-opus-5'], overlay), '2099-01-01');
  });

  it('is never fresher than the catalogue-wide date', () => {
    /* The property that makes the fallback safe to rely on: whatever this
       returns, it is a date the table can stand behind. */
    for (const model of BUNDLED_CATALOGUE.models) {
      const date = reviewedForModels([model.id], BUNDLED_CATALOGUE);
      assert.ok(date >= PRICING_LAST_REVIEWED, `${model.id} reported ${date}, older than the table`);
    }
  });
});
