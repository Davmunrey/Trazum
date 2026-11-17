import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ACID, DARK } from '../../../scripts/brand.mjs';
import { THEME, drawTerminal, plain, styledLines } from '../../../scripts/terminal-picture.mjs';

/**
 * The part of the README's two transcripts that is not the CLI's: how escape
 * codes become styled runs, and how runs become a picture.
 *
 * `bill-image.test.js` and `demo-image.test.js` hold each picture to what the
 * script draws today, which proves the file is current and says nothing about
 * whether the drawing is right. These are the properties a reader of the
 * README depends on without knowing it: a paragraph the CLI dims stays dim on
 * its second line, a colour the theme has no value for is an error instead of
 * a line quietly drawn in white, and nothing is wider than the window.
 */
const ESC = '\u001b[';

describe('escape codes become styled runs', () => {
  it('carries a style across a line end, as a terminal does', () => {
    const lines = styledLines(`${ESC}2mfirst\nsecond${ESC}22m third`);
    assert.equal(lines[0][0].dim, true);
    assert.equal(lines[1][0].dim, true, 'the second line of a dim paragraph came out bright');
    assert.equal(lines[1][1].dim, false);
  });

  it('closes bold and dim with the one code that closes both', () => {
    const [line] = styledLines(`${ESC}1mbold${ESC}22m plain`);
    assert.equal(line[0].bold, true);
    assert.equal(line[1].bold, false);
  });

  it('closes a colour without touching the weight', () => {
    const [line] = styledLines(`${ESC}1m${ESC}32mgreen${ESC}39m still bold${ESC}22m`);
    assert.equal(line[0].colour, 32);
    assert.equal(line[1].colour, null);
    assert.equal(line[1].bold, true);
  });

  it('refuses a colour the theme has no value for', () => {
    assert.throws(() => styledLines(`${ESC}35mmagenta${ESC}39m`), /colour code 35/);
  });

  it('gives every colour the CLI can print a value from the palette', () => {
    assert.deepEqual(
      Object.keys(THEME).map(Number).sort(),
      [31, 32, 33, 36],
      'style.ts paints in red, green, yellow and cyan; the theme should name exactly those',
    );
    assert.equal(THEME[32], DARK.good);
    assert.equal(THEME[33], DARK.warn);
    assert.equal(THEME[31], DARK.bad);
    assert.equal(THEME[36], ACID);
  });

  it('drops trailing spaces and the blank lines at either end, and nothing else', () => {
    const lines = styledLines('\n\n  kept   \n\n  also kept\n\n');
    assert.deepEqual(lines.map((runs) => runs.map((part) => part.text).join('')), ['  kept', '', '  also kept']);
  });

  it('strips to the text a pipe would have carried', () => {
    assert.equal(plain(`${ESC}1m${ESC}36m→${ESC}39m title${ESC}22m`), '→ title');
  });
});

describe('runs become a picture', () => {
  const picture = (overrides = {}) =>
    drawTerminal({
      command: 'trazum bill',
      lines: styledLines(`${ESC}1mYour bill${ESC}22m ${ESC}2m───${ESC}22m\n  a   b  ${ESC}36m██${ESC}39m${ESC}2m░░${ESC}22m`),
      label: 'a label',
      comment: 'a comment',
      ...overrides,
    });

  it('writes every space as one that <img> will not collapse', () => {
    const runs = [...picture().matchAll(/<tspan[^>]*>([^<]*)<\/tspan>/g)].map(([, text]) => text);
    assert.ok(runs.some((text) => text.includes('&#160;&#160;&#160;')), 'the column gap is gone');
    assert.deepEqual(runs.filter((text) => text.includes(' ')), []);
  });

  it('draws what the CLI points with in acid, and structure in the rule colour', () => {
    const svg = picture();
    assert.match(svg, new RegExp(`<tspan fill="${ACID}" stroke="${ACID}"[^>]*>██</tspan>`));
    assert.match(svg, new RegExp(`<tspan fill="${DARK.rule}">░░</tspan>`));
    assert.match(svg, new RegExp(`<tspan fill="${DARK.rule}">───</tspan>`));
    assert.match(svg, new RegExp(`<tspan fill="${DARK.text}" font-weight="bold">Your&#160;bill</tspan>`));
  });

  it('is wide enough for its longest line in a face a little wider than most', () => {
    const long = 'x'.repeat(120);
    const svg = picture({ lines: styledLines(long) });
    const width = Number(svg.match(/^<svg[^>]* width="(\d+)"/)[1]);
    // 13px at 0.62em a character, plus the padding on both sides.
    assert.ok(width >= 120 * 13 * 0.62 + 44, `a 120-character line in a ${width}px window`);
  });

  it('and for the note under it, which is the picture’s own line', () => {
    const note = 'n'.repeat(140);
    const svg = picture({ note });
    const width = Number(svg.match(/^<svg[^>]* width="(\d+)"/)[1]);
    assert.ok(width >= 140 * 11.5 * 0.62 + 44, `a 140-character note in a ${width}px window`);
    assert.ok(svg.includes(note));
  });

  it('refuses a comment that would make the file unreadable as XML', () => {
    assert.throws(() => picture({ comment: 'run with --table' }), /two hyphens/);
  });
});
