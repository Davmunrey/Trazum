#!/usr/bin/env node
/**
 * Draw the boundary this product's whole argument rests on.
 *
 * ## Why this is a script and not a drawing
 *
 * The picture makes claims — which packages exist, what crosses the line —
 * and this repository does not ship a claim nothing checks.
 * `architecture-image.test.js` reads the committed SVG and fails the build if a
 * publishable workspace exists that the picture does not name, derived from the
 * same `workspaces` globs `security.test.js` reads. Add a package and the
 * drawing is wrong until somebody re-runs this.
 *
 * ## Why it is hand-written SVG rather than a diagram library
 *
 * `mingrammer/diagrams` was tried first and three things ruled it out, written
 * here so nobody spends the afternoon again. Its nodes are **fixed-colour
 * images with the label outside the shape**, so they cannot carry this
 * product's palette and they break under text longer than a word or two — the
 * first render came out 1273×2650 with labels overflowing their clusters. It
 * ships **no icon for OpenAI, Anthropic, OpenTelemetry, LiteLLM, Helicone or
 * LangSmith**, which are exactly the products this tool integrates with, so the
 * one diagram that would play to its strengths cannot be drawn with it either.
 * And it is built to show what connects to what, while the claim worth drawing
 * here is **what does not cross a line** — an absence, which a graph of edges
 * is the wrong shape for.
 *
 * Node rather than Python, because Graphviz and a Python toolchain would be a
 * new prerequisite for contributing to a repository whose argument is that it
 * has no dependencies. This runs on the Node that is already required:
 *
 *     npm run draw:architecture
 */

import { readFileSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The palette, value for value from `docs/assets/demo.svg`.
 *
 * Dark, and that is a decision rather than a default: the demo image directly
 * above this one in the README is a terminal transcript on `#171512`, and two
 * images of different temperature stacked on a front page read as two projects.
 */
const C = {
  bg: '#171512',
  panel: '#1e1c18',
  rule: '#302c26',
  ink: '#efece4',
  soft: '#a8a495',
  accent: '#b0522f',
  keep: '#6fc99a',
  warn: '#d6ad63',
};

const MONO = 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace';

/** Publishable workspaces, derived rather than typed, so the picture cannot lag. */
function publishable() {
  const root = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  return root.workspaces
    .flatMap((pattern) => {
      const parent = pattern.replace(/\/\*$/, '');
      return readdirSync(join(ROOT, parent), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => `${parent}/${entry.name}`);
    })
    .map((path) => ({ path, manifest: JSON.parse(readFileSync(join(ROOT, path, 'package.json'), 'utf8')) }))
    .filter(({ manifest }) => manifest.private !== true)
    .map(({ manifest }) => manifest.name)
    .sort();
}

const esc = (value) =>
  String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const text = (x, y, value, { size = 12, fill = C.ink, weight = 400, anchor = 'start' } = {}) =>
  `<text x="${x}" y="${y}" font-family="${MONO}" font-size="${size}" fill="${fill}" `
  + `font-weight="${weight}" text-anchor="${anchor}">${esc(value)}</text>`;

const box = (x, y, w, h, { stroke = C.rule, fill = C.panel, dash = null } = {}) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="7" fill="${fill}" stroke="${stroke}"`
  + `${dash === null ? '' : ` stroke-dasharray="${dash}"`} stroke-width="1"/>`;

const arrow = (x1, y, x2, colour) =>
  `<line x1="${x1}" y1="${y}" x2="${x2 - 7}" y2="${y}" stroke="${colour}" stroke-width="1.4"/>`
  + `<path d="M${x2} ${y} L${x2 - 7} ${y - 3.5} L${x2 - 7} ${y + 3.5} Z" fill="${colour}"/>`;

function draw() {
  const packages = publishable();
  const W = 880;
  const H = 442;
  const out = [];

  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img">`);
  out.push(`<title>What goes in, what is computed on your machine, and what leaves</title>`);
  out.push(`<rect width="${W}" height="${H}" rx="10" fill="${C.bg}"/>`);

  out.push(text(28, 36, 'What goes in, what is computed here, and what comes out', { size: 13.5, weight: 700 }));
  out.push(text(28, 55, 'Every figure is computed on the machine that runs it.', { size: 10.5, fill: C.soft }));

  /* ---- left: the inputs ---- */
  out.push(text(28, 90, 'YOU POINT IT AT', { size: 9, fill: C.soft }));
  out.push(box(28, 100, 168, 50));
  out.push(text(42, 121, 'a prompt', { size: 11.5 }));
  out.push(text(42, 138, 'text on your disk', { size: 9.5, fill: C.soft }));
  out.push(box(28, 162, 168, 64));
  out.push(text(42, 183, 'a usage log', { size: 11.5 }));
  out.push(text(42, 199, 'OTel · LiteLLM · Helicone', { size: 9, fill: C.soft }));
  out.push(text(42, 213, 'LangSmith · Claude Code', { size: 9, fill: C.soft }));

  /* ---- centre: the machine ---- */
  out.push(box(248, 78, 326, 262, { fill: '#1a1815' }));
  out.push(text(264, 97, 'THIS MACHINE · OFFLINE · DETERMINISTIC', { size: 9, fill: C.soft }));

  out.push(box(264, 108, 294, 48, { stroke: C.accent }));
  out.push(text(278, 128, '@trazum/core', { size: 12, weight: 700 }));
  out.push(text(278, 144, 'zero dependencies · no network', { size: 9.5, fill: C.soft }));

  /*
   * The doors, derived. `@trazum/tokenizer-openai` is deliberately not among
   * them and is drawn below as optional: it is a counter somebody installs, not
   * a way in, and listing it beside the CLI would say the opposite.
   */
  const OPTIONAL = '@trazum/tokenizer-openai';
  const doors = packages.filter((name) => name !== '@trazum/core' && name !== OPTIONAL);
  doors.push('action/');
  let y = 166;
  for (const name of doors) {
    out.push(box(264, y, 294, 28));
    out.push(text(278, y + 19, name, { size: 10.5 }));
    y += 34;
  }

  out.push(box(264, y + 4, 294, 28, { dash: '4 3' }));
  out.push(text(278, y + 23, `${OPTIONAL}  ·  optional`, { size: 9.5, fill: C.soft }));

  /* The honest exception, wrapped so it stays inside the box it describes. */
  out.push(text(264, y + 54, 'llm.ts and tokenizer.ts may reach a network, opt-in only.', { size: 8.5, fill: C.warn }));
  out.push(text(264, y + 66, 'A third module mentioning fetch fails the build.', { size: 8.5, fill: C.warn }));

  /* ---- the boundary ---- */
  out.push(`<line x1="608" y1="78" x2="608" y2="340" stroke="${C.accent}" stroke-width="1.4" stroke-dasharray="5 4"/>`);
  out.push(text(608, 68, 'THE LINE', { size: 9, fill: C.accent, weight: 700, anchor: 'middle' }));

  /* ---- right: what leaves ---- */
  out.push(text(640, 90, 'WHAT LEAVES', { size: 9, fill: C.soft }));
  const leaves = [
    ['a receipt', 'counts · money · rates'],
    ['a report', 'terminal · markdown · CSV'],
    ['a gate verdict', 'pass or fail a build'],
  ];
  let ly = 100;
  for (const [title, sub] of leaves) {
    out.push(box(640, ly, 212, 44, { stroke: C.keep }));
    out.push(text(654, ly + 19, title, { size: 11 }));
    out.push(text(654, ly + 34, sub, { size: 9, fill: C.soft }));
    out.push(arrow(574, ly + 22, 640, C.keep));
    ly += 54;
  }

  out.push(arrow(196, 125, 248, C.accent));
  out.push(arrow(196, 194, 248, C.accent));

  /* ---- what the line stops, which is the whole point ---- */
  out.push(box(28, 362, 824, 56, { stroke: C.accent, fill: '#20150f', dash: '4 3' }));
  out.push(text(44, 383, 'Never crosses the line', { size: 11, fill: C.accent, weight: 700 }));
  out.push(text(44, 400, 'the prompt text · the model’s answer · file paths · branch names · credentials', { size: 10.5 }));
  out.push(text(44, 414, 'Not redacted, not hashed — absent. receipt-redaction.test.js plants all five and fails if any appears.', { size: 8.5, fill: C.soft }));

  out.push('</svg>');
  return `${out.join('\n')}\n`;
}

const svg = draw();
mkdirSync(join(ROOT, 'docs/assets'), { recursive: true });
writeFileSync(join(ROOT, 'docs/assets/boundary.svg'), svg, 'utf8');
console.log(`wrote docs/assets/boundary.svg (${svg.length} bytes)`);
