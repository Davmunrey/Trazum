import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DEFAULT_LOCALE,
  LOCALES,
  RULES,
  en,
  es,
  getMessages,
  isLocale,
  optimize,
  resolveLocale,
} from '../dist/index.js';

describe('locale resolution', () => {
  it('English is the default', () => {
    assert.equal(DEFAULT_LOCALE, 'en');
    assert.equal(getMessages().locale, 'en');
  });

  it('recognises the locales that ship', () => {
    for (const locale of LOCALES) {
      assert.ok(isLocale(locale));
      assert.equal(getMessages(locale).locale, locale);
    }
    assert.ok(!isLocale('fr'));
    assert.ok(!isLocale(null));
    assert.ok(!isLocale(42));
  });

  it('resolves bare, regional and POSIX tags', () => {
    assert.equal(resolveLocale('es'), 'es');
    assert.equal(resolveLocale('es-ES'), 'es');
    assert.equal(resolveLocale('en_GB'), 'en');
    assert.equal(resolveLocale('es_ES.UTF-8'), 'es');
    assert.equal(resolveLocale('ES'), 'es');
  });

  it('takes the highest-priority tag of an Accept-Language list', () => {
    assert.equal(resolveLocale('es-ES,es;q=0.9,en;q=0.8'), 'es');
    assert.equal(resolveLocale('en-US,en;q=0.9,es;q=0.8'), 'en');
  });

  it('falls back to the default instead of throwing', () => {
    // A bad locale must never be the reason an optimisation fails.
    for (const input of [null, undefined, '', '   ', 'fr-FR', 'zzz', '*']) {
      assert.equal(resolveLocale(input), DEFAULT_LOCALE);
    }
    assert.equal(getMessages('fr').locale, DEFAULT_LOCALE);
  });
});

describe('catalogue parity', () => {
  // These are the guarantees that stop a locale from silently going stale:
  // adding a rule or an advisory has to be done in every catalogue at once.
  it('every rule has copy in every locale', () => {
    for (const locale of LOCALES) {
      const t = getMessages(locale);
      for (const rule of RULES) {
        const copy = t.rules[rule.id];
        assert.ok(copy, `${locale} has no copy for rule "${rule.id}"`);
        assert.ok(copy.title.trim().length > 0, `${locale}/${rule.id}: empty title`);
        assert.ok(copy.rationale.trim().length > 0, `${locale}/${rule.id}: empty rationale`);
      }
    }
  });

  it('no catalogue describes a rule that does not exist', () => {
    const ids = new Set(RULES.map((r) => r.id));
    for (const locale of LOCALES) {
      for (const id of Object.keys(getMessages(locale).rules)) {
        assert.ok(ids.has(id), `${locale} describes unknown rule "${id}"`);
      }
    }
  });

  it('all catalogues expose the same keys', () => {
    assert.deepEqual(Object.keys(es.rules).sort(), Object.keys(en.rules).sort());
    assert.deepEqual(Object.keys(es.advisories).sort(), Object.keys(en.advisories).sort());
    assert.deepEqual(Object.keys(es.llm).sort(), Object.keys(en.llm).sort());
    assert.deepEqual(
      Object.keys(es.contradictionAxes).sort(),
      Object.keys(en.contradictionAxes).sort(),
    );
    assert.deepEqual(
      Object.keys(es.contradictionValues).sort(),
      Object.keys(en.contradictionValues).sort(),
    );
  });

  it('every advisory renders a non-empty title and detail in every locale', () => {
    const samples = {
      contextOverflow: { tokens: 250_000, modelName: 'Claude Haiku 4.5', contextWindow: 200_000 },
      promptCaching: {
        placeholder: '{{query}}',
        prefixTokens: 4000,
        totalTokens: 9000,
        minTokens: 512,
        modelName: 'Claude Opus 5',
        hitRatePct: 90,
      },
      promptCachingNotWorthIt: undefined,
      belowCacheMinimum: {
        modelName: 'Claude Opus 5',
        minTokens: 512,
        placeholder: null,
        prefixTokens: 40,
        totalTokens: 40,
        mentionLowerMinimum: true,
      },
      cachePrefixReorder: { staticTokensAfter: 3000, sharePct: 70, placeholder: '{{query}}' },
      batchApi: undefined,
      modelDowngrade: {
        modelName: 'Claude Opus 5',
        tier: 'haiku',
        candidateName: 'Claude Haiku 4.5',
        currentUsd: 12.5,
        candidateUsd: 2.5,
      },
      outputDominated: { outputUsd: 40, inputUsd: 5 },
      promoPricing: {
        modelName: 'Claude Sonnet 5',
        promoInput: 2,
        promoOutput: 10,
        until: '2026-08-31',
        listInput: 3,
        listOutput: 15,
      },
      contradictoryInstructions: {
        axis: 'the language of the answer',
        firstValue: 'a fixed language',
        firstSnippet: 'Always answer in English.',
        secondValue: "the user's language",
        secondSnippet: 'Respond in the user language.',
        otherCount: 1,
      },
      redundantExamples: {
        redundantCount: 2,
        totalCount: 5,
        redundantTokens: 180,
        topSimilarityPct: 88,
      },
    };

    for (const locale of LOCALES) {
      const { advisories } = getMessages(locale);
      for (const [key, params] of Object.entries(samples)) {
        const message = advisories[key](params);
        assert.ok(message.title.trim().length > 0, `${locale}/${key}: empty title`);
        assert.ok(message.detail.trim().length > 0, `${locale}/${key}: empty detail`);
      }
    }
  });

  it('every contradiction axis and value is named in every locale', () => {
    for (const locale of LOCALES) {
      const t = getMessages(locale);
      for (const [axis, name] of Object.entries(t.contradictionAxes)) {
        assert.ok(name.trim().length > 0, `${locale} does not name axis "${axis}"`);
      }
      for (const [value, name] of Object.entries(t.contradictionValues)) {
        assert.ok(name.trim().length > 0, `${locale} does not name value "${value}"`);
      }
    }
  });

  it('the contradiction advisory names both sides in the requested locale', () => {
    // Regression: the axis values were English string literals in the
    // detector, so a Spanish report read "Una dice a fixed language".
    const prompt = 'Always answer in English.\n\nRespond in the user language.';
    const spanish = optimize(prompt, { locale: 'es' }).advisories.find(
      (a) => a.id === 'contradictory-instructions',
    );
    assert.ok(spanish);
    assert.ok(
      !/a fixed language|the user's language/.test(spanish.detail),
      `English value names leaked into the Spanish report: ${spanish.detail}`,
    );
    assert.match(spanish.detail, /siempre el mismo idioma/);
  });

  it('every LLM rejection reason renders in every locale', () => {
    for (const locale of LOCALES) {
      const { llm } = getMessages(locale);
      const reasons = [
        llm.emptyResponse(),
        llm.protectedContentAltered(2),
        llm.notShorter(120, 100),
        llm.suspiciousShrink(12),
      ];
      for (const reason of reasons) {
        assert.ok(typeof reason === 'string' && reason.trim().length > 0);
      }
    }
  });
});

describe('locale in the report', () => {
  it('the result carries the locale it was produced in', () => {
    assert.equal(optimize('Please summarise this.').locale, 'en');
    assert.equal(optimize('Please summarise this.', { locale: 'es' }).locale, 'es');
  });

  it('rule copy follows the requested locale, the optimisation does not', () => {
    const prompt = 'Please summarise this text. Thank you.';
    const english = optimize(prompt);
    const spanish = optimize(prompt, { locale: 'es' });

    // Same prompt in, same prompt out: the locale changes the report, never
    // the optimisation itself.
    assert.equal(english.optimized, spanish.optimized);
    assert.equal(english.tokensAfter, spanish.tokensAfter);

    const enPoliteness = english.rules.find((r) => r.id === 'politeness');
    const esPoliteness = spanish.rules.find((r) => r.id === 'politeness');
    assert.ok(enPoliteness && esPoliteness);
    assert.notEqual(enPoliteness.title, esPoliteness.title);
  });

  it('advisories come back in the requested locale', () => {
    const usage = {
      model: 'claude-opus-5',
      callsPerMonth: 10_000,
      avgOutputTokens: 200,
      cacheHitRate: 0.9,
      batchEligible: false,
    };
    const prompt = 'Analyse this contract with legal judgement. '.repeat(200);

    const english = optimize(prompt, { usage });
    const spanish = optimize(prompt, { usage, locale: 'es' });

    const enCaching = english.advisories.find((a) => a.id === 'prompt-caching');
    const esCaching = spanish.advisories.find((a) => a.id === 'prompt-caching');
    assert.ok(enCaching && esCaching);
    assert.notEqual(enCaching.title, esCaching.title);
    // The identifiers are stable across locales, so callers can branch on them.
    assert.deepEqual(
      english.advisories.map((a) => a.id),
      spanish.advisories.map((a) => a.id),
    );
    // And the money is the same number either way.
    assert.equal(enCaching.estimatedMonthlyUsd, esCaching.estimatedMonthlyUsd);
  });
});
