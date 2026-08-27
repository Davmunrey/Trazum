import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { MODELS, bandFor } from '../dist/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');

/**
 * The picture at the top of the README, checked as arithmetic.
 *
 * It is the first thing anyone sees of this product, and it is a terminal
 * transcript: a prompt of 238 tokens shortened to 142, priced on Claude Opus 5
 * at 50,000 calls a month, with the model-switch and Batch levers underneath.
 * The prompt is illustrative — `support-prompt.txt` is not in this repository,
 * and a drawing is allowed to invent its subject.
 *
 * What it may not invent is the money. Every dollar in it follows from two
 * token counts and the price of one model, and that price lives in a table
 * that changes. Nothing was checking. An Opus 5 re-price would have left the
 * README showing figures that were right once and no longer are, on the one
 * asset every visitor looks at before anything else — and this repository has
 * just spent a release finding out what an unchecked derived figure does.
 *
 * The scenario is read out of the drawing rather than assumed, so redrawing it
 * with different counts moves the expectations with it.
 */
const svg = readFileSync(join(ROOT, 'docs/assets/demo.svg'), 'utf8');
const text = [...svg.matchAll(/>([^<]+)</g)].map((match) => match[1]).join(' ');

/** The scenario the picture states, so the arithmetic below is its own. */
function scenario() {
  const tokens = text.match(/(\d+) → \s*(\d+)/);
  assert.ok(tokens !== null, 'the demo image no longer shows a before and after token count');
  const run = text.match(/([\d,]+) calls\/month · (\d+) output tokens per call/);
  assert.ok(run !== null, 'the demo image no longer states its calls and output length');
  return {
    before: Number(tokens[1]),
    after: Number(tokens[2]),
    calls: Number(run[1].replace(/,/g, '')),
    output: Number(run[2]),
  };
}

/** A month on one model, in dollars. */
const monthly = (model, input, { calls, output }) =>
  (input * calls * model.inputPerMTok) / 1e6 + (output * calls * model.outputPerMTok) / 1e6;

/** `$684.50` written into the picture next to the phrase that introduces it. */
function drawn(phrase) {
  const found = text.match(new RegExp(`${phrase}\\$([\\d,]+\\.\\d\\d)`));
  assert.ok(found !== null, `the demo image no longer shows a figure after "${phrase}"`);
  return Number(found[1].replace(/,/g, ''));
}

const shows = (computed, phrase, what) =>
  assert.equal(
    drawn(phrase),
    Number(computed.toFixed(2)),
    `${what}: the demo image shows $${drawn(phrase)} and the prices make it $${computed.toFixed(2)}`,
  );

describe('the picture at the top of the README', () => {
  const opus = MODELS.find((model) => model.id === 'claude-opus-5');
  const haiku = MODELS.find((model) => model.id === 'claude-haiku-4-5');

  it('names the two models it prices, and states its own scenario', () => {
    assert.ok(opus && haiku, 'the two models the demo prices are gone from the catalogue');
    assert.ok(text.includes(opus.displayName), `the demo image no longer names ${opus.displayName}`);
    assert.ok(text.includes(haiku.displayName), `the demo image no longer names ${haiku.displayName}`);
    const { before, after, calls, output } = scenario();
    assert.ok(before > after && after > 0, 'the demo image shortens nothing');
    assert.ok(calls > 0 && output > 0, 'the demo image prices nothing');
  });

  it('states the reduction its own two token counts make', () => {
    const { before, after } = scenario();
    const pct = ((before - after) / before) * 100;
    assert.ok(
      text.includes(`-${pct.toFixed(1)}%`),
      `the demo image does not state -${pct.toFixed(1)}%, which is ${before} → ${after}`,
    );
  });

  it('prices the month before and after at the catalogue’s numbers', () => {
    const run = scenario();
    const before = monthly(opus, run.before, run);
    const after = monthly(opus, run.after, run);
    shows(before, '', 'the bill before');
    shows(after, '→ ', 'the bill after');
    shows(before - after, 'saving ', 'what the rules save');
  });

  it('splits that bill into output and input the way the prices do', () => {
    const run = scenario();
    shows((run.output * run.calls * opus.outputPerMTok) / 1e6, 'output accounts for ', 'the output half');
    shows((run.after * run.calls * opus.inputPerMTok) / 1e6, 'against ', 'the input half');
  });

  it('prices the model switch, the lever it tells the reader to start with', () => {
    const run = scenario();
    const after = monthly(opus, run.after, run);
    const switched = monthly(haiku, run.after, run);
    assert.ok(
      text.includes(`from $${after.toFixed(2)} to $${switched.toFixed(2)} per month`),
      `the demo image does not say the switch goes from $${after.toFixed(2)} to `
        + `$${switched.toFixed(2)}, which is what the two models cost`,
    );
    assert.ok(
      text.includes(`$${(after - switched).toFixed(2)}`),
      `the demo image does not state $${(after - switched).toFixed(2)} as the switch's worth`,
    );
  });

  it('states the band this product publishes for prose, not an older one', () => {
    const band = bandFor('This is an ordinary English sentence of prose, long enough to sort.');
    assert.ok(
      text.includes(`±${band}%`),
      `the demo image shows a band that is not the ±${band}% this product publishes for prose`,
    );
  });
});
