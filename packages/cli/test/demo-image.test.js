import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { MODELS } from '@trazum/core';

import { PROMPT, SHOWN, draw, head, report, reportLines } from '../../../scripts/draw-demo.mjs';
import { styledLines } from '../../../scripts/terminal-picture.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');

/**
 * The picture under "The argument, in one screenshot", checked as output.
 *
 * `docs/assets/demo.svg` is what `trazum optimize` prints for the wordy support
 * prompt in `examples/support-prompt.txt`, drawn by `scripts/draw-demo.mjs`.
 *
 * **It used to be typed by hand**, and this file used to hold only its
 * arithmetic to the price table: two token counts, the price of two models,
 * and every dollar that follows from them. All of that stayed green while the
 * picture stopped being what the tool prints. On 2026-11-17 the report opened
 * with its "Start here" line where the picture closed with it, suggested
 * Claude Haiku 5.5 where the picture named Haiku 4.5, and assumed 300 output
 * tokens where the picture said 500, under a comment that called the picture
 * a transcript. Correct to the cent, and not the output of any command anyone
 * could run: the prompt it named was in no directory of this repository.
 *
 * So the first assertion is now the one that was missing, the same one
 * `bill-image.test.js` makes: the file is what the script draws from the CLI
 * today. The arithmetic stays, read out of the report rather than assumed,
 * because the README argues from those figures and a picture can be faithful
 * to a report that is itself wrong.
 */
const ansi = report();
const lines = reportLines(ansi);
/** One run of text: the report wraps its sentences, and a figure can sit on either side of a break. */
const text = lines.join(' ').replace(/\s+/g, ' ');

describe('the optimize picture in the README', () => {
  it('is exactly what the drawing script makes of the CLI output today', () => {
    const current = readFileSync(join(ROOT, 'docs/assets/demo.svg'), 'utf8');
    assert.equal(current, draw(ansi), 'docs/assets/demo.svg is stale. Run: node scripts/draw-demo.mjs');
  });

  it('runs on a prompt that is in this repository, by a command anybody can type', () => {
    assert.ok(existsSync(join(ROOT, PROMPT)), `${PROMPT} is not there, so nobody can re-run the picture`);
    assert.ok(SHOWN.includes(PROMPT), 'the command in the window does not name the prompt it ran on');
    const svg = readFileSync(join(ROOT, 'docs/assets/demo.svg'), 'utf8');
    assert.ok(
      svg.replaceAll('&#160;', ' ').includes(SHOWN),
      'the picture does not show the command it was drawn from',
    );
  });

  it('shows the head of the report whole, and says how much of it that is', () => {
    const all = styledLines(ansi);
    const shown = head(all);
    assert.ok(shown.length < all.length, 'the report now fits: drop the cut and the note with it');
    const svg = readFileSync(join(ROOT, 'docs/assets/demo.svg'), 'utf8').replaceAll('&#160;', ' ');
    assert.ok(
      svg.includes(`The first ${shown.length} of the ${all.length} lines`),
      'the picture cuts the report without saying how much it shows',
    );
    // The cut falls between two levers, never inside one.
    assert.match(lines[shown.length], /^ {2}[→·!] /, 'the picture stops in the middle of a lever');
    // And everything the README reads off the picture is above the cut.
    const shownText = lines.slice(0, shown.length).join(' ').replace(/\s+/g, ' ');
    for (const phrase of ['Start here', 'saving $', 'Beyond shortening the prompt']) {
      assert.ok(shownText.includes(phrase), `"${phrase}" is below the cut`);
    }
  });
});

/** The scenario the report states, so the arithmetic below is its own. */
function scenario() {
  const tokens = text.match(/(\d+) → (\d+)/);
  assert.ok(tokens !== null, 'the report no longer shows a before and after token count');
  const run = text.match(/([\d,]+) calls\/month · (\d+) output tokens per call/);
  assert.ok(run !== null, 'the report no longer states its calls and output length');
  const priced = text.match(/Cost with (.+?) [\d,]+ calls\/month/);
  assert.ok(priced !== null, 'the report no longer names the model it prices');
  const model = MODELS.find((candidate) => candidate.displayName === priced[1]);
  assert.ok(model !== undefined, `the report prices ${priced[1]}, which the catalogue does not name`);
  return {
    before: Number(tokens[1]),
    after: Number(tokens[2]),
    calls: Number(run[1].replace(/,/g, '')),
    output: Number(run[2]),
    model,
  };
}

/** A month on one model, in dollars. */
const monthly = (model, input, { calls, output }) =>
  (input * calls * model.inputPerMTok) / 1e6 + (output * calls * model.outputPerMTok) / 1e6;

const usd = (pattern, what) => {
  const found = text.match(pattern);
  assert.ok(found !== null, `the report no longer states ${what}`);
  return Number(found[1].replace(/,/g, ''));
};

const saving = () => usd(/saving \$([\d,]+\.\d\d)\/month/, 'what the rules save');
const lever = () => usd(/Beyond shortening the prompt → \$([\d,]+\.\d\d)/, 'what the first lever is worth');

describe('the figures in it follow from the price table', () => {
  it('prices the month before and after, and the saving between them', () => {
    const run = scenario();
    const before = monthly(run.model, run.before, run);
    const after = monthly(run.model, run.after, run);
    assert.equal(usd(/\$([\d,]+\.\d\d) → \$/, 'the bill before'), Number(before.toFixed(2)));
    assert.equal(usd(/→ \$([\d,]+\.\d\d) saving/, 'the bill after'), Number(after.toFixed(2)));
    assert.equal(saving(), Number((before - after).toFixed(2)));
  });

  it('states the reduction its own two token counts make', () => {
    const { before, after } = scenario();
    const pct = ((before - after) / before) * 100;
    assert.ok(text.includes(`-${pct.toFixed(1)}%`), `the report does not state -${pct.toFixed(1)}%`);
  });

  it('prices the model switch, the lever it tells the reader to start with', () => {
    const run = scenario();
    const named = text.match(/On (.+?) you would go from \$([\d,.]+) to \$([\d,.]+) per month/);
    assert.ok(named !== null, 'the report no longer prices a switch to a named model');
    const cheaper = MODELS.find((candidate) => candidate.displayName === named[1]);
    assert.ok(cheaper !== undefined, `the report suggests ${named[1]}, which the catalogue does not name`);
    const after = monthly(run.model, run.after, run);
    const switched = monthly(cheaper, run.after, run);
    assert.equal(Number(named[2].replace(/,/g, '')), Number(after.toFixed(2)));
    assert.equal(Number(named[3].replace(/,/g, '')), Number(switched.toFixed(2)));
    assert.equal(lever(), Number((after - switched).toFixed(2)));
  });

  it('opens by naming that lever, at that worth, as a multiple of the saving', () => {
    // The question is a heading ruled out to the width (#758), its answer under it.
    const opening = text.match(/^Start here ─+ "(.+?)", \$([\d,]+\.\d\d)\/month, (\d+)× what the rules saved/);
    assert.ok(opening !== null, 'the report no longer opens with where to start');
    assert.equal(Number(opening[2].replace(/,/g, '')), lever());
    assert.equal(Number(opening[3]), Math.round(lever() / saving()));
  });
});

/**
 * And the README, which says the same figures again twice.
 *
 * The README restates them in its alt text and again in the caption
 * underneath, and adds a figure in words, **N times more**, which is the two
 * of them divided. The sentence after it is *"that gap is the entire argument
 * for this tool"*, so this is the most load-bearing number the product has.
 *
 * Read out of the report rather than written down here, so a re-price moves
 * this with it: the picture is redrawn, and this fails until the prose
 * beside it says what the picture now says.
 */
describe('the README states what the picture states', () => {
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');

  it('quotes both headline figures, in the alt text and in the caption', () => {
    for (const amount of [saving(), lever()]) {
      const written = `$${amount.toFixed(2)}`;
      const times = readme.split(written).length - 1;
      assert.ok(
        times >= 2,
        `the README states ${written} ${times} time(s); the alt text and the caption both say it`,
      );
    }
  });

  it('and the multiple between them is those two divided', () => {
    const multiple = Math.round(lever() / saving());
    // Every multiple the README states, so a stale one beside a right one fails too.
    const stated = [...readme.matchAll(/(\d+) times more/g)].map(([, times]) => Number(times));
    assert.ok(stated.length >= 2, 'the alt text and the caption both state the multiple');
    assert.deepEqual(
      stated.filter((times) => times !== multiple),
      [],
      `the README says "${stated.join(', ')} times more"; `
        + `$${lever().toFixed(2)} over $${saving().toFixed(2)} comes to ${multiple}`,
    );
  });

  it('and the reduction it advertises is the report’s own two counts', () => {
    const { before, after } = scenario();
    const pct = ((before - after) / before) * 100;
    assert.ok(
      readme.includes(`${before} tokens down to ${after}`),
      `the alt text does not say ${before} tokens down to ${after}`,
    );
    assert.ok(
      readme.includes(`(-${pct.toFixed(1)}%)`),
      `the alt text does not say -${pct.toFixed(1)}%, which is ${before} → ${after}`,
    );
  });

  it('and it names the prompt, so the reader can run what the picture shows', () => {
    assert.ok(readme.includes(PROMPT), `the README does not point at ${PROMPT}`);
  });
});
