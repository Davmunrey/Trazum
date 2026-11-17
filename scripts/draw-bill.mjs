#!/usr/bin/env node
/**
 * Draws `docs/assets/bill.svg`: the statement `trazum bill` prints on a
 * terminal, as the picture at the top of the README.
 *
 * A transcript, not a mock-up, and this script is why it stays one. It runs
 * the built CLI on `examples/claude-projects`, two illustrative Claude Code
 * projects whose transcripts are in this repository (no real prompt or answer
 * in them, only the usage a session records), and draws exactly the lines it
 * prints, in the colours it prints them. A figure in the picture is a figure
 * the CLI computed; when a price or the statement's wording changes, the
 * picture is redrawn, never edited.
 *
 *   node scripts/draw-bill.mjs          writes docs/assets/bill.svg
 *   node scripts/draw-bill.mjs --check  exits 1 if the file is not what this writes
 *
 * `--table` is passed because this runs in a pipe, where `bill` prints the JSON
 * receipt; a person at a terminal gets the statement without asking. The
 * window, the theme and the reasons for both are in `terminal-picture.mjs`.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { capture, drawTerminal, plain, styledLines } from './terminal-picture.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs/assets/bill.svg');

const COMMAND = ['bill', 'examples/claude-projects', '--table', '--locale', 'en'];
/** What the picture says was typed: the command, without the flag a pipe needs. */
const SHOWN = 'trazum bill examples/claude-projects';

/** The statement as the CLI writes it to a terminal, escape codes included. */
export const statement = () => capture(COMMAND);

/** The same statement as plain lines, for anything that reads what it says. */
export function statementLines(ansi = statement()) {
  return styledLines(ansi).map((runs) => plain(runs.map((part) => part.text).join('')));
}

export function draw(ansi) {
  const lines = statementLines(ansi);
  return drawTerminal({
    command: SHOWN,
    lines: styledLines(ansi),
    label: `trazum bill on two illustrative Claude Code projects: ${lines[1]?.trim() ?? ''}, by project and by model, with the calls it could not price named rather than counted as zero`,
    comment: [
      `Drawn by scripts/draw-bill.mjs from what \`${SHOWN}\` prints, in English,`,
      'forced into its terminal statement because a script runs it in a pipe.',
      'Do not edit: redraw. The suite fails when this stops being that output.',
      '(An XML comment cannot hold two hyphens in a row, which is why no flag',
      'is spelled out here.)',
    ].join('\n'),
  });
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const svg = draw(statement());
  if (process.argv.includes('--check')) {
    let current = '';
    try {
      current = readFileSync(OUT, 'utf8');
    } catch {
      // Missing is the same failure as different.
    }
    if (current !== svg) {
      console.error('docs/assets/bill.svg is not what this script draws from the CLI today.\n\nRun: node scripts/draw-bill.mjs');
      process.exit(1);
    }
  } else {
    writeFileSync(OUT, svg);
    console.log(`wrote docs/assets/bill.svg (${statementLines().length} lines)`);
  }
}
