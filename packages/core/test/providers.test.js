import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BUNDLED_CATALOGUE,
  cheapestOfTierIn,
  getModel,
  listModels,
  multipliersFor,
  optimize,
} from '../dist/index.js';

/**
 * Pricing models that are not Anthropic's.
 *
 * The cost multipliers were global constants until other providers arrived, and
 * global made them quietly wrong. The failures worth guarding are not small
 * inaccuracies — they are **savings that do not exist**: a batch discount from a
 * provider with no batch API, a caching saving from a provider with no cache.
 * Trazum printing a number nobody can collect is the one thing it must not do.
 */

const usageFor = (model) => ({
  model,
  callsPerMonth: 50_000,
  avgOutputTokens: 500,
  cacheHitRate: 0.9,
  batchEligible: false,
});

// Long enough to clear every minimum in the catalogue, which is not one number:
// Anthropic asks 512, OpenAI and Moonshot 1,024, Gemini Pro 2,048. At 60 rules
// the prefix was 974 tokens and GPT-5 correctly reported `below-cache-minimum`
// instead — the feature working, and a fixture that could not see it.
const LONG_PROMPT = `You are a support agent.

${Array.from({ length: 200 }, (_, i) => `- Rule ${i + 1}: confirm the order identifier first.`).join('\n')}

Customer message: {{message}}`;

const advisoryIds = (model) =>
  optimize(LONG_PROMPT, { level: 'safe', usage: usageFor(model) }).advisories.map((a) => a.id);

describe('a provider with no batch API is not offered one', () => {
  it('stays quiet for Kimi', () => {
    // `batch: null` means "there is no batch API", which is different from not
    // having said. Offering a 50% discount that cannot be bought is a fabricated
    // saving, not an imprecise one.
    assert.equal(multipliersFor(getModel('kimi-k2')).batch, null);
    assert.ok(!advisoryIds('kimi-k2').includes('batch-api'));
  });

  it('still offers one where it exists', () => {
    assert.ok(advisoryIds('claude-opus-5').includes('batch-api'));
    assert.ok(advisoryIds('gpt-5').includes('batch-api'));
  });

  it('gives no batch discount even when the caller ticked the box', () => {
    // `batchEligible` describes the work, not what the provider sells.
    const withBatch = optimize(LONG_PROMPT, {
      level: 'safe',
      usage: { ...usageFor('kimi-k2'), batchEligible: true },
    });
    const without = optimize(LONG_PROMPT, { level: 'safe', usage: usageFor('kimi-k2') });
    assert.equal(
      withBatch.savings.perMonth.before.totalUsd,
      without.savings.perMonth.before.totalUsd,
      'a discount was applied by a provider that does not sell one',
    );
  });
});

describe('a provider with no prompt caching is not offered caching', () => {
  it('stays quiet for Mistral', () => {
    // Found by running the catalogue rather than by reading it: a zero cache
    // minimum satisfies `0 >= 0`, so the advisory fired and offered $100 a month
    // of caching on a model that has none.
    assert.equal(getModel('mistral-large-2').caching, 'none');
    const ids = advisoryIds('mistral-large-2');
    assert.ok(!ids.includes('prompt-caching'), 'caching offered where there is none');
    assert.ok(!ids.includes('below-cache-minimum'), 'a cache minimum quoted where there is no cache');
  });

  it('still offers it where it exists', () => {
    for (const model of ['claude-opus-5', 'gpt-5', 'kimi-k2', 'gemini-2.5-pro']) {
      assert.ok(advisoryIds(model).includes('prompt-caching'), `${model}: no caching advisory`);
    }
  });

  it('says the prefix is too short rather than saying nothing', () => {
    // Between "no caching here" and "caching, but your prefix does not reach
    // the minimum" only the second is actionable, and the minimum differs by
    // provider — 512 on Anthropic, 1,024 on OpenAI, 2,048 on Gemini Pro.
    const short = `Agent.\n\n${'- Be brief and accurate in every reply.\n'.repeat(40)}\nInput: {{x}}`;
    const ids = advisoryIds.bind(null);
    assert.ok(
      optimize(short, { level: 'safe', usage: usageFor('gemini-2.5-pro') }).advisories.some(
        (a) => a.id === 'below-cache-minimum',
      ),
      'a prefix under the minimum was passed over in silence',
    );
    assert.ok(ids('claude-opus-5').length > 0);
  });
});

describe('the caching saving follows the provider, not one constant', () => {
  it('is smaller where a cache read costs more', () => {
    // Gemini reads at 25% of input, Anthropic at 10%. The same prompt cannot be
    // worth the same fraction on both, and using one constant was how it was.
    const cacheSaving = (model) => {
      const found = optimize(LONG_PROMPT, { level: 'safe', usage: usageFor(model) }).advisories.find(
        (a) => a.id === 'prompt-caching',
      );
      return found?.estimatedMonthlyUsd ?? 0;
    };

    const perDollar = (model) => {
      const m = getModel(model);
      return cacheSaving(model) / m.inputPerMTok;
    };

    assert.ok(
      perDollar('gemini-2.5-pro') < perDollar('claude-opus-5'),
      'a dearer cache read did not produce a smaller saving per dollar of input',
    );
  });
});

describe('a cheaper model means a cheaper model, not a different supplier', () => {
  it('never recommends across providers', () => {
    // Dropping a tier is a one-line change; switching vendor is a migration.
    // This advisory is already caveated as a keyword heuristic rather than a
    // judgement about answer quality, and a keyword heuristic has no business
    // recommending a change of supplier.
    const short = 'Summarise this text in one sentence: {{text}}';
    for (const model of ['claude-opus-5', 'gpt-5', 'gemini-2.5-pro']) {
      const result = optimize(short, { level: 'safe', usage: usageFor(model) });
      const downgrade = result.advisories.find((a) => a.id === 'model-downgrade');
      if (!downgrade) continue;
      const provider = getModel(model).provider;
      const named = listModels().filter((m) => downgrade.detail.includes(m.displayName));
      assert.ok(named.length > 0, `${model}: the advisory names no model`);
      for (const suggestion of named) {
        assert.equal(
          suggestion.provider,
          provider,
          `${model}: suggested ${suggestion.id} from another provider`,
        );
      }
    }
  });

  it('will search the whole catalogue if a caller asks it to', () => {
    const anywhere = cheapestOfTierIn(BUNDLED_CATALOGUE, 'sonnet', new Date('2026-07-01'));
    const scoped = cheapestOfTierIn(BUNDLED_CATALOGUE, 'sonnet', new Date('2026-07-01'), 'anthropic');
    assert.equal(scoped.provider, 'anthropic');
    assert.ok(anywhere.inputPerMTok <= scoped.inputPerMTok);
  });
});

describe('the catalogue is internally consistent', () => {
  it('every model declares a provider and a capability', () => {
    for (const model of listModels()) {
      assert.ok(model.provider, `${model.id} has no provider`);
      assert.ok(model.capability, `${model.id} has no capability`);
    }
  });

  it('capability and the deprecated tier never disagree', () => {
    // `tier` is kept in step for the whole of 1.x. If they drift, half the code
    // ranks one way and half the other, and the difference is invisible until a
    // recommendation is wrong.
    const equivalent = { small: 'haiku', mid: 'sonnet', large: 'opus', frontier: 'frontier' };
    for (const model of listModels()) {
      assert.equal(
        model.tier,
        equivalent[model.capability],
        `${model.id}: capability ${model.capability} against tier ${model.tier}`,
      );
    }
  });

  it('a model with no caching has no cache minimum, and vice versa', () => {
    for (const model of listModels()) {
      if (model.caching === 'none') {
        assert.equal(model.cacheMinTokens, 0, `${model.id} quotes a minimum for a cache it lacks`);
      } else {
        assert.ok(model.cacheMinTokens > 0, `${model.id} caches but declares no minimum`);
      }
    }
  });
});
