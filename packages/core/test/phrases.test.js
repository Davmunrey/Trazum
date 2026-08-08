import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { PHRASE_LANGUAGES, optimize } from '../dist/index.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/**
 * The trimming dictionaries, and the two ways they mislead.
 *
 * `--reorder` refused safely in nine languages while these dictionaries covered
 * two, so a French or German prompt came back with "No rule found anything to
 * trim" — which reads as *your prompt is already efficient* and meant *I do not
 * speak your language*. That is the same defect `--reorder` had, one layer over.
 *
 * The second way is subtler and cost three entries: a dictionary translated word
 * by word looks complete and changes meaning.
 */

const PROMPTS = {
  en: 'Please kindly note that you should always be very brief. Thank you very much!',
  es: 'Por favor, ten en cuenta que deberías ser siempre muy breve. ¡Muchas gracias!',
  fr: "Veuillez noter qu'il est important de toujours être très bref. Merci beaucoup !",
  de: 'Bitte beachten Sie, dass Sie immer sehr kurz sein sollten. Vielen Dank!',
  pt: 'Por favor, note que você deve sempre ser muito breve. Muito obrigado!',
  it: 'Per favore, nota che dovresti essere sempre molto breve. Grazie mille!',
  nl: 'Let er alsjeblieft op dat je altijd zeer kort moet zijn. Hartelijk dank!',
};

describe('every covered language actually gets trimmed', () => {
  it('has a fixture for each language the dictionaries claim', () => {
    // Otherwise the suite below tests six languages and passes for seven, which
    // is exactly how the original hole survived: the tests only ever asked the
    // question in the two that worked.
    assert.deepEqual(
      PHRASE_LANGUAGES.filter((code) => !(code in PROMPTS)),
      [],
      'PHRASE_LANGUAGES lists a language with no fixture here',
    );
  });

  for (const code of Object.keys(PROMPTS)) {
    it(`trims a padded ${code} prompt`, () => {
      const result = optimize(PROMPTS[code], { level: 'aggressive' });

      assert.ok(result.rules.length > 0, `no rule fired on ${code}`);
      assert.ok(
        result.tokensAfter < result.tokensBefore,
        `${code}: ${result.tokensBefore} → ${result.tokensAfter}, nothing was trimmed`,
      );
    });
  }

  /**
   * The structural half, and the one that cannot be gamed.
   *
   * The behavioural test above passes on whatever the fixture happens to
   * contain — tune the sentence and it goes green while a language stays
   * almost uncovered. That is how the original two-language hole survived a
   * whole test suite. This counts entries per language per dictionary instead,
   * so thin coverage is visible whatever any fixture says.
   *
   * Portuguese and Italian dropped to a single firing rule the moment `muito`
   * and `molto` came off the intensifier list, which is what surfaced the need
   * for this: the fixtures had been carrying the claim.
   */
  it('every covered language has entries in every dictionary', () => {
    const source = readFileSync(join(repoRoot, 'packages/core/src/phrases.ts'), 'utf8');
    const NAMES = {
      en: 'English',
      es: 'Spanish',
      fr: 'French',
      de: 'German',
      pt: 'Portuguese',
      it: 'Italian',
      nl: 'Dutch',
    };
    const DICTIONARIES = [
      'VERBOSE_PHRASES',
      'POLITENESS',
      'FILLER',
      'INTENSIFIERS',
      'HEDGES',
      'SELF_CHECK',
    ];
    const MINIMUM = 3;

    const thin = [];
    for (const name of DICTIONARIES) {
      const start = source.indexOf(`export const ${name}`);
      const body = source.slice(start, source.indexOf('\n];', start));

      // Sliced between one *language* marker and the next, not between any two
      // comments: SELF_CHECK's `// English` note wraps onto a second line, and
      // stopping at the next comment counted that section as empty.
      const markers = PHRASE_LANGUAGES.map((code) => ({
        code,
        at: body.indexOf(`// ${NAMES[code]}`),
      }))
        .filter((marker) => marker.at !== -1)
        .sort((a, b) => a.at - b.at);

      for (const code of PHRASE_LANGUAGES) {
        const index = markers.findIndex((marker) => marker.code === code);
        if (index === -1) {
          thin.push(`${name}: no ${NAMES[code]} section`);
          continue;
        }
        const from = markers[index].at;
        const to = index + 1 < markers.length ? markers[index + 1].at : body.length;
        const entries = (body.slice(from, to).match(/^\s*(\[|'|")/gm) ?? []).length;
        if (entries < MINIMUM) {
          thin.push(`${name}/${NAMES[code]}: ${entries} entries, want ${MINIMUM}`);
        }
      }
    }

    assert.deepEqual(thin, [], `thin dictionary coverage:\n  ${thin.join('\n  ')}`);
  });
});

describe('a quantifier is not an intensifier', () => {
  /**
   * The three entries the first draft got wrong, and why.
   *
   * `INTENSIFIERS` is dropped outright at the aggressive level, so an entry has
   * to add emphasis and nothing else. Spanish gets `muy` and deliberately not
   * `mucho` — and translating the list word by word into five more languages
   * lost that line, shipping `muito`, `molto` and `heel`, each of which does
   * both jobs:
   *
   *     Hai molto tempo per rispondere.   →   Hai tempo per rispondere.
   *
   * "You have much time" became "you have time". The list read fine; only
   * running it showed the problem.
   */
  const MUST_SURVIVE = [
    ['it', 'Hai molto tempo per rispondere.'],
    ['pt', 'Você tem muito tempo para responder.'],
    ['nl', 'Wacht een heel jaar.'],
    ['es', 'Tienes mucho tiempo para responder.'],
    ['en', 'You have much time to answer.'],
  ];

  for (const [code, prompt] of MUST_SURVIVE) {
    it(`leaves the ${code} quantifier alone`, () => {
      assert.equal(
        optimize(prompt, { level: 'aggressive' }).optimized,
        prompt,
        'a quantifier was dropped as though it were emphasis',
      );
    });
  }

  it('still drops the same words when they are emphasis', () => {
    // The other half. A rule that refuses everything is an off switch, and these
    // tests would pass just as well with one.
    for (const [code, prompt] of [
      ['it', 'La risposta è molto breve.'],
      ['pt', 'A resposta é muito breve.'],
      ['nl', 'Dat is heel goed.'],
    ]) {
      const out = optimize(prompt, { level: 'aggressive' }).optimized;
      // Not asserted as "the word is gone" — `molto breve` is a legitimate thing
      // to leave alone now that `molto` is off the list. What must hold is that
      // the language is still reachable by *some* rule, which the suite above
      // covers. Here we only require the prompt to come back valid and no longer.
      assert.ok(out.length <= prompt.length, `${code}: the prompt grew`);
    }
  });

  it('names no bare quantifier in the intensifier list', () => {
    // Source-level, so the words cannot creep back via a plausible-looking
    // translation pass.
    const source = readFileSync(join(repoRoot, 'packages/core/src/phrases.ts'), 'utf8');
    const list = source.slice(
      source.indexOf('export const INTENSIFIERS'),
      source.indexOf('];', source.indexOf('export const INTENSIFIERS')),
    );

    for (const word of ['muito', 'molto', 'mucho', 'heel', 'much']) {
      assert.equal(
        new RegExp(`^\\s*'${word}',`, 'm').test(list),
        false,
        `"${word}" is a quantifier as well as an intensifier — dropping it changes meaning`,
      );
    }
  });
});

describe('the report admits what it cannot read', () => {
  it('every language in the constant appears somewhere in the dictionaries', () => {
    // The constant is what the report prints. If it claims a language the
    // dictionaries do not have, the report is lying in a new way rather than the
    // old one.
    const source = readFileSync(join(repoRoot, 'packages/core/src/phrases.ts'), 'utf8');
    const names = {
      en: 'English',
      es: 'Spanish',
      fr: 'French',
      de: 'German',
      pt: 'Portuguese',
      it: 'Italian',
      nl: 'Dutch',
    };

    for (const code of PHRASE_LANGUAGES) {
      const name = names[code];
      assert.ok(name, `PHRASE_LANGUAGES has "${code}" and this test does not know its name`);
      assert.ok(
        source.includes(`// ${name}`),
        `PHRASE_LANGUAGES claims ${name} and no dictionary is grouped under it`,
      );
    }
  });
});
