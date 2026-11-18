#!/usr/bin/env node
/**
 * Writes `apps/web/lib/landing-terminal.ts`: every character the landing's
 * laptop shows on its screen, as the built CLI printed it.
 *
 * The landing tells the product as a visitor scrolls, on a terminal inside a
 * drawn laptop. A terminal on a product page is the easiest place to type a
 * figure nobody computed, so nothing on that screen is typed by hand: this
 * script runs the commands the screen shows, on files that are in this
 * repository, and writes down what came out, line by line and in the colours
 * the CLI chose, the way `draw-bill.mjs` and `draw-demo.mjs` draw the README's
 * two terminal pictures.
 *
 * The transcript, in the order the page plays it:
 *
 *   1. `bill examples/claude-projects`: the illustrative bill the README
 *      shows, two Claude Code projects with no real prompt or answer in them.
 *   2. `check examples/`: the CI gate on this repository's own example
 *      prompts, against the budgets in its `trazum.config.json` and the
 *      baseline it commits, then `echo $?` and the exit status the process
 *      really returned.
 *   3. `optimize examples/support-prompt.txt`: the trimming report on the
 *      README's wordy support prompt, whole, with the token counts before and
 *      after.
 *
 * The MCP server's `spend_guard` answer is not on the screen: the repository
 * has no example call of it to run, and an answer written for the page would
 * be the invented output this script exists to prevent.
 *
 * What the screen says was typed is the command a person at a terminal would
 * type, through `npx`, without the flags a pipe needs (`--table` for the bill,
 * `-o` for optimize, whose last line naming the scratch file is dropped, as
 * `draw-demo.mjs` drops it). Blank lines at either end of an output are left
 * out, as both pictures leave them out; every other line is the CLI's.
 *
 *   node scripts/draw-landing-terminal.mjs          writes the file
 *   node scripts/draw-landing-terminal.mjs --check  exits 1 if it is not what this writes
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { capture, plain, styledLines } from './terminal-picture.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'apps/web/lib/landing-terminal.ts');
const CLI = join(ROOT, 'packages/cli/dist/index.js');

/** How the screen names the CLI: the hero's own command, `npx @trazum/cli`. */
const NPX = 'npx @trazum/cli';

/**
 * A run's style as the page's class letters: bold, dim, the four colours, and
 * the mark (the acid ground in ink, whose ink is the mark's and not a colour).
 */
function styleOf({ bold, dim, colour, mark }) {
  const colours = { 32: 'g', 33: 'y', 31: 'r', 36: 'a' };
  const hue = colour === null || (mark && colour === 30) ? '' : colours[colour];
  if (hue === undefined) throw new Error(`The CLI printed colour code ${colour}, which the landing gives no class`);
  return `${bold ? 'b' : ''}${dim ? 'd' : ''}${hue}${mark ? 'm' : ''}`;
}

const toLines = (ansi) => styledLines(ansi).map((runs) => runs.map((run) => [run.text, styleOf(run)]));

/** The exit status `check` returns, which `echo $?` prints. */
function exitStatus(args) {
  const env = { ...process.env, TRAZUM_LOCALE: 'en' };
  for (const name of ['CLAUDECODE', 'CODEX_SANDBOX', 'CODEX_HOME', 'CURSOR_TRACE_ID', 'GITHUB_ACTIONS', 'CI', 'TERM_PROGRAM']) env[name] = '';
  const result = spawnSync(process.execPath, [CLI, ...args], { cwd: ROOT, env, stdio: 'ignore' });
  return result.status;
}

/** The optimize report without the line naming the file `-o` wrote. */
function optimizeReport(prompt) {
  const scratch = mkdtempSync(join(tmpdir(), 'trazum-landing-'));
  try {
    const ansi = capture(['optimize', prompt, '-o', join(scratch, 'shorter.txt'), '--locale', 'en']);
    const lines = ansi.split('\n');
    const written = lines.findLastIndex((line) => plain(line).includes(scratch));
    if (written === -1) throw new Error('optimize no longer says where it wrote the prompt');
    return lines.slice(0, written).join('\n');
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/** The transcript: one block per command, each with the lines it printed. */
export function transcript() {
  const check = ['check', 'examples/', '--locale', 'en'];
  return [
    {
      id: 'bill',
      command: `${NPX} bill examples/claude-projects`,
      lines: toLines(capture(['bill', 'examples/claude-projects', '--table', '--locale', 'en'])),
    },
    { id: 'check', command: `${NPX} check examples/`, lines: toLines(capture(check)) },
    { id: 'status', command: 'echo $?', lines: [[[String(exitStatus(check)), '']]] },
    {
      id: 'optimize',
      command: `${NPX} optimize examples/support-prompt.txt`,
      lines: toLines(optimizeReport('examples/support-prompt.txt')),
    },
  ];
}

export function render(blocks = transcript()) {
  const width = Math.max(...blocks.flatMap((block) => [block.command.length + 2, ...block.lines.map((runs) => runs.reduce((n, [text]) => n + text.length, 0))]));
  return `/**
 * Written by scripts/draw-landing-terminal.mjs from what the built CLI prints.
 * Do not edit: run \`node scripts/draw-landing-terminal.mjs\`. The web suite
 * fails when this stops being that output.
 *
 * Each line is a list of runs, \`[text, style]\`, where the style letters are
 * the CLI's own: b bold, d dim, g green, y yellow, r red, a cyan (drawn in the
 * acid fill, as the README's pictures draw it), m the mark (ink on the acid
 * ground: the one figure the report answers with).
 */

export type TerminalRun = readonly [text: string, style: string];
export interface TerminalBlock {
  readonly id: 'bill' | 'check' | 'status' | 'optimize';
  readonly command: string;
  readonly lines: readonly (readonly TerminalRun[])[];
}

/** The widest line on the screen, in characters, prompt included. */
export const TERMINAL_COLUMNS = ${width};

export const TERMINAL: readonly TerminalBlock[] = [
${blocks
  .map(
    (block) => `  {
    id: ${JSON.stringify(block.id)},
    command: ${JSON.stringify(block.command)},
    lines: [
${block.lines.map((runs) => `      ${JSON.stringify(runs)},`).join('\n')}
    ],
  },`,
  )
  .join('\n')}
];
`;
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const text = render();
  if (process.argv.includes('--check')) {
    let current = '';
    try {
      current = readFileSync(OUT, 'utf8');
    } catch {
      // Missing is the same failure as different.
    }
    if (current !== text) {
      console.error('apps/web/lib/landing-terminal.ts is not what the CLI prints today.\n\nRun: node scripts/draw-landing-terminal.mjs');
      process.exit(1);
    }
  } else {
    writeFileSync(OUT, text);
    console.log('wrote apps/web/lib/landing-terminal.ts');
  }
}
