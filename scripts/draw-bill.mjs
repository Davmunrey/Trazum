#!/usr/bin/env node
/**
 * Draws `docs/assets/bill.svg`: the statement `trazum bill` prints on a
 * terminal, as the picture at the top of the README.
 *
 * A transcript, not a mock-up, and this script is why it stays one. It runs
 * the built CLI on `examples/claude-projects`, two illustrative Claude Code
 * projects whose transcripts are in this repository (no real prompt or answer
 * in them, only the usage a session records), and draws exactly the lines it
 * prints. A figure in the picture is a figure the CLI computed; when a price
 * or the statement's wording changes, the picture is redrawn, never edited.
 *
 *   node scripts/draw-bill.mjs          writes docs/assets/bill.svg
 *   node scripts/draw-bill.mjs --check  exits 1 if the file is not what this writes
 *
 * `--table` is passed because this runs in a pipe, where `bill` prints the JSON
 * receipt; a person at a terminal gets the statement without asking. The
 * palette is `docs/assets/demo.svg`'s, value for value.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs/assets/bill.svg');
const COMMAND = ['bill', 'examples/claude-projects', '--table', '--locale', 'en'];
/** What the picture says was typed: the command, without the flag a pipe needs. */
const SHOWN = 'trazum bill examples/claude-projects';

const PALETTE = {
  window: '#171512',
  bar: '#1e1c18',
  rule: '#363329',
  ink: '#efece4',
  dim: '#a8a495',
  good: '#6fc99a',
  warn: '#d6ad63',
  brand: '#b0522f',
};

/** The statement, as the CLI prints it, colour codes removed. */
export function statementLines() {
  const out = execFileSync(process.execPath, [join(ROOT, 'packages/cli/dist/index.js'), ...COMMAND], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', TRAZUM_LOCALE: 'en' },
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const lines = out.replace(/\x1b\[[0-9;]*m/g, '').split('\n').map((line) => line.replace(/\s+$/, ''));
  while (lines.length > 0 && lines[0] === '') lines.shift();
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

const esc = (text) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
/**
 * A printed run, spaces kept. The columns are spaces, and an SVG shown through
 * an <img>, the way GitHub shows a README picture, collapses runs of them
 * whatever `xml:space` says. A no-break space is as wide as a space in a
 * monospace face and is never collapsed.
 */
const run = (text) => esc(text).replaceAll(' ', '&#160;');

/** One printed line as SVG text, coloured by what it is, never changed. */
function styled(line, index, lines) {
  if (index === 0) {
    const ruled = line.match(/^(.*?)( ─+)$/);
    if (ruled) {
      return `<tspan fill="${PALETTE.ink}" font-weight="bold">${run(ruled[1])}</tspan><tspan fill="${PALETTE.rule}">${run(ruled[2])}</tspan>`;
    }
    return `<tspan fill="${PALETTE.ink}" font-weight="bold">${run(line)}</tspan>`;
  }
  if (index === 1) return `<tspan fill="${PALETTE.ink}" font-weight="bold">${run(line)}</tspan>`;
  const header = /^\s+(project|workload|model)\s+calls\s+USD\s+share$/.test(line);
  if (header) return `<tspan fill="${PALETTE.dim}">${run(line)}</tspan>`;
  const bar = line.match(/^([^█░]*)(█*)(░*)(.*)$/);
  if (bar && (bar[2] || bar[3])) {
    // A hairline stroke in the fill colour closes the seams some faces leave
    // between full blocks, so the share reads as one bar.
    const filled = bar[2] ? `<tspan fill="${PALETTE.good}" stroke="${PALETTE.good}" stroke-width="0.6">${run(bar[2])}</tspan>` : '';
    const empty = bar[3] ? `<tspan fill="${PALETTE.dim}" fill-opacity="0.45">${run(bar[3])}</tspan>` : '';
    return `<tspan fill="${PALETTE.ink}">${run(bar[1])}</tspan>${filled}${empty}<tspan fill="${PALETTE.ink}">${run(bar[4])}</tspan>`;
  }
  const gap = lines.findIndex((l) => l.trimStart().startsWith('Not in the total'));
  const next = lines.findIndex((l) => l.trimStart().startsWith('The receipt as data'));
  if (gap !== -1 && index >= gap && (next === -1 || index < next)) {
    return `<tspan fill="${PALETTE.warn}">${run(line)}</tspan>`;
  }
  return `<tspan fill="${PALETTE.dim}">${run(line)}</tspan>`;
}

export function draw(lines) {
  const top = 74;
  const step = 21;
  const height = top + 30 + lines.length * step + 10;
  // As wide as the longest line, at 0.62em a character: the common monospace
  // faces are 0.6em or narrower, so nothing reaches the edge.
  const longest = Math.max(SHOWN.length + 2, ...lines.map((line) => line.length));
  const width = Math.ceil((68 + longest * 13 * 0.62) / 10) * 10;
  const body = lines
    .map((line, i) => (line === '' ? '' : `    <text x="34" y="${top + 32 + i * step}">${styled(line, i, lines)}</text>`))
    .filter(Boolean)
    .join('\n');
  const label = `trazum bill on two illustrative Claude Code projects: ${lines[1]?.trim() ?? ''}, by project and by model, with the calls it could not price named rather than counted as zero`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(label)}">
  <!--
    Drawn by scripts/draw-bill.mjs from what \`${SHOWN}\` prints, in English,
    forced into its terminal statement because a script runs it in a pipe.
    Do not edit: redraw. The suite runs the script's check mode and fails when
    this stops being that output. (An XML comment cannot hold two hyphens in a
    row, which is why no flag is spelled out here.)
  -->
  <defs><clipPath id="window"><rect x="10" y="8" width="${width - 20}" height="${height - 16}" rx="12"/></clipPath></defs>
  <rect x="10" y="8" width="${width - 20}" height="${height - 16}" rx="12" fill="${PALETTE.window}" stroke="${PALETTE.rule}" stroke-width="1"/>
  <g clip-path="url(#window)">
    <rect x="10" y="8" width="${width - 20}" height="38" fill="${PALETTE.bar}"/>
    <line x1="10" y1="46" x2="${width - 10}" y2="46" stroke="${PALETTE.rule}" stroke-width="1"/>
  </g>
  <g transform="translate(26 15)">
    <rect width="24" height="24" rx="5.5" fill="${PALETTE.brand}"/>
    <g stroke-width="2" stroke-linecap="round">
      <path d="M5.5 7h13.5" stroke="#fff"/>
      <path d="M5.5 12h9.5" stroke="#fff" opacity=".45"/>
      <path d="M5.5 12h6" stroke="#fff"/>
      <path d="M5.5 17h6" stroke="#fff" opacity=".45"/>
      <path d="M5.5 17h3.5" stroke="#fff"/>
    </g>
  </g>
  <text x="${width / 2}" y="31" text-anchor="middle" font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace" font-size="12" fill="${PALETTE.dim}">trazum</text>
  <g font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace" font-size="13">
    <text x="34" y="${top}" fill="${PALETTE.dim}">$&#160;<tspan fill="${PALETTE.ink}">${run(SHOWN)}</tspan></text>
${body}
  </g>
</svg>
`;
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const svg = draw(statementLines());
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
