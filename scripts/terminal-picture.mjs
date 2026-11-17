/**
 * Draws what the CLI printed as a picture of a terminal.
 *
 * Two pictures in the README are terminal transcripts, `bill.svg` and
 * `demo.svg`, and both are drawn here from the bytes the built CLI wrote, so
 * that neither can show a line the CLI would not print.
 *
 * **The colours are the CLI's own.** It is run with colour forced on, and the
 * escape codes it emits decide what is bold, dim, green, yellow or cyan.
 * Before this, one picture guessed the colours from the shape of each line and
 * the other was typed by hand, and both had drifted from what a terminal
 * shows: the share bars were drawn green where the CLI prints them cyan, and a
 * caveat the CLI prints in yellow was drawn dim. What this file adds is only a
 * theme, the way a terminal has one: which value each of those five names is,
 * taken from `scripts/brand.mjs`.
 *
 * **Spaces are written as no-break spaces.** An SVG shown through `<img>`, the
 * way GitHub shows a README picture, collapses runs of spaces whatever
 * `xml:space` says, and a terminal's columns are made of them. A no-break space
 * is as wide as a space in a monospace face and is never collapsed.
 *
 * **The window is as wide as its longest line** at 0.62em a character. The
 * common monospace faces are 0.6em or narrower, so nothing reaches the edge on
 * a machine whose face is a little wider than the one it was drawn on.
 */

import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ACID, DARK, DISPLAY, MONO, markSvg } from './brand.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(ROOT, 'packages/cli/dist/index.js');

/** The theme: what each colour the CLI can ask for is, in this product. */
export const THEME = {
  32: DARK.good,
  33: DARK.warn,
  31: DARK.bad,
  // Cyan is what the CLI uses to point: the share bars and the arrow beside an
  // opportunity. In this product the colour that points is the acid fill.
  36: ACID,
};

/** What the CLI reads to guess where it is running; blanked, as the test suite blanks them. */
const HOST_ENV = ['CLAUDECODE', 'CODEX_SANDBOX', 'CODEX_HOME', 'CURSOR_TRACE_ID', 'GITHUB_ACTIONS', 'CI', 'TERM_PROGRAM'];

/** What the built CLI writes to a terminal for `args`, escape codes included. */
export function capture(args) {
  // The picture is the same wherever it is drawn: colour on, English, and no
  // agent harness or CI runner read out of the environment of whoever ran this.
  const env = { ...process.env, FORCE_COLOR: '1', TRAZUM_LOCALE: 'en' };
  delete env.NO_COLOR;
  for (const name of HOST_ENV) env[name] = '';
  return execFileSync(process.execPath, [CLI, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    env,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

/** The same text with the escape codes removed, for anything that reads it. */
export const plain = (ansi) => ansi.replace(/\x1b\[[0-9;]*m/g, '');

/**
 * The output as lines of styled runs.
 *
 * Style carries across line ends, because the CLI opens `dim` before a
 * paragraph and closes it after the last line. A code this does not know is an
 * error rather than a run drawn in the default colour: a new colour in the CLI
 * should fail here and be given a value, not disappear from the picture.
 */
export function styledLines(ansi) {
  const lines = [[]];
  let style = { bold: false, dim: false, colour: null };
  const pattern = /\x1b\[([0-9;]*)m|\n|[^\x1b\n]+/g;
  for (const match of ansi.matchAll(pattern)) {
    const [token, codes] = match;
    if (token === '\n') {
      lines.push([]);
    } else if (codes !== undefined) {
      for (const code of codes.split(';').map(Number)) {
        if (code === 1) style = { ...style, bold: true };
        else if (code === 2) style = { ...style, dim: true };
        else if (code === 22) style = { ...style, bold: false, dim: false };
        else if (code === 39) style = { ...style, colour: null };
        else if (code === 0) style = { bold: false, dim: false, colour: null };
        else if (THEME[code] !== undefined) style = { ...style, colour: code };
        else throw new Error(`The CLI printed colour code ${code}, which this theme gives no value`);
      }
    } else {
      lines.at(-1).push({ text: token, ...style });
    }
  }
  // Trailing spaces and blank lines at either end are not part of the picture.
  const trimmed = lines.map((runs) => {
    const copy = runs.map((run) => ({ ...run }));
    while (copy.length > 0) {
      const last = copy.at(-1);
      last.text = last.text.replace(/\s+$/, '');
      if (last.text !== '') break;
      copy.pop();
    }
    return copy;
  });
  while (trimmed.length > 0 && trimmed[0].length === 0) trimmed.shift();
  while (trimmed.length > 0 && trimmed.at(-1).length === 0) trimmed.pop();
  return trimmed;
}

const esc = (text) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const run = (text) => esc(text).replaceAll(' ', '&#160;');

/** One run as a `<tspan>`: the theme's colour, and two glyphs treated as what they are. */
function span({ text, bold, dim, colour }) {
  const fill = colour !== null ? THEME[colour] : dim ? DARK.secondary : DARK.text;
  const weight = bold ? ' font-weight="bold"' : '';
  // Rules and the empty cells of a bar are structure, not prose: drawn in the
  // rule colour so they recede the way they do beside the app's own tables.
  // A hairline stroke closes the seams some faces leave between full blocks.
  return text
    .split(/([─░]+|█+)/)
    .filter((part) => part !== '')
    .map((part) => {
      if (/^[─░]/.test(part) && dim) return `<tspan fill="${DARK.rule}">${run(part)}</tspan>`;
      if (part[0] === '█') return `<tspan fill="${fill}" stroke="${fill}" stroke-width="0.6">${run(part)}</tspan>`;
      return `<tspan fill="${fill}"${weight}>${run(part)}</tspan>`;
    })
    .join('');
}

const length = (runs) => runs.reduce((sum, part) => sum + part.text.length, 0);

/**
 * The picture.
 *
 * `command` is what the window says was typed. `lines` are styled lines from
 * `styledLines`. `note`, when given, is a line of the picture's own under the
 * transcript, set apart in the bar a terminal keeps for its status: it is how
 * a picture that shows the head of a longer report says so.
 */
export function drawTerminal({ command, lines, label, comment, note = null }) {
  // Two hyphens in a row end an XML comment's grammar, and a browser then
  // refuses the whole picture: it draws as a broken image, with no error here.
  if (comment.includes('--')) throw new Error('An XML comment cannot hold two hyphens in a row');
  const size = 13;
  const step = 21;
  const bar = 40;
  const pad = 22;
  const first = bar + 2 + 30;
  const body = first + 32;
  const foot = note === null ? 0 : 34;

  const noteSize = 11.5;
  const longest = Math.max(command.length + 2, ...lines.map(length));
  const width = Math.ceil(
    (pad * 2 + 4 + Math.max(longest * size, (note?.length ?? 0) * noteSize) * 0.62) / 10,
  ) * 10;
  const height = body + (lines.length - 1) * step + 24 + foot;

  const rows = lines
    .map((runs, index) => (runs.length === 0 ? '' : `    <text x="${pad}" y="${body + index * step}">${runs.map(span).join('')}</text>`))
    .filter(Boolean)
    .join('\n');
  const footer = note === null
    ? ''
    : `  <rect x="2" y="${height - foot - 2}" width="${width - 4}" height="${foot}" fill="${DARK.raised}"/>
  <line x1="2" y1="${height - foot - 2}" x2="${width - 2}" y2="${height - foot - 2}" stroke="${DARK.rule}" stroke-width="1"/>
  <text x="${pad}" y="${height - 14}" font-family="${MONO}" font-size="${noteSize}" fill="${DARK.secondary}">${run(note)}</text>
`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(label)}">
  <!--
${comment.split('\n').map((line) => `    ${line}`).join('\n')}
  -->
  <rect x="1" y="1" width="${width - 2}" height="${height - 2}" fill="${DARK.canvas}" stroke="${DARK.rule}" stroke-width="2"/>
  <rect x="2" y="2" width="${width - 4}" height="${bar}" fill="${DARK.raised}"/>
  <line x1="2" y1="${bar + 2}" x2="${width - 2}" y2="${bar + 2}" stroke="${DARK.rule}" stroke-width="1"/>
  ${markSvg(14, 11, 22)}
  <text x="46" y="28" font-family="${DISPLAY}" font-size="17" font-weight="700" letter-spacing="-0.4" fill="${DARK.text}">Trazum</text>
  <g font-family="${MONO}" font-size="${size}">
    <text x="${pad}" y="${first}"><tspan fill="${ACID}" font-weight="bold">$</tspan><tspan fill="${DARK.text}">&#160;${run(command)}</tspan></text>
${rows}
  </g>
${footer}</svg>
`;
}
