import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

/**
 * Sentences the page says about where data goes, held to what the server does.
 *
 * The key note told readers to put their key in the server's environment and
 * leave the field empty; the route deliberately never spends a key it was not
 * handed in the request. The history note said nothing leaves the machine; the
 * prompt is sent to the server to be optimised. Both were wrong in the
 * direction a privacy-minded reader would rely on.
 */

const catalogue = (locale) => readFileSync(new URL(`../lib/i18n/${locale}.ts`, import.meta.url), 'utf8');

describe('the page does not promise what the server refuses to do', () => {
  for (const locale of ['en', 'es']) {
    it(`${locale}: no instruction to put a key in the server's environment`, () => {
      assert.doesNotMatch(catalogue(locale), /leave the fields empty|deja los campos vacíos/);
    });

    it(`${locale}: no claim that nothing leaves the machine`, () => {
      assert.doesNotMatch(catalogue(locale), /nothing leaves your machine|nada sale de tu máquina/);
      // The tour's welcome said it of everything; Optimise, Write and Compare
      // post the prompt to this server. Only the bill is read in the page.
      assert.doesNotMatch(catalogue(locale), /nothing you paste or drop is uploaded|nada de lo que pegas o sueltas se sube/);
    });
  }
});
