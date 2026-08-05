import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  analyzeCachePrefix,
  computeSavings,
  costOfCall,
  effectivePricing,
  estimateTokens,
  getModel,
  listModels,
  optimize,
  recommendTier,
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
    const sonnet = getModel('claude-sonnet-5');
    assert.ok(sonnet.promo, 'Sonnet 5 should have introductory pricing');

    const inside = effectivePricing(sonnet, new Date('2026-08-01T00:00:00Z'));
    assert.equal(inside.promoApplied, true);
    assert.equal(inside.inputPerMTok, sonnet.promo.inputPerMTok);

    const outside = effectivePricing(sonnet, new Date('2026-09-01T00:00:00Z'));
    assert.equal(outside.promoApplied, false);
    assert.equal(outside.inputPerMTok, sonnet.inputPerMTok);
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
