import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import { describe, it } from 'node:test';

register('./helpers/loader.mjs', import.meta.url);

const { SLOT_IDS } = await import('../../../packages/core/dist/index.js');
const { getWebMessages } = await import('../lib/i18n/index.ts');

/**
 * The interview's words, on the web.
 *
 * The catalogue lives in `@trazum/core` and the questions live here, the same
 * split the CLI uses. A slot with no copy is not a cosmetic gap — it is a
 * question nobody can be asked, and the form would render a blank card.
 */

const LOCALES = ['en', 'es'];

describe('every slot can be asked on the web, in every locale', () => {
  it('has a question and an unlocks line for each', () => {
    assert.ok(SLOT_IDS.length >= 10, `only ${SLOT_IDS.length} slots`);
    for (const locale of LOCALES) {
      const copy = getWebMessages(locale).write.slots;
      for (const id of SLOT_IDS) {
        assert.ok(copy[id], `${locale} cannot ask ${id}`);
        assert.ok(copy[id].question.trim().length > 0, `${locale}'s question for ${id} is blank`);
        assert.ok(copy[id].unlocks.trim().length > 0, `${locale} says nothing ${id} unlocks`);
      }
    }
  });

  it('asks nothing that is not a slot', () => {
    for (const locale of LOCALES) {
      const extra = Object.keys(getWebMessages(locale).write.slots).filter(
        (id) => !SLOT_IDS.includes(id),
      );
      assert.deepEqual(extra, [], `${locale} has copy for a slot that does not exist`);
    }
  });

  it('asks in different words per locale, or it is one locale twice', () => {
    const en = getWebMessages('en').write.slots;
    const es = getWebMessages('es').write.slots;
    assert.ok(
      SLOT_IDS.some((id) => en[id].question !== es[id].question),
      'both locales ask every question in identical words',
    );
  });
});

describe('the mode says what it will not claim', () => {
  const source = readFileSync(new URL('../components/Writer.tsx', import.meta.url), 'utf8');

  it('renders the refusal to call the prompt perfect beside the figures', () => {
    /**
     * The sentence is the point of the mode, and the easiest thing to drop in a
     * later tidy-up. It has to be rendered, not merely defined: copy that
     * exists in the catalogue and appears nowhere is a promise nobody reads.
     */
    assert.match(source, /t\.write\.notPerfect/);
    for (const locale of LOCALES) {
      assert.match(getWebMessages(locale).write.notPerfect, /perfect|perfecto/i);
    }
  });

  it('offers a decline as an answer rather than only an empty box', () => {
    // A question a reader cannot skip is a question they will answer badly to
    // get past, and a bad answer goes into the prompt where a decline leaves
    // nothing.
    assert.match(source, /answer\(null\)/);
    assert.match(source, /t\.write\.decline/);
  });

  it('asks the server what to ask next instead of deriving it from `missing`', () => {
    // The two look alike and mean different things: `missing` holds only the
    // required slots. Deriving one from the other is how a form skips
    // questions.
    assert.match(source, /state\?\.next/);
    assert.doesNotMatch(source, /missing\[0\]/);
  });
});
