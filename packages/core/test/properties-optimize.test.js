import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { LOCALES, RULE_LEVELS, optimize, protectedTexts, segment } from '../dist/index.js';
import { CASES, Draw, replayWith } from './support/random.mjs';

/**
 * The optimiser, against prompts nobody wrote by hand.
 *
 * A hundred and forty example suites check what this package does with prompts
 * somebody thought of. That is how nearly every defect in it was found and it
 * has a shape it cannot see past: **a fixture only contains what somebody
 * thought to put in it.** These draw prompts from a seeded generator — prose,
 * fences that never close, lone surrogates, right-to-left overrides, a hundred
 * kilobytes of one letter, prompts made entirely of protected content — and
 * assert the promises the doctrine makes rather than the answers a fixture
 * happens to produce.
 *
 * Two of those promises are the reason this file exists:
 *
 * **A locale changes the report, never the optimisation.** Rule 4. It is a
 * statement about every prompt and every locale, which is exactly the kind of
 * claim an example can only illustrate.
 *
 * **Protected text is not touched.** A URL, a code fence, a placeholder: the
 * segmenter marks them and the optimiser must return them intact. An optimiser
 * that mangles an API endpoint to save four tokens has broken the prompt it was
 * asked to improve, and the saving is the least interesting thing about that.
 *
 * Doctrine: [An example only contains what somebody thought of](../../../docs/doctrine.md#an-example-only-contains-what-somebody-thought-of)
 */

const draw = new Draw();

describe('the optimiser, drawn against rather than exampled at', () => {
  it('never throws, whatever text it is handed', () => {
    /*
      An exception here is a crashed CLI on somebody's prompt, and the prompt is
      the one thing this product never sees a copy of — so a stack trace is all
      the evidence there will ever be.
    */
    for (let n = 0; n < CASES; n += 1) {
      const prompt = draw.prompt();
      const level = draw.pick([...RULE_LEVELS]);
      const locale = draw.pick([...LOCALES]);
      assert.doesNotThrow(
        () => optimize(prompt, { level, locale }),
        `${replayWith('optimize')} — threw on ${JSON.stringify(prompt).slice(0, 120)}`,
      );
    }
  });

  it('returns the same result twice for the same prompt', () => {
    /*
      Determinism is what makes every other property here checkable, and what
      makes a report somebody quotes reproducible a month later.
    */
    for (let n = 0; n < CASES; n += 1) {
      const prompt = draw.prompt();
      const options = { level: draw.pick([...RULE_LEVELS]), locale: draw.pick([...LOCALES]) };
      assert.deepEqual(
        optimize(prompt, options),
        optimize(prompt, options),
        `${replayWith('optimize')} — two runs disagreed`,
      );
    }
  });

  it('changes the report and not the optimisation, in every locale', () => {
    /**
     * Rule 4 of the doctrine, as a property over every prompt rather than an
     * illustration on one.
     *
     * The optimised text, every token figure and the exact set of rules that
     * fired must be identical in every locale. What may differ is prose — and
     * the last assertion insists that it *does*, because a suite that would
     * pass on a translation file emptied to English is a suite that checks
     * nothing about locales at all.
     */
    let proseDiffered = 0;
    for (let n = 0; n < CASES; n += 1) {
      const prompt = draw.prompt();
      const level = draw.pick([...RULE_LEVELS]);
      const results = LOCALES.map((locale) => optimize(prompt, { level, locale }));
      const [first] = results;

      for (const [at, result] of results.entries()) {
        const where = `${replayWith('optimize')} — locale ${LOCALES[at]}`;
        assert.equal(result.optimized, first.optimized, `${where} optimised different text`);
        assert.equal(result.tokensBefore, first.tokensBefore, `${where} counted differently`);
        assert.equal(result.tokensAfter, first.tokensAfter, `${where} counted differently`);
        assert.equal(result.tokensSaved, first.tokensSaved, `${where} saved differently`);
        assert.equal(result.reductionPct, first.reductionPct, `${where} reduced differently`);
        assert.deepEqual(
          result.rules.map((rule) => rule.id).sort(),
          first.rules.map((rule) => rule.id).sort(),
          `${where} fired different rules`,
        );
        assert.deepEqual(
          result.advisories.map((advisory) => advisory.id).sort(),
          first.advisories.map((advisory) => advisory.id).sort(),
          `${where} raised different advisories`,
        );
        assert.equal(result.locale, LOCALES[at], `${where} reported the wrong locale`);
      }

      const prose = results.map((result) =>
        JSON.stringify([
          result.rules.map((rule) => rule.description ?? ''),
          result.advisories.map((advisory) => advisory.message ?? advisory.title ?? ''),
        ]),
      );
      if (new Set(prose).size > 1) proseDiffered += 1;
    }
    assert.ok(
      proseDiffered > 0,
      `${replayWith('optimize')} — no prompt produced different prose in any locale; `
        + 'this property would pass against an empty translation file',
    );
  });

  it('returns every protected segment intact', () => {
    /**
     * A URL, an inline span of code, a fenced block, a placeholder. The
     * segmenter marks them and nothing downstream may touch them: an optimiser
     * that mangles an API endpoint to save four tokens has broken the prompt it
     * was asked to improve, and the saving is the least interesting thing about
     * that.
     *
     * Asserted on the **optimised text** rather than on the segmenter, because
     * the segmenter agreeing with itself is not the promise anybody relies on.
     */
    let checked = 0;
    for (let n = 0; n < CASES; n += 1) {
      const prompt = draw.prompt();
      const result = optimize(prompt, {
        level: draw.pick([...RULE_LEVELS]),
        locale: draw.pick([...LOCALES]),
      });
      for (const text of protectedTexts(segment(prompt))) {
        checked += 1;
        assert.ok(
          result.optimized.includes(text),
          `${replayWith('optimize')} — protected ${JSON.stringify(text).slice(0, 80)} `
            + 'did not survive the optimisation',
        );
      }
    }
    assert.ok(checked > 0, `${replayWith('optimize')} — no protected text was drawn at all`);
  });

  it('never grows a prompt, and its arithmetic agrees with itself', () => {
    for (let n = 0; n < CASES; n += 1) {
      const prompt = draw.prompt();
      const result = optimize(prompt, {
        level: draw.pick([...RULE_LEVELS]),
        locale: draw.pick([...LOCALES]),
      });
      const where = `${replayWith('optimize')} — ${JSON.stringify(prompt).slice(0, 60)}`;

      assert.equal(result.original, prompt, `${where}: it did not return the prompt it was given`);
      assert.ok(result.tokensAfter <= result.tokensBefore, `${where}: the prompt grew`);
      assert.equal(
        result.tokensSaved,
        result.tokensBefore - result.tokensAfter,
        `${where}: the saving is not the difference`,
      );
      assert.ok(Number.isFinite(result.reductionPct), `${where}: the reduction is not a number`);
      assert.ok(
        result.reductionPct >= 0 && result.reductionPct <= 100,
        `${where}: the reduction is ${result.reductionPct}%`,
      );
      for (const figure of [result.tokensBefore, result.tokensAfter, result.tokensSaved]) {
        assert.ok(Number.isInteger(figure) && figure >= 0, `${where}: ${figure} is not a count`);
      }
    }
  });

  it('does not fire a rule that was disabled', () => {
    /*
      `disableRules` is a promise a caller makes to their own team — a rule
      turned off after an argument about it stays off. A rule that fired anyway
      would rewrite text somebody had explicitly protected from rewriting.
    */
    for (let n = 0; n < CASES; n += 1) {
      const prompt = draw.prompt();
      const level = draw.pick([...RULE_LEVELS]);
      const fired = optimize(prompt, { level }).rules.map((rule) => rule.id);
      if (fired.length === 0) continue;

      const disabled = fired.filter(() => draw.chance(0.5));
      if (disabled.length === 0) continue;

      const after = optimize(prompt, { level, disableRules: disabled });
      for (const id of disabled) {
        assert.equal(
          after.rules.some((rule) => rule.id === id),
          false,
          `${replayWith('optimize')} — ${id} fired after being disabled`,
        );
      }
      assert.ok(
        after.tokensSaved <= optimize(prompt, { level }).tokensSaved,
        `${replayWith('optimize')} — disabling rules saved more`,
      );
    }
  });

  it('never saves less at the aggressive level than at the safe one', () => {
    /**
     * `aggressive` is `safe` plus rules somebody has to opt into, so it can
     * never do less work. If this ever fails it is a real finding rather than a
     * wrong expectation: it would mean an aggressive rule undoes a safe one,
     * and the two are being applied in an order nobody chose.
     */
    for (let n = 0; n < CASES; n += 1) {
      const prompt = draw.prompt();
      const safe = optimize(prompt, { level: 'safe' });
      const aggressive = optimize(prompt, { level: 'aggressive' });
      assert.ok(
        aggressive.tokensSaved >= safe.tokensSaved,
        `${replayWith('optimize')} — safe saved ${safe.tokensSaved} and aggressive `
          + `saved ${aggressive.tokensSaved} on ${JSON.stringify(prompt).slice(0, 60)}`,
      );
    }
  });

  it('refuses a level it does not have rather than quietly running another', () => {
    /*
      Named in the source as a defect that shipped: an unknown level ran `safe`
      and said nothing, so a report claimed work at a level nobody had asked
      for. Held here across every spelling somebody plausibly types.
    */
    for (const level of ['balanced', 'SAFE', 'Aggressive', '', 'none', 'default']) {
      assert.throws(
        () => optimize('hello', { level }),
        `${replayWith('optimize')} — level ${JSON.stringify(level)} was accepted`,
      );
    }
    for (const level of RULE_LEVELS) {
      assert.doesNotThrow(() => optimize('hello', { level }));
    }
  });
});
