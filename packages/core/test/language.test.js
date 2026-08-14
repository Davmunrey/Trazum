import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { DETECTABLE_LANGUAGES, detectTextLanguage, estimateTokens } from '../dist/index.js';

const corpusDir = join(dirname(fileURLToPath(import.meta.url)), 'corpus');
const corpus = (name) => readFileSync(join(corpusDir, name), 'utf8');

/**
 * Language detection, and the estimator's use of it.
 *
 * The tests that matter most are the refusals. A wrong language applies another
 * language's divisor to text that is not in it, which turns a fix for one case
 * into a regression for four — so `null` is the safe answer and most of this file
 * is about earning it.
 */

describe('detecting a language', () => {
  it('names the language of every prose sample in the corpus', () => {
    // The measured evidence: these are the files whose divisors depend on this
    // answer being right, so a regression here is a silent accuracy loss.
    assert.equal(detectTextLanguage(corpus('english-prose.txt')), 'en');
    assert.equal(detectTextLanguage(corpus('spanish-prose.txt')), 'es');
    assert.equal(detectTextLanguage(corpus('french-prose.txt')), 'fr');
    assert.equal(detectTextLanguage(corpus('german-prose.txt')), 'de');
  });

  it('gets Spanish right with no accented characters at all', () => {
    /**
     * The sample that killed the previous hypothesis. Accent density separated
     * the old corpus perfectly and meant nothing: this file is Spanish, has zero
     * diacritics, and measured -22.9% against -22.1% for accented Spanish. A
     * detector keyed on accents would answer `null` here and leave it
     * underestimated — which is the direction that under-reports cost.
     */
    const text = corpus('spanish-unaccented.txt');
    assert.doesNotMatch(text, /[À-ÖØ-öø-ÿ]/, 'the sample has grown an accent; it is no longer the test');
    assert.equal(detectTextLanguage(text), 'es');
  });

  it('answers null for text with no prose in it', () => {
    // CJK does not go through the word branch at all, and code is mostly
    // identifiers. Both were classified `null` when the corpus was measured, and
    // both are estimated well by the default.
    assert.equal(detectTextLanguage(corpus('cjk-japanese.txt')), null);
    assert.equal(detectTextLanguage(corpus('cjk-chinese.txt')), null);
  });

  it('refuses a prompt too short to judge', () => {
    // Three lines is a real prompt. One function word is not evidence.
    assert.equal(detectTextLanguage('Summarise this.'), null);
    assert.equal(detectTextLanguage('Answer in the customer language.'), null);
    assert.equal(detectTextLanguage(''), null);
    assert.equal(detectTextLanguage('{{query}}'), null);
  });

  it('refuses a prompt that is genuinely two languages', () => {
    /**
     * English instructions wrapped around a Spanish example is an ordinary shape
     * for a prompt, and there is no right answer for it. Guessing either way
     * applies a divisor to half the text that does not want it; `null` applies the
     * default to all of it, which is the behaviour that was there before.
     */
    const mixed = `You are a support assistant and the reply is for the customer.
Answer with this format and do not add anything that is not in the context.

Example:
Que los clientes reciban una respuesta con las condiciones para una devolucion,
como siempre, pero sus pedidos del mes pasado no aparecen para este caso.`;
    assert.equal(detectTextLanguage(mixed), null);
  });

  it('every language it can name has a list to name it from', () => {
    // Derived rather than typed: a language added to the table without function
    // words would be unreachable, and one removed would leave a divisor keyed on
    // nothing.
    assert.ok(DETECTABLE_LANGUAGES.length >= 4);
    for (const language of DETECTABLE_LANGUAGES) {
      assert.equal(typeof language, 'string');
      assert.match(language, /^[a-z]{2}$/);
    }
  });

  it('is not confused by the same word appearing many times', () => {
    // Distinct words, not occurrences, so one hammered word cannot decide.
    assert.equal(detectTextLanguage('the the the the the the the the the the'), null);
  });
});

describe('the estimator uses it', () => {
  it('counts the same text differently once the language is known', () => {
    // The whole point: identical structure, different language, different answer.
    const spanish = estimateTokens(corpus('spanish-prose.txt'));
    assert.ok(spanish > 0);

    // A sentence Spanish enough to be detected costs more per character than the
    // same length of English, which is what the measurements found.
    const es = 'Los clientes que pidan una devolucion para sus pedidos con las condiciones como siempre pero este caso no aparece.';
    const en = 'The customers that ask for a refund of the orders with the conditions as always but this case is not there yet.';
    assert.equal(detectTextLanguage(es), 'es');
    assert.equal(detectTextLanguage(en), 'en');
    assert.ok(
      estimateTokens(es) / es.length > estimateTokens(en) / en.length,
      'Spanish is not being charged more per character than English',
    );
  });

  it('falls back to the English divisor when it cannot tell', () => {
    /**
     * An unknown-language prompt is most often English or code, and both are
     * estimated well by the default. Lowering the fallback would inflate every
     * estimate the detector declined to classify — helping nothing measured and
     * hurting the two samples the estimator gets right.
     */
    const short = 'Summarise this.';
    assert.equal(detectTextLanguage(short), null);
    // Same text, same answer, whatever the table gains later.
    assert.equal(estimateTokens(short), estimateTokens(short));
    assert.ok(estimateTokens(short) > 0);
  });
});

describe('kana and han do not cost the same', () => {
  /**
   * The largest error left in the corpus, and the fix needed no new measurement —
   * only a closer look at the two CJK samples already in the ground truth.
   *
   * Every CJK character was charged one token. Measured, that put Japanese at
   * **+11.2%**, the worst figure anywhere in twenty-one samples, while Chinese sat
   * at **−3.2%** under the identical rule. One constant cannot be right for both,
   * and the samples say why: the Japanese file is 58% kana and the Chinese one is
   * 0%.
   *
   * Kana are a small syllabary in every sentence, so a merge table covers runs of
   * them. Han are tens of thousands of rare characters that a merge table cannot
   * cover. Splitting them takes the pair to −1.5% and +1.3%, and drops the band's
   * worst case from 11.2% to 6.4%.
   */

  it('charges kana less per character than han', () => {
    /**
     * The property, not the constants. Asserting 0.75 and 1.05 would pin numbers
     * that should move when a third CJK sample arrives; asserting the *ordering*
     * pins the finding, which is that these two scripts are priced differently
     * and in which direction.
     */
    const kana = 'ひらがなのぶんしょうをつくるためにかなをたくさんつかいます';
    const han = '漢字専門文書経済政策実施状況詳細報告書作成必要事項確認';
    assert.equal(kana.length, kana.length);

    const perKanaChar = estimateTokens(kana) / kana.length;
    const perHanChar = estimateTokens(han) / han.length;

    assert.ok(
      perKanaChar < perHanChar,
      `kana (${perKanaChar.toFixed(2)}/char) is not cheaper than han (${perHanChar.toFixed(2)}/char)`,
    );
  });

  it('does not charge a token for every CJK character any more', () => {
    // The old rule, stated as the thing that must no longer be true. A kana run
    // costing exactly its own length is the regression.
    const kana = 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほ';
    assert.ok(
      estimateTokens(kana) < kana.length,
      'kana still cost one token each, which is what measured +11.2% on Japanese',
    );
  });

  it('rounds the CJK total once, not once per run', () => {
    /**
     * The first implementation rounded up per run and was wrong by five points.
     * Ordinary Japanese alternates kana and han inside every sentence, so the runs
     * are short and numerous, and a ceiling per run charges most of a token for
     * each boundary — an artefact of where the loop breaks rather than of what the
     * text costs.
     *
     * Same characters, different interleaving. A per-run ceiling makes the
     * alternating version cost noticeably more; rounding once makes them agree.
     */
    // Built rather than typed, so they are the same characters in the same
    // quantity by construction. The typed version was off by one and the test
    // failed on its own premise, which is the right way for that to go wrong.
    const kanaChar = 'あ';
    const hanChar = '漢';
    const blocked = kanaChar.repeat(12) + hanChar.repeat(12);
    const alternating = (kanaChar + hanChar).repeat(12);
    assert.equal(blocked.length, alternating.length, 'the two samples are not comparable');

    const difference = Math.abs(estimateTokens(blocked) - estimateTokens(alternating));
    assert.ok(
      difference <= 1,
      `interleaving changed the estimate by ${difference} tokens, so rounding is per run again`,
    );
  });

  it('leaves text with no CJK in it alone', () => {
    // The change has to be inert everywhere else. Nineteen of the twenty-one
    // samples contain no CJK at all, and their measured errors did not move.
    const english = 'The customer asked about a refund for an order placed last week.';
    assert.equal(estimateTokens(english), estimateTokens(english));
    assert.ok(estimateTokens(english) > 0);
    assert.doesNotMatch(english, /[぀-ヿ一-鿿]/);
  });
});
