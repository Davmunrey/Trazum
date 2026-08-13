import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/**
 * What the report puts first.
 *
 * Every other test in this directory checks that a number is right. This one
 * checks that the right number is *where the reader will see it*, which turned
 * out to be the more valuable property: the figure Trazum led with was worth a
 * few hundredths of what the figure it closed with was.
 */
describe('what the report leads with', () => {
  /**
   * The finding that prompted this, measured rather than asserted.
   *
   * On an ordinary support prompt — already reasonably written, which is what a
   * real one is — the rules recover **three tokens of 306**, worth $0.75 a
   * month, while the advisories below them are worth $345 and $48. The report
   * opened with the 1.0% and closed with the comparison.
   *
   * That is not a presentation quibble. It teaches the reader that shortening
   * the prompt is what this tool is for, and on any prompt somebody competent
   * wrote, shortening it is the smallest thing available.
   */
  const PROMPT = [
    'You are a helpful and friendly customer support assistant for Acme Corp.',
    'Please be so kind as to always greet the customer warmly before you begin.',
    '',
    "Here is the customer's question: {{question}}",
    '',
    'You should always follow these rules very carefully when you answer:',
    'Do not ever make any promises about refunds unless the order is under 30 days old.',
    'Do not ever share any internal policy document text with the customer directly.',
    'Always ask for the order number if the customer has not already provided it.',
    'If the customer is angry, acknowledge the frustration first before explaining.',
    'Never speculate about delivery dates that logistics has not confirmed.',
    'Escalate to a human agent whenever the customer explicitly asks for one.',
    'If the question is about billing, direct them to the billing portal link.',
    'Always close by asking whether there is anything else you can help with.',
  ].join('\n');

  const runOptimize = (extra) =>
    spawnSync(
      process.execPath,
      [
        CLI,
        'optimize',
        '-',
        '--model',
        'claude-opus-5',
        '--calls',
        '50000',
        '--output-tokens',
        '400',
        '-o',
        process.platform === 'win32' ? 'NUL' : '/dev/null',
        ...extra,
      ],
      { input: PROMPT, encoding: 'utf8', env: SPAWN_ENV, timeout: 30000 },
    );

  it('opens with the biggest lever, not with the token count', () => {
    const result = runOptimize(['--cost']);
    assert.equal(result.status, 0, result.stderr);

    const out = result.stdout + result.stderr;
    const lever = out.indexOf('Start here');
    const tokens = out.indexOf('Input tokens');

    assert.ok(lever >= 0, 'the report does not say what to do first');
    assert.ok(tokens >= 0, 'the token count is gone entirely');
    assert.ok(
      lever < tokens,
      'the token count comes first, so the most useful line is below the fold again',
    );
  });

  it('says how many times bigger it is than the rules', () => {
    // The multiple is the whole point. "$345/month" beside a report whose
    // headline is -1.0% does not tell the reader those are the same prompt.
    const result = runOptimize(['--cost']);
    assert.match(result.stdout + result.stderr, /\d+×/, 'the comparison to the rules is missing');
  });

  it('says nothing when a monthly figure would be meaningless', () => {
    // On a subscription an advisory whose entire pitch is money is not weaker
    // advice, it is not advice — and a heading with a shrug under it is worse
    // than no heading.
    const result = runOptimize(['--tokens-only']);
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stdout + result.stderr, /Start here/, 'it priced a flat plan');
  });
});
