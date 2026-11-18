import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { RULES, getRule, optimize } from '../dist/index.js';

/**
 * What a rule reports, and exactly where it starts to apply.
 *
 * Mutation testing (#690) left more of `rules.ts` alive than of any other
 * file it ran on. The suite held what the rules do to a prompt as a whole.
 * It did not hold each rule's own account of itself, and on 2026-11-17 none
 * of these failed a test:
 *
 *   - a rule that changed nothing reporting one hit;
 *   - a rule that did not fire tidying the text anyway, so the edit had no
 *     rule to its name;
 *   - a rule that fired once not tidying after itself;
 *   - the length at which a line, a block or a near-copy starts to count as a
 *     repeat moving by one;
 *   - a replacement losing the capital of what it replaced.
 *
 * Each rule is applied on its own here, through `getRule`, so what it says is
 * not hidden by the rules that run after it.
 */

const apply = (id, text) => getRule(id).apply(text);
const letters = (count) => Array.from({ length: count }, (_, index) => 'abcdefghijklmnopqrstuvwxyz'[index % 26]).join('');

describe('a rule is found by its name', () => {
  it('returns the rule asked for, and nothing for a name that is not a rule', () => {
    for (const rule of RULES) assert.equal(getRule(rule.id), rule);
    assert.equal(getRule('no-such-rule'), undefined);
  });
});

describe('a rule with nothing to do says so', () => {
  it('returns the text as it was, with no hits, from every rule', () => {
    const text = 'Summarise the report in three bullet points.';
    for (const rule of RULES) {
      assert.deepEqual(rule.apply(text), { text, hits: 0 }, rule.id);
    }
  });

  it('does not tidy a text it did not edit', () => {
    // Two spaces, and a space before a comma and a full stop: all of it
    // something the tidy-up after a removal would change. No phrase here is
    // one any of these rules removes, so none of them may touch it.
    const text = 'Summarise  the report , then stop .';
    for (const id of ['verbose-phrases', 'politeness', 'filler', 'hedges', 'intensifiers', 'self-check', 'emphasis']) {
      assert.deepEqual(apply(id, text), { text, hits: 0 }, id);
    }
  });

  it('does not close up blank lines it did not open', () => {
    const text = 'First point.\n\n\nSecond point.';
    for (const id of ['decoration', 'duplicate-lines']) {
      assert.deepEqual(apply(id, text), { text, hits: 0 }, id);
    }
  });

  it('is not listed in a report for an edit that has no hit behind it', () => {
    // Splitting into blocks and joining them again closes up three line
    // breaks into two. That is a change with no hit, and a change with no hit
    // is not the block rule's to report: closing up blank lines is the
    // whitespace rule's, and it is the one that says so.
    const report = optimize('First point.\n\n\nSecond point.');
    assert.equal(report.optimized, 'First point.\n\nSecond point.');
    assert.deepEqual(report.rules.map((rule) => [rule.id, rule.hits]), [['whitespace', 1]]);
    for (const rule of report.rules) assert.ok(rule.hits > 0, rule.id);
  });
});

describe('a rule that fires once tidies after itself, and counts once', () => {
  it('drops an emphasis prefix and puts the capital back', () => {
    assert.deepEqual(apply('emphasis', 'IMPORTANT: keep it short.'), { text: 'Keep it short.', hits: 1 });
  });

  it('lowers a shouted word and closes the space it finds before a comma', () => {
    assert.deepEqual(apply('emphasis', 'You MUST answer , always.'), { text: 'You must answer, always.', hits: 1 });
  });

  it('counts a prefix and a shouted word as two', () => {
    assert.deepEqual(apply('emphasis', 'IMPORTANT: you MUST answer.'), { text: 'You must answer.', hits: 2 });
  });

  it('shortens a wordy phrase and closes the space it finds before a comma', () => {
    assert.deepEqual(apply('verbose-phrases', 'He said in order to win , try.'), { text: 'He said to win, try.', hits: 1 });
  });

  it('removes a ruler line and closes the gap it leaves', () => {
    assert.deepEqual(apply('decoration', 'A\n\n========\n\nB'), { text: 'A\n\nB', hits: 1 });
  });

  it('removes a repeated line and closes the gap it leaves', () => {
    const line = letters(25);
    assert.deepEqual(apply('duplicate-lines', [line, '', line, '', 'end'].join('\n')), { text: `${line}\n\nend`, hits: 1 });
  });
});

describe('a replacement keeps the capital of what it replaces', () => {
  it('capitalises the replacement of a capitalised phrase in the middle of a sentence', () => {
    // Mid-sentence on purpose: at the start of one, the tidy-up restores the
    // capital whatever the replacement did, and would hide this.
    assert.equal(apply('verbose-phrases', 'He said In order to win, try.').text, 'He said To win, try.');
  });

  it('leaves the replacement of a lower-case phrase in lower case', () => {
    assert.equal(apply('verbose-phrases', 'He said in order to win, try.').text, 'He said to win, try.');
  });
});

describe('a repeat counts from a stated length, and not one character sooner', () => {
  it('removes a repeated line of 25 characters and keeps one of 24', () => {
    const short = letters(24);
    const long = letters(25);
    assert.deepEqual(apply('duplicate-lines', `${short}\n${short}`), { text: `${short}\n${short}`, hits: 0 });
    assert.deepEqual(apply('duplicate-lines', `${long}\n${long}`), { text: long, hits: 1 });
  });

  it('removes a repeated block of 40 characters and keeps one of 39', () => {
    const short = letters(39);
    const long = letters(40);
    assert.deepEqual(apply('duplicate-blocks', `${short}\n\n${short}`), { text: `${short}\n\n${short}`, hits: 0 });
    assert.deepEqual(apply('duplicate-blocks', `${long}\n\n${long}`), { text: long, hits: 1 });
  });

  it('removes a near-copy of a block of 60 characters and keeps one of 59', () => {
    const short = letters(59);
    const long = letters(60);
    assert.deepEqual(apply('near-duplicate-blocks', `${short}\n\n${short}`), { text: `${short}\n\n${short}`, hits: 0 });
    assert.deepEqual(apply('near-duplicate-blocks', `${long}\n\n${long}`), { text: long, hits: 1 });
  });
});
