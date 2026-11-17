#!/usr/bin/env node
/**
 * Draws `docs/assets/demo.svg`: what `trazum optimize` prints for a wordy
 * support prompt, as the picture in the README's "what it finds" section.
 *
 * **Why this is a script now.** The picture used to be typed by hand, under a
 * comment saying it was a transcript and that a changed report should be
 * re-run and re-transcribed. The report changed and nobody did: on 2026-11-17
 * the CLI printed its "Start here" line first where the picture had it last,
 * suggested Claude Haiku 5.5 where the picture named Haiku 4.5, and assumed
 * 300 output tokens where the picture said 500. The prompt it claimed to have
 * run on was not in the repository, so nobody could have re-run it. Its
 * arithmetic was still held to the price table by `demo-image.test.js`, which
 * is how a picture can be correct to the cent and still not be what the tool
 * prints.
 *
 * So the prompt is `examples/support-prompt.txt`, anybody can run the command
 * in the window, and this draws what comes out.
 *
 * **It shows the head of the report and says so.** The whole report runs past
 * fifty lines, most of them the reasoning under each lever. The picture stops
 * after the first lever, the one the report itself tells the reader to start
 * with, and the bar at the bottom states how many lines it shows of how many.
 * A cut that is not announced would be a different report.
 *
 *   node scripts/draw-demo.mjs          writes docs/assets/demo.svg
 *   node scripts/draw-demo.mjs --check  exits 1 if the file is not what this writes
 *
 * `-o` is passed because this runs in a pipe, where `optimize` writes the
 * shortened prompt and nothing else; a person at a terminal gets the report
 * without asking. The file it names is thrown away.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { capture, drawTerminal, plain, styledLines } from './terminal-picture.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs/assets/demo.svg');

export const PROMPT = 'examples/support-prompt.txt';
const ARGS = ['optimize', PROMPT, '--calls', '50000', '--cost', '--locale', 'en'];
/** What the picture says was typed: the command, without what a pipe needs. */
export const SHOWN = `trazum optimize ${PROMPT} --calls 50000 --cost`;

/** The report as the CLI writes it to a terminal, escape codes included. */
export function report() {
  const scratch = mkdtempSync(join(tmpdir(), 'trazum-demo-'));
  try {
    const ansi = capture([...ARGS, '-o', join(scratch, 'shorter.txt')]);
    // The last line names the scratch file, which a terminal run never prints.
    const lines = ansi.split('\n');
    const written = lines.findLastIndex((line) => plain(line).includes(scratch));
    if (written === -1) throw new Error('optimize no longer says where it wrote the prompt');
    return lines.slice(0, written).join('\n');
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/** A lever's first line: a marker, an amount or the space for one, a title. */
const LEVER = /^ {2}[→·!] /;

/**
 * Where the picture stops: before the second lever under "Beyond shortening
 * the prompt". Everything above that line is shown whole.
 */
export function head(lines) {
  const texts = lines.map((runs) => plain(runs.map((part) => part.text).join('')));
  const levers = texts.flatMap((text, index) => (LEVER.test(text) ? [index] : []));
  if (levers.length < 2) return lines;
  return lines.slice(0, levers[1]);
}

/** The whole report as plain lines, for anything that reads what it says. */
export function reportLines(ansi = report()) {
  return styledLines(ansi).map((runs) => plain(runs.map((part) => part.text).join('')));
}

export function draw(ansi) {
  const all = styledLines(ansi);
  const shown = head(all);
  const texts = reportLines(ansi);
  const tokens = texts.join(' ').match(/(\d+) → (\d+)/);
  const saving = texts.join(' ').match(/saving (\$[\d,.]+)\/month/);
  return drawTerminal({
    command: SHOWN,
    lines: shown,
    label: `trazum optimize on a wordy support prompt: ${tokens?.[1] ?? '?'} tokens down to ${tokens?.[2] ?? '?'}, ${saving?.[1] ?? '?'} a month saved by the rules, and the lever the report says to start with`,
    comment: [
      'Drawn by scripts/draw-demo.mjs from what the command in the window',
      `prints for ${PROMPT}, in English. Do not edit: redraw.`,
      'The suite fails when this stops being that output. The picture stops',
      'after the first lever and its last bar says how much of the report that',
      'is. (An XML comment cannot hold two hyphens in a row, which is why the',
      'command is not spelled out here.)',
    ].join('\n'),
    note: all.length > shown.length
      ? `The first ${shown.length} of the ${all.length} lines this prints. The other levers follow.`
      : null,
  });
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const svg = draw(report());
  if (process.argv.includes('--check')) {
    let current = '';
    try {
      current = readFileSync(OUT, 'utf8');
    } catch {
      // Missing is the same failure as different.
    }
    if (current !== svg) {
      console.error('docs/assets/demo.svg is not what this script draws from the CLI today.\n\nRun: node scripts/draw-demo.mjs');
      process.exit(1);
    }
  } else {
    writeFileSync(OUT, svg);
    console.log(`wrote docs/assets/demo.svg (${head(styledLines(report())).length} of ${reportLines().length} lines)`);
  }
}
