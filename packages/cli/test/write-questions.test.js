import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LOCALES, SLOT_IDS } from '../../core/dist/index.js';
import { getCliMessages } from '../dist/i18n/index.js';

/**
 * The words are the product in this command.
 *
 * `@trazum/core` knows a slot exists and what opens it; this package knows how
 * to ask it. A slot with no question is not a cosmetic gap — it is a question
 * nobody can be asked, and the interview would stop on a blank line.
 *
 * Held in both directions, the way the rules catalogue is: a slot with no
 * entry fails, and an entry for a slot that does not exist fails too. The
 * second is the one that goes unnoticed, because it costs nothing at runtime
 * and quietly documents a question the tool cannot ask.
 */

describe('every slot can be asked in every locale', () => {
  it('has a question and an unlocks line for each, in each locale', () => {
    assert.ok(LOCALES.length >= 2, `only ${LOCALES.length} locale`);
    assert.ok(SLOT_IDS.length >= 10, `only ${SLOT_IDS.length} slots`);
    for (const locale of LOCALES) {
      const copy = getCliMessages(locale).write.slots;
      for (const id of SLOT_IDS) {
        assert.ok(copy[id], `${locale} cannot ask ${id}`);
        assert.ok(copy[id].question.trim().length > 0, `${locale}'s question for ${id} is blank`);
        assert.ok(copy[id].unlocks.trim().length > 0, `${locale} says nothing about what ${id} unlocks`);
      }
    }
  });

  it('asks nothing that is not a slot', () => {
    for (const locale of LOCALES) {
      const extra = Object.keys(getCliMessages(locale).write.slots).filter((id) => !SLOT_IDS.includes(id));
      assert.deepEqual(extra, [], `${locale} has copy for a slot that does not exist`);
    }
  });

  it('asks a different question in each locale, so this is not one locale twice', () => {
    /**
     * The check above passes on a build that returns the English copy for
     * every locale. Somewhere the wording has to differ, or "every locale can
     * ask it" is a sentence about one locale.
     */
    const first = getCliMessages(LOCALES[0]).write.slots;
    const differing = LOCALES.slice(1).filter((locale) => {
      const copy = getCliMessages(locale).write.slots;
      return SLOT_IDS.some((id) => copy[id].question !== first[id].question);
    });
    assert.deepEqual(
      differing,
      LOCALES.slice(1),
      'a locale asks every question in the same words as the first, so it is not translated',
    );
  });

  it('counts the missing answers in the language it is refusing in', () => {
    for (const locale of LOCALES) {
      const write = getCliMessages(locale).write;
      assert.notEqual(write.missing(1), write.missing(3), `${locale} ignores how many are missing`);
      assert.ok(write.done().trim().length > 0);
    }
  });
});
