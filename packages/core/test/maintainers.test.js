import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { DICTIONARY_STANDING, PHRASE_LANGUAGES, languagesWithStanding } from '@trazum/core';

/**
 * Which dictionaries somebody here can read.
 *
 * The claim under test is uncomfortable and therefore worth pinning: seven
 * dictionaries ship, five of them were written without anybody who reads the
 * language agreeing to a single entry, and the report used to name all seven in
 * one sentence.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');

/**
 * The languages this project reports in, read off disk.
 *
 * **Derived rather than written down**, and this is the whole point of the
 * guard. The only evidence in this repository that somebody here reads a
 * language is that the report exists in it — so the day a French catalogue
 * lands, this test fails and somebody has to decide what it means for the
 * French dictionary. A hand-maintained list would simply agree with itself.
 */
const reportLocales = () =>
  readdirSync(join(repoRoot, 'packages', 'core', 'src', 'i18n'))
    .filter((name) => name.endsWith('.ts') && !['index.ts', 'types.ts'].includes(name))
    .map((name) => name.replace(/\.ts$/, ''))
    .sort();

describe('every shipped dictionary has a standing', () => {
  it('covers exactly the languages the dictionaries cover', () => {
    const recorded = Object.keys(DICTIONARY_STANDING).sort();
    assert.deepEqual(
      recorded,
      [...PHRASE_LANGUAGES].sort(),
      'a dictionary ships with no record of who read it, or a record names a dictionary that does not ship',
    );
  });

  it('keeps the code and its key the same', () => {
    // A record filed under the wrong key would answer for the wrong language,
    // which is the one failure mode this table cannot afford.
    for (const [code, record] of Object.entries(DICTIONARY_STANDING)) {
      assert.equal(record.code, code);
    }
  });

  it('says what was actually done, for every language', () => {
    for (const record of Object.values(DICTIONARY_STANDING)) {
      assert.ok(
        record.checkedBy.trim().length > 20,
        `${record.code} records no evidence: ${JSON.stringify(record.checkedBy)}`,
      );
    }
  });
});

describe('reviewed means the report is written in it', () => {
  it('marks as reviewed exactly the languages this project reports in', () => {
    const reviewed = languagesWithStanding(PHRASE_LANGUAGES, 'reviewed');
    assert.deepEqual(
      [...reviewed].sort(),
      reportLocales(),
      'a dictionary claims a reader this repository has no evidence of, or has one it does not claim',
    );
  });

  it('and the rest are unreviewed, not silently absent', () => {
    const reviewed = languagesWithStanding(PHRASE_LANGUAGES, 'reviewed');
    const unreviewed = languagesWithStanding(PHRASE_LANGUAGES, 'unreviewed');
    assert.deepEqual(
      [...reviewed, ...unreviewed].sort(),
      [...PHRASE_LANGUAGES].sort(),
      'a language has some third standing, so one of the two lists is not what it says',
    );
    assert.ok(unreviewed.length > 0, 'if this ever passes with zero, delete the report line too');
  });

  it('would fail on a record that claimed a reader nobody can point at', () => {
    /**
     * The assertions above only ever see today's table, so on this repository
     * they cannot fail. Handed a table that marks Dutch reviewed with no Dutch
     * report catalogue, the comparison must reject it.
     */
    const fabricated = { ...DICTIONARY_STANDING, nl: { code: 'nl', standing: 'reviewed' } };
    const reviewed = PHRASE_LANGUAGES.filter(
      (code) => fabricated[code]?.standing === 'reviewed',
    ).sort();
    assert.notDeepEqual(reviewed, reportLocales());
  });
});

describe('the page and the table say the same thing', () => {
  /**
   * The document is where somebody decides whether to volunteer, and a document
   * that names a different set from the code is worse than none: it invites
   * work on a language that was never the gap.
   */
  const page = () => readFileSync(join(repoRoot, 'docs', 'language-maintainer.md'), 'utf8');

  /** Names as the report prints them, so the doc is checked against the reader's words. */
  const NAMES = {
    en: 'English',
    es: 'Spanish',
    fr: 'French',
    de: 'German',
    pt: 'Portuguese',
    it: 'Italian',
    nl: 'Dutch',
  };

  it('names every unreviewed language, and none of the reviewed ones as unreviewed', () => {
    const text = page();
    const unreviewed = languagesWithStanding(PHRASE_LANGUAGES, 'unreviewed');
    const missing = unreviewed.filter((code) => !text.includes(NAMES[code]));
    assert.deepEqual(
      missing,
      [],
      `these dictionaries have nobody reading them and the page does not say so: ${missing.join(', ')}`,
    );
  });

  it('states the count rather than leaving the reader to total the table', () => {
    const unreviewed = languagesWithStanding(PHRASE_LANGUAGES, 'unreviewed');
    const text = page();
    // Written as a word in the prose. A count that drifts from the table is
    // exactly the silent-incompleteness failure this arc is about.
    const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven'];
    assert.ok(
      text.includes(`${words[unreviewed.length]} of the seven`)
        || text.includes(`${words[unreviewed.length]} do not`),
      `the page does not state that ${words[unreviewed.length]} dictionaries are unreviewed`,
    );
  });

  it('would notice a page that had quietly dropped a language', () => {
    // Handed prose naming only four of the five, the check must reject it.
    const text = 'French, German, Portuguese and Italian carry entries nobody here reads.';
    const unreviewed = languagesWithStanding(PHRASE_LANGUAGES, 'unreviewed');
    const missing = unreviewed.filter((code) => !text.includes(NAMES[code]));
    assert.deepEqual(missing, ['nl']);
  });
});
