import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { LOCALES, optimize } from '../dist/index.js';

/**
 * *A locale changes the report, never the optimisation.*
 *
 * One of the two rules `ROADMAP.md` says constrain everything here, and the
 * README says it is enforced by tests. It was — by **one English sentence in
 * two locales**. A rule stated universally and checked on a single example is a
 * claim that happens to be true, and this project's own doctrine now has a name
 * for the shape: *a rule you wrote for yourself is a claim like any other.*
 *
 * So the corpus is read off disk and the locales off `LOCALES`, and every
 * prompt is run at both levels in every locale. A locale added, or a prompt
 * added to the corpus, widens this without anybody remembering to.
 *
 * **What "the same" means is enumerated rather than sampled**: the optimised
 * text, every token figure, every rule id with its hits and saving, and every
 * advisory id. The one thing that must differ — the prose — is asserted to
 * differ, because a report that came back in English for `--locale es` would
 * satisfy every equality above.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');

const txtIn = (...parts) => {
  const dir = join(repoRoot, ...parts);
  return readdirSync(dir)
    .filter((name) => name.endsWith('.txt'))
    .sort()
    .map((name) => ({ path: join(...parts, name), text: readFileSync(join(dir, name), 'utf8') }));
};

/**
 * Every prompt this repository has, from all three places it keeps them.
 *
 * The language corpus matters most: the rule is about the *reader's* locale,
 * and a prompt in Dutch read by a Spanish-speaking reader is the case a single
 * English fixture cannot reach.
 */
const CORPUS = [
  ...txtIn('packages', 'core', 'test', 'corpus'),
  ...txtIn('packages', 'core', 'test', 'rules-corpus'),
  ...txtIn('examples'),
];

const USAGE = {
  model: 'claude-opus-5',
  callsPerMonth: 10_000,
  avgOutputTokens: 200,
  cacheHitRate: 0.9,
  batchEligible: false,
};

/** Everything about a result that the locale is not allowed to change. */
const invariant = (result) => ({
  optimized: result.optimized,
  tokensBefore: result.tokensBefore,
  tokensAfter: result.tokensAfter,
  tokensSaved: result.tokensSaved,
  reductionPct: result.reductionPct,
  rules: result.rules.map((rule) => `${rule.id}:${rule.hits}:${rule.tokensSaved}`),
  advisories: [...result.advisories.map((advisory) => advisory.id)].sort(),
});

describe('a locale changes the report, never the optimisation', () => {
  it('has a corpus and more than one locale to compare', () => {
    // Without both, every assertion below passes by having nothing to compare.
    assert.ok(CORPUS.length >= 20, `only ${CORPUS.length} prompts found`);
    assert.ok(LOCALES.length >= 2, `only ${LOCALES.length} locale`);
  });

  it('produces the same optimisation in every locale, on every prompt, at both levels', () => {
    const [first, ...rest] = LOCALES;
    const differing = [];
    for (const { path, text } of CORPUS) {
      for (const level of ['safe', 'aggressive']) {
        const reference = invariant(optimize(text, { level, usage: USAGE, locale: first }));
        for (const locale of rest) {
          const other = invariant(optimize(text, { level, usage: USAGE, locale }));
          for (const key of Object.keys(reference)) {
            const a = JSON.stringify(reference[key]);
            const b = JSON.stringify(other[key]);
            if (a !== b) differing.push(`${path} [${level}] ${first}→${locale} ${key}: ${a} vs ${b}`);
          }
        }
      }
    }
    assert.deepEqual(
      differing,
      [],
      `the locale changed the optimisation:\n  ${differing.join('\n  ')}`,
    );
  });

  it('and the prose does follow the locale, which the equalities above cannot see', () => {
    /**
     * The other direction, and the reason it is here: a build that returned the
     * English report for every locale would satisfy every assertion above
     * perfectly. Somewhere in the corpus a rule has to fire, and its title has
     * to come back different.
     */
    const [first, ...rest] = LOCALES;
    let compared = 0;
    for (const { text } of CORPUS) {
      const reference = optimize(text, { level: 'aggressive', usage: USAGE, locale: first });
      const fired = reference.rules.filter((rule) => rule.hits > 0);
      if (fired.length === 0) continue;
      for (const locale of rest) {
        const other = optimize(text, { level: 'aggressive', usage: USAGE, locale });
        const same = other.rules.find((rule) => rule.id === fired[0].id);
        assert.ok(same, `${locale} lost the rule ${fired[0].id} entirely`);
        assert.notEqual(
          same.title,
          fired[0].title,
          `${locale} returned the ${first} title for ${fired[0].id}`,
        );
        compared++;
      }
    }
    assert.ok(compared > 0, 'no rule fired anywhere in the corpus, so nothing was compared');
  });

  it('would notice an optimisation that had drifted between locales', () => {
    /**
     * The sweep only ever sees a build where the rule holds, so on this
     * repository it cannot fail. Handed two results that differ in one figure,
     * the comparison must name it.
     */
    const text = CORPUS[0].text;
    const real = invariant(optimize(text, { level: 'safe', usage: USAGE }));
    const tampered = { ...real, tokensAfter: real.tokensAfter + 1 };
    const differing = Object.keys(real).filter(
      (key) => JSON.stringify(real[key]) !== JSON.stringify(tampered[key]),
    );
    assert.deepEqual(differing, ['tokensAfter']);
  });
});
