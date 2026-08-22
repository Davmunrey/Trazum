import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { PHRASE_LANGUAGES } from '../dist/index.js';
import {
  DICTIONARIES,
  LANGUAGE_NAMES,
  sectionEntries,
} from '../../../scripts/dictionary-worklist.mjs';

/**
 * The worklist a maintainer is handed, and whether it is the whole list.
 *
 * `docs/language-maintainer.md` asks somebody to read one dictionary's entries
 * and judge them one by one. A worklist that silently omits entries would be
 * asking for a review of a subset while recording it as a review — which is the
 * same failure the standing record exists to stop, one layer in.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const SCRIPT = join(repoRoot, 'scripts', 'dictionary-worklist.mjs');
const source = () => readFileSync(join(repoRoot, 'packages', 'core', 'src', 'phrases.ts'), 'utf8');

/**
 * Every entry in a dictionary's body, ignoring the language markers entirely.
 *
 * Deliberately a *second, different* parse. The worklist slices between markers;
 * this counts the whole array. An entry written above the first marker, or after
 * a marker for a language nobody listed, belongs to no section and would vanish
 * from every worklist while still editing people's prompts.
 */
const allEntries = (text, dictionary) => {
  const start = text.indexOf(`export const ${dictionary}`);
  const body = text.slice(start, text.indexOf('\n];', start));
  const pairs = [...body.matchAll(/^\s*\['([^']*)',\s*'([^']*)'\]/gm)].length;
  const words = [...body.matchAll(/^\s*'([^']*)',/gm)].length;
  return pairs + words;
};

describe('the worklist is the whole list', () => {
  it('accounts for every entry in every dictionary', () => {
    const text = source();
    const orphaned = [];
    for (const [dictionary] of DICTIONARIES) {
      let sectioned = 0;
      for (const code of PHRASE_LANGUAGES) sectioned += (sectionEntries(text, dictionary, code) ?? []).length;
      const total = allEntries(text, dictionary);
      if (sectioned !== total) {
        orphaned.push(`${dictionary}: ${total - sectioned} entries under no language marker`);
      }
    }
    assert.deepEqual(
      orphaned,
      [],
      `these entries edit prompts and appear on nobody's worklist:\n  ${orphaned.join('\n  ')}`,
    );
  });

  it('would notice an entry written above the first marker', () => {
    /**
     * The check above only ever sees a file where every entry is under a
     * marker, so it cannot fail here. Handed one where an entry sits before the
     * first `// English`, the two parses must disagree.
     */
    const fabricated = [
      "export const FILLER: readonly string[] = [",
      "  'orphaned entry',",
      '  // English',
      "  'as you know',",
      '];',
      '',
    ].join('\n');
    const sectioned = PHRASE_LANGUAGES.reduce(
      (sum, code) => sum + (sectionEntries(fabricated, 'FILLER', code) ?? []).length,
      0,
    );
    assert.equal(allEntries(fabricated, 'FILLER'), 2);
    assert.equal(sectioned, 1);
  });

  it('has a section for every language in every dictionary', () => {
    const text = source();
    const gaps = [];
    for (const [dictionary] of DICTIONARIES) {
      for (const code of PHRASE_LANGUAGES) {
        const entries = sectionEntries(text, dictionary, code);
        if (entries === null || entries.length === 0) gaps.push(`${dictionary}/${code}`);
      }
    }
    assert.deepEqual(gaps, [], `no worklist would be produced for: ${gaps.join(', ')}`);
  });

  it('knows the same languages the dictionaries claim', () => {
    assert.deepEqual(Object.keys(LANGUAGE_NAMES).sort(), [...PHRASE_LANGUAGES].sort());
  });
});

describe('the counts the page quotes', () => {
  /**
   * The page tells a volunteer how much work they are agreeing to, in a table of
   * five numbers. Every long-lived defect on this project's record is a claim in
   * prose that nothing checked, and a count that drifts downward would be
   * understating somebody's commitment to their face.
   */
  const page = () => readFileSync(join(repoRoot, 'docs', 'language-maintainer.md'), 'utf8');

  const countFor = (text, code) =>
    DICTIONARIES.reduce(
      (sum, [dictionary]) => sum + (sectionEntries(text, dictionary, code) ?? []).length,
      0,
    );

  it('matches what the worklist actually produces', () => {
    const text = source();
    const doc = page();
    const wrong = [];
    for (const code of PHRASE_LANGUAGES) {
      const name = LANGUAGE_NAMES[code];
      const row = doc.match(new RegExp(`^ *\\| ${name} \\| (\\d+) \\|$`, 'm'));
      if (row === null) continue; // Only the unreviewed five are tabulated.
      const quoted = Number(row[1]);
      const actual = countFor(text, code);
      if (quoted !== actual) wrong.push(`${name}: page says ${quoted}, worklist has ${actual}`);
    }
    assert.deepEqual(wrong, [], `the page understates or overstates the work:\n  ${wrong.join('\n  ')}`);
  });

  it('tabulates every unreviewed language and no reviewed one', () => {
    const doc = page();
    const tabulated = PHRASE_LANGUAGES.filter((code) =>
      new RegExp(`^ *\\| ${LANGUAGE_NAMES[code]} \\| \\d+ \\|$`, 'm').test(doc),
    );
    assert.deepEqual([...tabulated].sort(), ['de', 'fr', 'it', 'nl', 'pt']);
  });

  it('would notice a table that had drifted from the source', () => {
    // Handed a page quoting a number nothing produces, the comparison must reject it.
    const doc = '| Dutch | 9999 |\n';
    const row = doc.match(/^\| Dutch \| (\d+) \|$/m);
    assert.notEqual(Number(row[1]), countFor(source(), 'nl'));
  });
});

describe('running it', () => {
  const run = (args) =>
    spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', timeout: 30000 });

  it('prints a count and one line per entry', () => {
    const result = run(['nl']);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /^Dutch: \d+ entries across 6 rules/);
    assert.match(result.stdout, /verbose-phrases \(\d+\)/);
    // A replacement and a deletion read differently, because the judgement differs.
    assert.match(result.stdout, / → omdat/);
    assert.match(result.stdout, /→ \(deleted\)/);
  });

  it('refuses a language the dictionaries do not cover, and names the set', () => {
    const result = run(['ja']);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /en\|es\|fr\|de\|pt\|it\|nl/);
    assert.equal(result.stdout, '');
  });

  it('refuses with no language at all rather than picking one', () => {
    assert.equal(run([]).status, 2);
  });

  it('emits JSON a tool can read', () => {
    const parsed = JSON.parse(run(['fr', '--json']).stdout);
    assert.equal(parsed.language, 'fr');
    assert.equal(parsed.name, 'French');
    assert.equal(parsed.sections.length, DICTIONARIES.length);
    assert.ok(parsed.sections.every((section) => section.entries.length > 0));
  });

  it('survives its output being closed early', () => {
    /**
     * A maintainer pipes this into `head` or `less` and quits. Node's default
     * is to throw EPIPE as an unhandled error, so the documented usage printed
     * a stack trace from a script that had already done its job. Found by
     * running it.
     */
    const piped = execFileSync('sh', ['-c', `node ${JSON.stringify(SCRIPT)} en 2>&1 | head -1`], {
      encoding: 'utf8',
    });
    assert.match(piped, /^English: \d+ entries/);
    assert.doesNotMatch(piped, /EPIPE|Unhandled/);
  });
});
