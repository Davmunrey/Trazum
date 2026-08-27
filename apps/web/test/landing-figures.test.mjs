import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../../..');
const read = (relative) => readFileSync(join(root, relative), 'utf8');

/**
 * The landing counts things, in five languages, by hand.
 *
 * `docs/` has been derived from the product for a long time: `every-page.test.js`
 * walks it, reads every `trazum <command>` invocation out of the pages and
 * checks each one against `COMMAND_FLAGS`. That walk stops at `docs/`. The
 * landing is a `.tsx` with five copies of the same paragraph in it, and its
 * figures were typed.
 *
 * They drifted, as typed figures do. It shipped saying "39 commands" while the
 * CLI dispatched 45, and "twenty-four contracts" was written as a word — five
 * words, one per locale — which no derivation can check at all. Both were
 * corrected by hand, which is the same mechanism that broke them.
 *
 * So: the counts come from the product, the landing must state them as
 * digits, and every locale is read. A figure spelled as a word is refused
 * rather than translated, because a table of number words in five languages is
 * exactly the kind of unverifiable prose this repository does not write.
 */

/** Commands, from the dispatch table — the same parse `every-page.test.js` uses. */
function commandCount() {
  const source = read('packages/cli/src/index.ts');
  const start = source.indexOf('const COMMAND_FLAGS');
  assert.notEqual(start, -1, 'COMMAND_FLAGS is no longer where this test looks for it');
  const block = source.slice(start, source.indexOf('\n};', start));
  const names = new Set([...block.matchAll(/^ {2}'?([a-z][a-z-]*)'?:\s*\[/gm)].map((m) => m[1]));
  assert.ok(names.size >= 30, `only ${names.size} commands parsed out of COMMAND_FLAGS`);
  return names.size;
}

/** Contracts, from the list `conform` validates against. */
function contractCount() {
  const source = read('packages/core/src/conform.ts');
  const start = source.indexOf('export const CONTRACT_NAMES');
  assert.notEqual(start, -1, 'CONTRACT_NAMES is no longer where this test looks for it');
  const block = source.slice(start, source.indexOf('] as const', start));
  const names = new Set([...block.matchAll(/'([a-z][a-z0-9-]*)'/g)].map((m) => m[1]));
  assert.ok(names.size >= 10, `only ${names.size} contracts parsed out of CONTRACT_NAMES`);
  return names.size;
}

/**
 * The nouns each locale counts with, and nothing else.
 *
 * Deliberately not a general number-noun matcher. These two nouns are the two
 * figures the landing states, in the five languages the landing is written in;
 * a sixth locale or a third counted thing arrives with its own row, and until
 * it does this asserts on exactly what exists.
 */
const COUNTED = {
  commands: ['commands', 'comandos', 'commandes', 'Befehle'],
  contracts: ['contracts', 'contratos', 'contrats', 'Verträge'],
};

/** Number words that have stood in for a figure here, in the landing's languages. */
const SPELLED = [
  'twenty', 'thirty', 'forty', 'fifty',
  'veinti', 'treinta', 'cuarenta', 'cincuenta',
  'vingt', 'trente', 'quarante', 'cinquante',
  'zwanzig', 'dreißig', 'vierzig', 'fünfzig',
  'vinte', 'trinta', 'quarenta', 'cinquenta',
];

describe('the landing states counts the product can confirm', () => {
  const landing = read('apps/web/app/landing/page.tsx');
  /* Comments and identifiers are not copy; only the quoted strings are read. */
  const copy = [...landing.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1]);
  const prose = copy.filter((line) => line.length > 24);

  it('reads the copy it claims to read', () => {
    assert.ok(prose.length >= 100, `only ${prose.length} copy strings found in the landing`);
  });

  it('states the number of commands the CLI dispatches, in every locale', () => {
    const expected = commandCount();
    const claims = [];
    for (const line of prose) {
      for (const noun of COUNTED.commands) {
        for (const match of line.matchAll(new RegExp(`(\\d+)\\s+${noun}\\b`, 'g'))) {
          claims.push({ noun, said: Number(match[1]) });
        }
      }
    }
    assert.ok(claims.length >= 5, `only ${claims.length} locales state a command count`);
    for (const claim of claims) {
      assert.equal(
        claim.said,
        expected,
        `the landing says ${claim.said} ${claim.noun}; COMMAND_FLAGS dispatches ${expected}`,
      );
    }
  });

  it('states the number of contracts the format has, in every locale', () => {
    const expected = contractCount();
    const claims = [];
    for (const line of prose) {
      for (const noun of COUNTED.contracts) {
        for (const match of line.matchAll(new RegExp(`(\\d+)\\s+${noun}\\b`, 'g'))) {
          claims.push({ noun, said: Number(match[1]) });
        }
      }
    }
    assert.ok(claims.length >= 5, `only ${claims.length} locales state a contract count`);
    for (const claim of claims) {
      assert.equal(
        claim.said,
        expected,
        `the landing says ${claim.said} ${claim.noun}; CONTRACT_NAMES has ${expected}`,
      );
    }
  });

  /**
   * A figure written as a word is outside what any derivation can reach, so it
   * is refused at the point it is written rather than checked afterwards.
   */
  it('never spells a counted figure as a word', () => {
    const nouns = [...COUNTED.commands, ...COUNTED.contracts];
    for (const line of prose) {
      for (const noun of nouns) {
        const at = line.indexOf(noun);
        if (at === -1) continue;
        const before = line.slice(Math.max(0, at - 40), at).toLowerCase();
        for (const word of SPELLED) {
          assert.ok(
            !before.includes(word),
            `the landing spells a count as a word before "${noun}": …${before.trim()} ${noun}. `
              + 'Write the digits, so the figure can be checked against the product.',
          );
        }
      }
    }
  });
});
