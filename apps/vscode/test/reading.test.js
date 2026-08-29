import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  detailText,
  isPrompt,
  measureRecoverable,
  monthlyUsd,
  read,
  statusText,
} from '../dist/reading.js';

/**
 * The whole extension, checked without an editor.
 *
 * A VS Code extension is normally tested by downloading VS Code and driving it:
 * a network dependency, a version to track, and a suite that cannot run on a
 * machine with no display. Every judgement worth checking was put in
 * `reading.ts` so that this file can check it with `node --test` and nothing
 * else, and `shim.test.js` is what stops judgement leaking back into the part
 * that needs an editor.
 */

/** A prompt the safe rules genuinely trim: politeness, measured at 10 tokens. */
const PROMPT = 'Please could you kindly verify the order identifier. Thank you very much.';

describe('what the editor is allowed to show', () => {
  it('counts the text and carries the band, because the count is an estimate', () => {
    const result = read(PROMPT, { path: 'prompts/support.txt', config: {} });
    assert.equal(result.kind, 'reading');
    assert.ok(result.reading.tokens > 0);
    assert.ok(result.reading.bandPct > 0, 'a count with no band reads as exact');
  });

  it('places the prompt against the budget that covers it, and names the pattern', () => {
    const config = { budgets: { 'prompts/**': 40, 'prompts/support.txt': 10 } };
    const result = read(PROMPT, { path: 'prompts/support.txt', config });

    assert.equal(result.kind, 'reading');
    assert.equal(result.reading.budget.pattern, 'prompts/support.txt', 'the most specific pattern must win');
    assert.equal(result.reading.budget.maxTokens, 10);
    assert.equal(result.reading.budget.over, true);
  });

  it('has no budget rather than a default one, when no pattern covers the file', () => {
    const result = read(PROMPT, { path: 'prompts/support.txt', config: { budgets: { 'other/**': 10 } } });
    assert.equal(result.reading.budget, null, 'an invented budget is a limit nobody set');
  });

  it('never divides by a budget of nothing', () => {
    const result = read(PROMPT, { path: 'p.txt', config: { budgets: { 'p.txt': 0 } } });
    assert.equal(Number.isFinite(result.reading.share ?? 0), true);
    assert.equal(result.reading.budget.share, 0, 'Infinity% is worse than no percentage');
  });
});

describe('when there is no reading, it says which of the reasons it is', () => {
  it('separates an empty document from a file that is not a prompt', () => {
    assert.equal(read('', { path: 'a.txt', config: {} }).reason, 'empty');
    assert.equal(read(PROMPT, { path: 'a.rs', config: {} }).reason, 'not-a-prompt');
  });

  it('refuses a document past the ceiling the rest of the product refuses at', () => {
    const huge = 'a '.repeat(300_000);
    assert.equal(read(huge, { path: 'a.txt', config: {} }).reason, 'too-large');
  });

  it('honours the extensions the project configured, and nothing else', () => {
    assert.equal(isPrompt('a.prompt', { extensions: ['.prompt'] }), true);
    assert.equal(isPrompt('a.txt', { extensions: ['.prompt'] }), false, 'the default list must not leak back in');
  });
});

describe('null is not zero, and the status bar is where that shows', () => {
  it('a fresh reading has not measured the rules, and says so rather than showing nothing', () => {
    const { reading } = read(PROMPT, { path: 'a.txt', config: {} });
    assert.equal(reading.recoverable, null);
    assert.match(detailText(reading), /have not been run/);
  });

  it('a measured zero says the rules found nothing, which is a different sentence', () => {
    const { reading } = read('Verify the order identifier.', { path: 'a.txt', config: {} });
    assert.match(detailText({ ...reading, recoverable: 0 }), /found nothing to trim/);
  });

  it('and a measured saving is stated as one', () => {
    const { reading } = read(PROMPT, { path: 'a.txt', config: {} });
    assert.match(detailText({ ...reading, recoverable: 6 }), /recover about 6 tokens/);
  });
});

describe('the recoverable figure is measured, never estimated', () => {
  it('is what optimize actually removes from this text', () => {
    assert.ok(measureRecoverable(PROMPT) > 0, 'the fixture must exercise a rule, or this proves nothing');
  });

  it('is zero for text the rules cannot improve, and never negative', () => {
    assert.equal(measureRecoverable('Verify the order identifier.'), 0);
    assert.ok(measureRecoverable('') >= 0);
  });
});

describe('a monthly figure only where the config declares a workload', () => {
  it('is null when nothing says what this prompt costs to run', () => {
    assert.equal(monthlyUsd(PROMPT, {}), null, 'a monthly figure from defaults is a number nobody can justify');
    assert.equal(monthlyUsd(PROMPT, { usage: { model: 'claude-opus-5' } }), null, 'a model with no call volume prices nothing');
  });

  it('is a figure once the config states both halves', () => {
    const usd = monthlyUsd(PROMPT, { usage: { model: 'claude-opus-5', callsPerMonth: 1000 } });
    assert.match(usd, /^\$/);
  });
});

describe('the two strings the editor renders', () => {
  it('states the count, and the budget beside it when there is one', () => {
    const bare = read(PROMPT, { path: 'a.txt', config: {} }).reading;
    assert.match(statusText(bare), /^\d[\d,]* tokens$/);

    const budgeted = read(PROMPT, { path: 'a.txt', config: { budgets: { 'a.txt': 40 } } }).reading;
    assert.match(statusText(budgeted), /\/ 40$/);
  });

  it('never renders a percentage the reading does not carry', () => {
    const over = read(PROMPT, { path: 'a.txt', config: { budgets: { 'a.txt': 4 } } }).reading;
    const detail = detailText({ ...over, recoverable: 0 });
    assert.match(detail, /Over the 4-token budget/);
    assert.doesNotMatch(detail, /\d+% of/, 'a prompt over budget has no share to report');
  });
});
