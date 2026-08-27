import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (relativePath) => readFileSync(join(ROOT, relativePath), 'utf8');

/**
 * Every count this repository states about itself, checked against itself.
 *
 * The product's own argument is that a figure with nothing deriving it drifts.
 * This repository proved it three times in one week, in three different files,
 * with the same number.
 *
 * `every-page.test.js` reads every documented `trazum <command>` invocation out
 * of `docs/` and checks it against `COMMAND_FLAGS`, so a renamed command cannot
 * survive in the prose. What it never checked is how many of them there are,
 * and its walk stops at `docs/` — so `README.md`, `plugin/README.md` and
 * `docs/licensing.md` all said **42 commands** against a CLI dispatching 45,
 * the landing said **39** in five languages, `ROADMAP.md` said the doctrine has
 * **twenty rules** when it has 24, and nothing anywhere failed. The plugin
 * README ships with the Claude Code plugin, so that one was wrong in a
 * published artefact.
 *
 * Two rules follow, and the second is why the first can work at all:
 *
 * 1. A count of something this repository contains is derived from the thing
 *    it counts.
 * 2. It is written in digits. A figure spelled as a word is outside what any
 *    derivation can reach, and translating one into five languages to check it
 *    would mean writing a number-word table nobody could verify — exactly the
 *    unverifiable prose this repository refuses elsewhere.
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

/** A `[...] as const` list in a source file, counted by its quoted entries. */
function listCount(path, declaration, floor) {
  const source = read(path);
  const start = source.indexOf(declaration);
  assert.notEqual(start, -1, `${declaration} is no longer in ${path}`);
  const block = source.slice(start, source.indexOf('] as const', start));
  const names = new Set([...block.matchAll(/'([a-z][a-z0-9-]*)'/g)].map((m) => m[1]));
  assert.ok(names.size >= floor, `only ${names.size} entries parsed out of ${declaration}`);
  return names.size;
}

/** The providers with at least one model priced. */
function providerCount() {
  const source = read('packages/core/src/pricing.ts');
  const providers = new Set([...source.matchAll(/^\s+provider: '([a-z]+)',$/gm)].map((m) => m[1]));
  assert.ok(providers.size >= 5, `only ${providers.size} providers parsed out of the catalogue`);
  return providers.size;
}

/** The doctrine's rules are its `##` headings — the same parse `doctrine.test.js` uses. */
function doctrineRuleCount() {
  const rules = [...read('docs/doctrine.md').matchAll(/^## (.+)$/gm)];
  assert.ok(rules.length >= 20, `only ${rules.length} rules found in docs/doctrine.md`);
  return rules.length;
}

/** The optimisation rules, counted as the entries of the dispatch array. */
function optimisationRuleCount() {
  const source = read('packages/core/src/rules.ts');
  const start = source.indexOf('export const RULES: readonly Rule[] = [');
  assert.notEqual(start, -1, 'RULES is no longer where this test looks for it');
  const block = source.slice(start, source.indexOf('\n];', start));
  const names = new Set([...block.matchAll(/^ {2}(\w+Rule),$/gm)].map((m) => m[1]));
  assert.ok(names.size >= 8, `only ${names.size} rules parsed out of RULES`);
  return names.size;
}

/** The subset of commands the browser playground dispatches. */
function playgroundCommandCount() {
  return listCount('apps/web/lib/playground.ts', 'export const PLAYGROUND_COMMANDS', 5);
}

/**
 * What each countable noun counts, and where the number comes from.
 *
 * Two nouns are ambiguous, and both are disambiguated the way a reader does
 * it: by what the surrounding paragraph is about. This repository has
 * optimisation rules and doctrine rules, and it has the CLI's commands and the
 * browser playground's subset of them. A paragraph naming the doctrine is
 * counting doctrine rules; one naming the playground is counting its commands;
 * anything else is the CLI and the optimiser.
 *
 * Matched per paragraph rather than per line because prose wraps: the sentence
 * that said "ten commands" had "Playground" two lines above it.
 */
const COUNTED = [
  { noun: 'commands', of: playgroundCommandCount, only: /playground/i },
  { noun: 'commands', of: commandCount, unless: /playground/i },
  { noun: 'contracts', of: () => listCount('packages/core/src/conform.ts', 'export const CONTRACT_NAMES', 10) },
  { noun: 'providers', of: providerCount },
  { noun: 'rules', of: doctrineRuleCount, only: /doctrine/i },
  { noun: 'rules', of: optimisationRuleCount, unless: /doctrine/i },
];

/** Number words that have stood in for a figure in this repository's prose. */
const SPELLED = [
  'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen',
  'nineteen', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy',
  'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven',
];

/**
 * The pages that describe the product as it is now.
 *
 * `CHANGELOG.md`, `RELEASES.md`, `ROADMAP.md`'s record and `docs/plan-*.md` are
 * dated: they say what was true at a release, and "Pricing seven providers
 * (1.5.0) made the next gap obvious" is a correct sentence about 1.5.0 no
 * matter how many providers there are now. Correcting those would be rewriting
 * history, so they are out — by name, so a new page is in by default rather
 * than out by oversight.
 */
const DATED = new Set(['CHANGELOG.md', 'RELEASES.md', 'ROADMAP.md']);

/**
 * A line that names the release it is about is a record of that release.
 *
 * The arc table in `docs/README.md` reads `1.71.0 — all four chapters,
 * from-otel the fortieth command`: true of 1.71.0, false of today, and
 * correcting it would be rewriting the history it exists to keep. Whole files
 * of this are excluded above by name; this catches the same thing living in a
 * table row inside a page that is otherwise present tense.
 */
const RECORD = /\b\d+\.\d+\.\d+\b/;

function pages() {
  const found = [];
  const walk = (absolute) => {
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      const name = entry.name;
      if (name === 'node_modules' || name === 'dist' || name === '.next' || name.startsWith('.')) {
        continue;
      }
      const child = join(absolute, name);
      if (entry.isDirectory()) {
        walk(child);
        continue;
      }
      if (!name.endsWith('.md')) continue;
      const path = relative(ROOT, child);
      if (DATED.has(path) || path.startsWith('docs/plan-')) continue;
      found.push({ path, text: prose(readFileSync(child, 'utf8')) });
    }
  };
  walk(ROOT);
  return found;
}

describe('every count this repository states about itself', () => {
  const surfaces = () => [
    ...pages(),
    /* The landing states the same counts, five times over, in a tsx. */
    { path: 'apps/web/app/landing/page.tsx', text: copyOf('apps/web/app/landing/page.tsx') },
  ];

  it('reads the pages it claims to read', () => {
    const found = surfaces();
    assert.ok(found.length >= 30, `only ${found.length} pages walked`);
    for (const expected of ['README.md', 'plugin/README.md', 'docs/licensing.md']) {
      assert.ok(found.some((page) => page.path === expected), `${expected} is not in the walk`);
    }
    for (const excluded of [...DATED]) {
      assert.ok(!found.some((page) => page.path === excluded), `${excluded} should be excluded`);
    }
  });

  it('matches the README architecture diagram, which is a claim in a fence', () => {
    const line = read('README.md')
      .split('\n')
      .find((candidate) => /^\s*\d+ commands\s{2,}/.test(candidate));
    assert.ok(line !== undefined, 'the README diagram no longer labels the CLI with a count');
    assert.equal(
      Number(line.trim().split(' ')[0]),
      commandCount(),
      `the README diagram says ${line.trim()}; COMMAND_FLAGS dispatches ${commandCount()}`,
    );
  });

  it('matches what the product actually has', () => {
    let checked = 0;
    for (const { noun, of, only, unless } of COUNTED) {
      const expected = of();
      for (const { path, text } of surfaces()) {
        for (const block of paragraphs(text)) {
          if (only !== undefined && !only.test(block)) continue;
          if (unless !== undefined && unless.test(block)) continue;
          for (const line of block.split('\n')) {
            if (RECORD.test(line)) continue;
            for (const match of line.matchAll(new RegExp(`(\\d+)\\s+${noun}\\b`, 'g'))) {
              checked += 1;
              assert.equal(
                Number(match[1]),
                expected,
                `${path} says ${match[1]} ${noun}; the product has ${expected}\n  ${line.trim()}`,
              );
            }
          }
        }
      }
    }
    assert.ok(checked >= 10, `only ${checked} counts found to check`);
  });

  it('is written in digits, never spelled', () => {
    for (const { noun } of COUNTED) {
      for (const { path, text } of surfaces()) {
        for (const line of text.split(/\n(?=[^\n])/)) {
          if (RECORD.test(line)) continue;
          /* Rejoined, because prose wraps and a count can straddle the break. */
          const flat = line.replace(/\s+/g, ' ');
          for (const at of positionsOf(flat, ` ${noun.toLowerCase()}`)) {
            const before = flat.slice(Math.max(0, at - 24), at).toLowerCase().trim();
            for (const word of SPELLED) {
              assert.ok(
                !new RegExp(`\\b${word}(-\\w+)?$`).test(before),
                `${path} spells a count as a word before "${noun}":\n  `
                  + `${sentence(flat, at)}\n`
                  + '  Write the digits, so the figure can be checked against the product.',
              );
            }
          }
        }
      }
    }
  });
});

/**
 * A page with its fenced blocks removed.
 *
 * A fence in this repository is a sample: a terminal transcript, a JSON
 * document, an architecture diagram. The numbers in one describe that sample
 * and not the product — `Dutch: 30 entries across 6 rules` is a correct line
 * of `trazum i18n` output and says nothing about how many rules exist — so
 * reading them as claims would fail on true sentences. What a fence *can*
 * carry is a label, and the README's architecture diagram carries one; that is
 * checked by name below, because it is a claim wearing a diagram's clothes and
 * it is where "42 commands" survived.
 */
function prose(text) {
  return text.replace(/^[ \t]*```[\s\S]*?^[ \t]*```/gm, '');
}

/**
 * The copy out of a `.tsx`: its quoted strings, and nothing else.
 *
 * The same distinction the fences make in a page. A comment explaining that a
 * figure is drawn from "six rules of falling length" is describing strokes in
 * an SVG, and a guard reading it as a claim about the optimiser fails on a
 * sentence that is both true and about something else. What a reader reads is
 * the copy; short strings are class names and keys, so they go too.
 */
function copyOf(path) {
  /* Comments go first: an apostrophe in one opens a string that never closes. */
  const code = read(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
  return [...code.matchAll(/'((?:[^'\\]|\\.)*)'/g)]
    .map((match) => match[1])
    .filter((line) => line.length > 24)
    .join('\n\n');
}

/** Blank-line separated blocks: the unit a reader reads a claim in. */
function paragraphs(text) {
  return text.split(/\n\s*\n/);
}

/** Every index at which `needle` occurs in `haystack`, case-insensitively. */
function positionsOf(haystack, needle) {
  const found = [];
  const lower = haystack.toLowerCase();
  for (let at = lower.indexOf(needle); at !== -1; at = lower.indexOf(needle, at + 1)) {
    found.push(at);
  }
  return found;
}

/** Enough of the text around an offset to recognise the sentence at fault. */
function sentence(text, at) {
  return text.slice(Math.max(0, at - 80), at + 40).replace(/\s+/g, ' ').trim();
}
