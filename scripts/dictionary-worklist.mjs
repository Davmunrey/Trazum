#!/usr/bin/env node
/**
 * The worklist a language maintainer would actually be handed.
 *
 * [docs/language-maintainer.md](../docs/language-maintainer.md) asks somebody to
 * read one dictionary's entries for their language and say, entry by entry,
 * which ones survive *does removing this leave the prompt asking for the same
 * thing*. Until this script existed that request could not be scoped: the
 * entries live in one flat array per rule with a `// Dutch` comment marking
 * where each language starts, so a prospective maintainer had to read
 * `phrases.ts` to find out how much they were agreeing to.
 *
 * **The grouping was real and existed only as a comment.** `phrases.test.js`
 * already parses those markers to check no language section is thin, which
 * means the structure was derivable and simply not available to anybody outside
 * this repository's test suite. This prints it.
 *
 *     node scripts/dictionary-worklist.mjs nl
 *     node scripts/dictionary-worklist.mjs fr --json
 *
 * It reads the source rather than the built package on purpose: the comment
 * markers are the only place the grouping is written down, and they do not
 * survive compilation. That is a limitation of the data, stated here rather
 * than worked around — moving the grouping into the data itself would be a
 * refactor of the load-bearing arrays, and this script is what makes the case
 * for it arguable instead of hypothetical.
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const PHRASES = join(here, '..', 'packages', 'core', 'src', 'phrases.ts');

/** The exported arrays that carry per-language entries, and the rule each feeds. */
export const DICTIONARIES = [
  ['VERBOSE_PHRASES', 'verbose-phrases'],
  ['POLITENESS', 'politeness'],
  ['FILLER', 'filler'],
  ['HEDGES', 'hedges'],
  ['INTENSIFIERS', 'intensifiers'],
  ['SELF_CHECK', 'self-check'],
];

/** Marker names, as the comments in `phrases.ts` spell them. */
export const LANGUAGE_NAMES = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  pt: 'Portuguese',
  it: 'Italian',
  nl: 'Dutch',
};

/**
 * The entries of one dictionary that sit under one language's marker.
 *
 * Bounded by the *next language marker*, not by the next comment: `SELF_CHECK`'s
 * English note wraps onto a second line, and stopping at the next comment reads
 * that section as empty. The same trap `phrases.test.js` documents, and the
 * reason this is one function rather than two implementations.
 */
export function sectionEntries(source, dictionary, code) {
  const start = source.indexOf(`export const ${dictionary}`);
  if (start === -1) return null;
  const body = source.slice(start, source.indexOf('\n];', start));

  const markers = Object.entries(LANGUAGE_NAMES)
    .map(([language, name]) => ({ language, at: body.indexOf(`// ${name}`) }))
    .filter((marker) => marker.at !== -1)
    .sort((a, b) => a.at - b.at);

  const index = markers.findIndex((marker) => marker.language === code);
  if (index === -1) return null;

  const from = markers[index].at;
  const to = index + 1 < markers.length ? markers[index + 1].at : body.length;
  const slice = body.slice(from, to);

  const entries = [];
  // A pair `['long phrase', 'short']` is a replacement; a bare string is a
  // deletion. Both shapes are reported, because what a maintainer has to judge
  // differs: one asks *is the short form the same instruction*, the other asks
  // *does the prompt survive losing this at all*.
  for (const [, long, short] of slice.matchAll(/^\s*\['([^']*)',\s*'([^']*)'\]/gm)) {
    entries.push({ from: long, to: short });
  }
  for (const [, word] of slice.matchAll(/^\s*'([^']*)',/gm)) {
    entries.push({ from: word, to: null });
  }
  return entries;
}

export async function worklist(code) {
  const source = await readFile(PHRASES, 'utf8');
  const sections = [];
  for (const [dictionary, rule] of DICTIONARIES) {
    const entries = sectionEntries(source, dictionary, code);
    sections.push({ dictionary, rule, entries: entries ?? [], missing: entries === null });
  }
  return { language: code, name: LANGUAGE_NAMES[code] ?? code, sections };
}

const main = async () => {
  /**
   * A maintainer will pipe this into `head` or `less` and quit.
   *
   * Node's default is to throw `EPIPE` as an unhandled error event, so the
   * first thing anybody following the documented usage saw was a stack trace
   * from a script that had done its job. Found by running it, not by reading it.
   */
  process.stdout.on('error', (error) => {
    if (error.code !== 'EPIPE') throw error;
  });

  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const code = args.find((argument) => !argument.startsWith('--'));

  if (code === undefined || !(code in LANGUAGE_NAMES)) {
    // Naming the set rather than saying "unknown language": the caller cannot
    // guess which codes exist, and the list is short enough to print.
    process.stderr.write(
      `Usage: node scripts/dictionary-worklist.mjs <${Object.keys(LANGUAGE_NAMES).join('|')}> [--json]\n`,
    );
    process.exitCode = 2;
    return;
  }

  const report = await worklist(code);
  if (json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }

  const total = report.sections.reduce((sum, section) => sum + section.entries.length, 0);
  process.stdout.write(`${report.name}: ${total} entries across ${report.sections.length} rules\n`);
  for (const section of report.sections) {
    process.stdout.write(`\n${section.rule} (${section.entries.length})\n`);
    if (section.missing) {
      process.stdout.write('  no section under this language\n');
      continue;
    }
    for (const entry of section.entries) {
      process.stdout.write(
        entry.to === null ? `  ${entry.from} → (deleted)\n` : `  ${entry.from} → ${entry.to}\n`,
      );
    }
  }
  process.stdout.write(
    `\nEvery line is one judgement: does the right-hand side ask for the same thing?\n`,
  );
};

// Importable for the guard, runnable for a maintainer. `import.meta.main` is
// not available on the Node versions this repository supports.
if (process.argv[1] && process.argv[1].endsWith('dictionary-worklist.mjs')) await main();
