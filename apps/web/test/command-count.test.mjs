import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

/**
 * A number written by hand in copy, held against the thing it counts.
 *
 * The tour's last step told every visitor that "forty-two commands install with
 * npm i -g @trazum/cli", in both locales, while the CLI dispatched 45. Nobody
 * noticed for 3 releases, because a spelled number in a sentence is invisible
 * to every guard this repository had: `every-page.test.js` checks that a
 * command shown *exists*, and `roadmap-forecast.test.js` checks that a command
 * called pending is not already built. Neither looks at a count.
 *
 * The failure is small and the shape of it is not. A visitor who installs on
 * the strength of that sentence and finds a different product than the one they
 * were promised has been told something untrue by the page whose job was to be
 * accurate — and the direction of the error does not matter. This one happened
 * to undersell.
 *
 * ## What it does not do
 *
 * Require that a count be present. Copy is allowed to describe the CLI without
 * counting it, and a guard that forced every locale to carry a number would be
 * a guard that made the copy worse. It checks the counts that *are* written.
 */

const ROOT = new URL('../../../', import.meta.url).pathname;
const I18N = join(ROOT, 'apps/web/lib/i18n');

/** The commands the CLI actually dispatches, from the list every guard reads. */
const dispatched = () => {
  const source = readFileSync(join(ROOT, 'packages/cli/src/index.ts'), 'utf8');
  const start = source.indexOf('const COMMAND_FLAGS');
  const block = source.slice(start, source.indexOf('\n};', start));
  return new Set([...block.matchAll(/^ {2}'?([a-z][a-z-]*)'?:\s*\[/gm)].map((match) => match[1]));
};

/**
 * Numbers written as words, because that is how the defect was written.
 *
 * Only as far as the counts a command set plausibly reaches. A list that ran to
 * a thousand would be a list nobody maintains, and the digits case below covers
 * everything past this.
 */
const SPELLED = Object.freeze({
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
});

const UNITS = Object.freeze({
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
});

/** `forty-two` and `cuarenta y dos` alike, plus plain digits. */
function countsIn(text) {
  const found = [];

  for (const match of text.matchAll(/(\d{1,3})\s+(?:commands|comandos)\b/g)) {
    found.push({ written: match[0].trim(), value: Number(match[1]) });
  }

  const tens = Object.keys(SPELLED).join('|');
  const units = Object.keys(UNITS).join('|');
  const english = new RegExp(`\\b(${tens})(?:-(${units}))?\\s+commands\\b`, 'gi');
  for (const match of text.matchAll(english)) {
    const base = SPELLED[match[1].toLowerCase()];
    const unit = match[2] === undefined ? 0 : UNITS[match[2].toLowerCase()];
    found.push({ written: match[0], value: base + unit });
  }

  const SPANISH_TENS = { veinte: 20, treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60 };
  const SPANISH_UNITS = { uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9 };
  const spanish = new RegExp(
    `\\b(${Object.keys(SPANISH_TENS).join('|')})(?:\\s+y\\s+(${Object.keys(SPANISH_UNITS).join('|')}))?\\s+comandos\\b`,
    'gi',
  );
  for (const match of text.matchAll(spanish)) {
    const base = SPANISH_TENS[match[1].toLowerCase()];
    const unit = match[2] === undefined ? 0 : SPANISH_UNITS[match[2].toLowerCase()];
    found.push({ written: match[0], value: base + unit });
  }

  return found;
}

describe('copy that counts the commands counts them right', () => {
  it('finds the catalogues and the command list, so it is not checking nothing', () => {
    // The failure this file could otherwise have: passing because the i18n
    // directory moved and every loop below ran zero times.
    const files = readdirSync(I18N).filter((name) => name.endsWith('.ts'));
    assert.ok(files.length >= 2, `only ${files.length} i18n files found in ${I18N}`);
    assert.ok(dispatched().size >= 40, 'the command list did not parse');
  });

  it('reads both spellings, so the guard cannot be walked past by writing it out', () => {
    /**
     * The check on the check. The original defect was spelled, so a guard that
     * only understood digits would have let the exact sentence that prompted it
     * through unchanged.
     */
    assert.deepEqual(countsIn('45 commands install'), [{ written: '45 commands', value: 45 }]);
    assert.deepEqual(countsIn('forty-two commands install')[0].value, 42);
    assert.deepEqual(countsIn('sus cuarenta y dos comandos')[0].value, 42);
    assert.deepEqual(countsIn('forty commands')[0].value, 40);
    assert.deepEqual(countsIn('no numbers here at all'), []);
  });

  it('never claims a command count the CLI does not have', () => {
    const total = dispatched().size;
    const wrong = [];
    for (const name of readdirSync(I18N).filter((file) => file.endsWith('.ts'))) {
      const text = readFileSync(join(I18N, name), 'utf8');
      for (const count of countsIn(text)) {
        if (count.value !== total) {
          wrong.push(`${name}: "${count.written}" against ${total} dispatched`);
        }
      }
    }
    assert.deepEqual(
      wrong,
      [],
      'copy states a command count the CLI does not have:\n  ' + wrong.join('\n  '),
    );
  });
});
