import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  analyzeCachePrefix,
  estimateTokens,
  reorderForCache,
} from '../dist/index.js';

/**
 * Reordering is the largest saving Trazum can make and the only transformation
 * that moves text rather than deleting it. Every other rule's mistake is local;
 * this one's changes what the prompt asks for.
 *
 * So the tests are weighted the way the risk is: a handful assert that it works,
 * and the rest assert that it **refuses**.
 */

const RULES = Array.from(
  { length: 40 },
  (_, i) => `- Rule ${i + 1}: verify the order identifier before quoting a policy.`,
).join('\n');

describe('what it moves', () => {
  it('puts stable instructions in front of the placeholder', () => {
    const before = `You are an agent.

Customer message: {{message}}

Always answer in the customer's language.

Never promise a delivery date.`;

    const r = reorderForCache(before);
    assert.equal(r.moved.length, 2);
    assert.ok(
      r.text.indexOf("Always answer") < r.text.indexOf('{{message}}'),
      'the instruction should now precede the placeholder',
    );
    assert.ok(
      r.text.indexOf('You are an agent') < r.text.indexOf('Always answer'),
      'the role statement should stay first',
    );
  });

  it('grows the cacheable prefix, measured rather than claimed', () => {
    // The point of the whole module. Same content, and the analyser agrees the
    // prefix got bigger — this is the number the saving is computed from.
    const stranded = `You are an agent.\n\nCustomer message: {{message}}\n\n${RULES}`;
    const r = reorderForCache(stranded);

    assert.ok(r.prefixTokensAfter > r.prefixTokensBefore * 50, 'the prefix barely moved');
    assert.equal(
      analyzeCachePrefix(r.text, estimateTokens).stablePrefixTokens,
      r.prefixTokensAfter,
      'the reported prefix disagrees with the analyser the advisories use',
    );
    // Not exactly 0: the prompt still ends with a newline after the placeholder,
    // which the estimator counts as a token. What matters is that the 1,000
    // tokens of instructions are no longer stranded there.
    assert.ok(
      analyzeCachePrefix(r.text, estimateTokens).staticTokensAfter <= 2,
      'stable content is still stranded after the placeholder',
    );
  });

  it('keeps the same content, only in a different order', () => {
    // The one invariant that makes this safe to offer at all: reordering must
    // not delete or invent anything. Compared on sorted words so the check is
    // about content rather than arrangement.
    const before = `You are an agent.\n\nInput: {{x}}\n\nRule one.\n\nRule two.`;
    const after = reorderForCache(before).text;

    const words = (t) => t.split(/\s+/).filter(Boolean).sort().join(' ');
    assert.equal(words(after), words(before), 'reordering changed the content');
  });

  it('leaves the placeholder line intact', () => {
    // "Customer message: {{message}}" is one unit; splitting it would strand
    // the label in the prefix and leave the value with no introduction.
    const r = reorderForCache(`Agent.\n\nCustomer message: {{message}}\n\nBe brief.`);
    assert.match(r.text, /Customer message: \{\{message\}\}/);
  });

  it('reports how much moved', () => {
    const r = reorderForCache(`Agent.\n\nInput: {{x}}\n\n${RULES}`);
    assert.ok(r.tokensMoved > 500);
    assert.equal(
      r.tokensMoved,
      r.moved.reduce((sum, b) => sum + b.tokens, 0),
      'tokensMoved disagrees with the blocks it says it moved',
    );
  });
});

describe('what it refuses to move', () => {
  it('pins a block that refers backwards, and says which phrase did it', () => {
    // "Summarise the text above" is correct where it sits and nonsense in front
    // of the text it points at.
    const prompt = `Agent.

Customer message: {{message}}

Summarise the text above in one sentence.`;

    const r = reorderForCache(prompt);
    assert.equal(r.moved.length, 0);
    assert.equal(r.text, prompt, 'the prompt must come back byte-identical');
    assert.equal(r.declined[0].reason, 'backward-reference');
    assert.equal(r.declined[0].phrase, 'above');
  });

  it('pins everything after a pinned block', () => {
    // Moving a later block past one that had to stay changes their order
    // relative to each other, which is the same class of harm.
    const prompt = `Agent.

Input: {{x}}

Summarise the text above.

Always answer in English.

Never invent a price.`;

    const r = reorderForCache(prompt);
    assert.equal(r.moved.length, 0, 'a block after a pinned one moved anyway');
    assert.equal(r.text, prompt);
    assert.deepEqual(
      r.declined.map((d) => d.reason),
      ['backward-reference', 'after-pinned', 'after-pinned'],
    );
  });

  it('recognises a backward reference in Spanish too', () => {
    // Real prompts mix languages, and the dictionaries cover both on purpose.
    const prompt = `Agente.\n\nMensaje: {{mensaje}}\n\nResume el texto anterior.`;
    const r = reorderForCache(prompt);
    assert.equal(r.moved.length, 0);
    assert.equal(r.declined[0].phrase, 'anterior');
  });

  it('is not fooled by a word that merely contains a reference', () => {
    // "aboveboard" is not "above". A false positive here costs a real saving.
    const prompt = `Agent.\n\nInput: {{x}}\n\nKeep everything aboveboard and honest.`;
    const r = reorderForCache(prompt);
    assert.equal(r.moved.length, 1, 'a lookalike word pinned the block');
  });

  it('does nothing without a placeholder', () => {
    // No placeholder means the whole prompt already caches. There is nothing to
    // gain and a diff for its own sake is worse than no diff.
    const prompt = 'A plain prompt with no template variables.';
    const r = reorderForCache(prompt);
    assert.equal(r.text, prompt);
    assert.equal(r.moved.length, 0);
  });

  it('never moves a block containing a placeholder of its own', () => {
    const prompt = `Agent.\n\nFirst: {{a}}\n\nBe brief.\n\nSecond: {{b}}`;
    const r = reorderForCache(prompt);
    for (const block of r.moved) {
      assert.doesNotMatch(block.text, /\{\{/, 'a block with a placeholder was moved');
    }
  });

  it('declines below a minimum worth the rearrangement', () => {
    // A caller who knows the model's cache minimum can say "not worth it", and
    // then the prompt comes back untouched rather than churned for nothing.
    const prompt = `Agent.\n\nInput: {{x}}\n\nBe brief.`;
    const r = reorderForCache(prompt, { minTokens: 500 });
    assert.equal(r.text, prompt);
    assert.equal(r.moved.length, 0);
  });

  it('reports refusals even when nothing moved', () => {
    // "No saving here" and "there was a saving and it was not safe to take" are
    // different answers, and the author can only act on the second one.
    const r = reorderForCache(`Agent.\n\nInput: {{x}}\n\nUse the text above.`);
    assert.equal(r.moved.length, 0);
    assert.ok(r.declined.length > 0, 'a refusal happened and was not reported');
  });
});

describe('the seams it rebuilds', () => {
  it('does not open the prompt with a blank line when the placeholder was first', () => {
    // With no head, the moved blocks become the start of the prompt. Emitting the
    // usual leading gap would put a blank line at byte zero — which changes the
    // cache prefix for no reason at all.
    const r = reorderForCache('Input: {{x}}\n\nBe brief.\n\nBe kind.');
    assert.equal(r.moved.length, 2);
    assert.doesNotMatch(r.text, /^\s/, 'the rearranged prompt starts with whitespace');
    assert.equal(r.text, 'Be brief.\n\nBe kind.\n\nInput: {{x}}');
  });

  it('keeps CRLF line endings when that is what the prompt used', () => {
    // A prompt written on Windows must not come back with every seam converted.
    // Nobody asked for a reformat, and where the product is a byte-for-byte
    // prefix match, a changed byte is a changed price.
    const before = 'You are an agent.\r\n\r\nInput: {{x}}\r\n\r\nBe brief.\r\n';
    const r = reorderForCache(before);

    assert.equal(r.moved.length, 1);
    assert.ok(r.text.includes('\r\n'), 'the CRLF endings were dropped');
    assert.doesNotMatch(
      r.text,
      /(?<!\r)\n/,
      'the output mixes bare newlines into a CRLF prompt',
    );
  });

  it('does not introduce CRLF into a prompt that had none', () => {
    const r = reorderForCache('Agent.\n\nInput: {{x}}\n\nBe brief.');
    assert.doesNotMatch(r.text, /\r/, 'a carriage return appeared out of nowhere');
  });

  it('ends the prompt however the author ended it', () => {
    // A block carries the blank line that followed it, so trimming the seams
    // without restoring the original ending silently adds or drops a newline.
    for (const ending of ['', '\n', '\n\n\n']) {
      const prompt = `Agent.\n\nInput: {{x}}\n\nBe brief.${ending}`;
      const r = reorderForCache(prompt);
      assert.equal(r.moved.length, 1);
      assert.equal(
        /\s*$/.exec(r.text)[0],
        ending,
        `the ending changed for ${JSON.stringify(ending)}`,
      );
    }
  });

  it('leaves exactly one blank line between blocks', () => {
    const r = reorderForCache('Agent.\n\nInput: {{x}}\n\nBe brief.\n\nBe kind.\n\nBe honest.');
    assert.equal(r.moved.length, 3);
    assert.doesNotMatch(r.text, /\n{3}/, 'the rejoin left a three-newline gap');
  });
});

describe('protected content survives', () => {
  it('does not move a code fence into the prefix and break it', () => {
    const prompt = `Agent.

Input: {{x}}

\`\`\`json
{ "ok": true }
\`\`\``;
    const r = reorderForCache(prompt);
    assert.match(r.text, /```json\n\{ "ok": true \}\n```/, 'the fence was damaged');
  });

  it('leaves a URL untouched', () => {
    const prompt = `Agent.\n\nInput: {{x}}\n\nSee https://example.com/a?b=c&d=e for the catalogue.`;
    const r = reorderForCache(prompt);
    assert.match(r.text, /https:\/\/example\.com\/a\?b=c&d=e/);
  });
});
