import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  analyzeExamples,
  estimateTokens,
  findContradictions,
  findExamples,
  optimize,
} from '../dist/index.js';

describe('contradictory instructions', () => {
  const axisOf = (prompt) => findContradictions(prompt).map((c) => c.axis);

  it('catches two instructions disagreeing about the response language', () => {
    const found = findContradictions(
      'Always answer in English.\n\nRespond in the customer language when possible.',
    );
    assert.equal(found.length, 1);
    assert.equal(found[0].axis, 'response-language');
    // Both sides are quoted, so the reader can judge without hunting.
    assert.match(found[0].a.snippet, /English/);
    assert.match(found[0].b.snippet, /customer/);
  });

  it('catches disagreement about length, format and reasoning', () => {
    assert.deepEqual(axisOf('Be concise.\n\nBe comprehensive and thorough.'), ['response-length']);
    assert.deepEqual(axisOf('Respond only with JSON.\n\nUse markdown for the answer.'), [
      'output-format',
    ]);
    assert.deepEqual(
      axisOf('Explain your reasoning.\n\nReturn only the answer, no explanation.'),
      ['reasoning-visibility'],
    );
  });

  it('reports several axes at once', () => {
    const found = findContradictions(
      [
        'Always answer in English.',
        'Respond in the user language.',
        'Be brief.',
        'Be exhaustive.',
      ].join('\n'),
    );
    assert.equal(found.length, 2);
    assert.deepEqual(new Set(found.map((c) => c.axis)), new Set(['response-language', 'response-length']));
  });

  it('reports an axis once however often it repeats', () => {
    const found = findContradictions(
      'Be concise.\nBe concise.\nBe concise.\n\nBe thorough and detailed.',
    );
    assert.equal(found.length, 1);
  });

  // The false positives that would make the advisory not worth reading.
  it('does not mistake a translation task for a response-language directive', () => {
    assert.deepEqual(findContradictions('Translate the text into English. Answer in the user language.'), []);
  });

  it('does not flag a deliberate trade-off written in one sentence', () => {
    assert.deepEqual(findContradictions('Be concise but thorough.'), []);
  });

  it('does not read a schema inside a code fence as an instruction', () => {
    const prompt = [
      'Respond only with JSON.',
      '',
      'Output format:',
      '',
      '```json',
      '{ "note": "use plain text here", "style": "markdown" }',
      '```',
    ].join('\n');
    assert.deepEqual(findContradictions(prompt), []);
  });

  it('stays quiet on a coherent prompt', () => {
    assert.deepEqual(
      findContradictions('Classify the sentiment. Answer in English. Be concise. Return only JSON.'),
      [],
    );
  });

  it('works on Spanish prompts', () => {
    const found = findContradictions(
      'Responde siempre en español.\n\nContesta en el idioma del cliente.',
    );
    assert.equal(found.length, 1);
    assert.equal(found[0].axis, 'response-language');
  });
});

describe('few-shot examples', () => {
  const EXAMPLES = [
    'Classify the ticket.',
    '',
    'Example 1:',
    'Input: Order 4471 has not arrived and the tracking page is empty.',
    'Output: {"category": "shipping"}',
    '',
    'Example 2:',
    'Input: Order 8892 has not arrived and the tracking page is empty.',
    'Output: {"category": "shipping"}',
    '',
    'Example 3:',
    'Input: The payment failed twice with card ending 9021.',
    'Output: {"category": "payment"}',
  ].join('\n');

  it('splits on the most explicit header style available', () => {
    // "Example N:" wins over the "Input:" lines nested inside each block —
    // matching both would halve every example and compare the halves.
    const blocks = findExamples(EXAMPLES, estimateTokens);
    assert.equal(blocks.length, 3);
    assert.match(blocks[0].text, /^Example 1:/);
    assert.match(blocks[0].text, /Output:/);
  });

  it('falls back to Input: headers when there is no Example: label', () => {
    const prompt = [
      'Input: the product arrived quickly',
      'Output: positive',
      '',
      'Input: terrible quality',
      'Output: negative',
    ].join('\n');
    assert.equal(findExamples(prompt, estimateTokens).length, 2);
  });

  it('stops the last example where the prose resumes', () => {
    // Regression: the final block ran to the end of the prompt and absorbed
    // every instruction after it, inflating its length until its similarity to
    // the others fell below any sensible threshold — so the block most likely
    // to be a duplicate was the one that never got reported.
    const prompt = [
      'Example 1:',
      'Input: Order 4471 has not arrived and the tracking page is empty.',
      'Output: {"category": "shipping"}',
      '',
      'Example 2:',
      'Input: Order 8892 has not arrived and the tracking page is empty.',
      'Output: {"category": "shipping"}',
      '',
      'Check the catalogue at https://api.example.com/v1/catalogue',
      '',
      'Always keep a formal tone with the end user.',
    ].join('\n');

    const blocks = findExamples(prompt, estimateTokens);
    assert.equal(blocks.length, 2);
    assert.ok(!blocks[1].text.includes('catalogue'), 'trailing prose leaked into the example');
    assert.ok(!blocks[1].text.includes('formal tone'));
    assert.equal(analyzeExamples(prompt, estimateTokens).redundant.length, 1);
  });

  it('finds no examples in a prompt that has none', () => {
    assert.deepEqual(findExamples('Summarise this text. Be brief.', estimateTokens), []);
  });

  it('flags a near-copy of an earlier example and blames the original', () => {
    const analysis = analyzeExamples(EXAMPLES, estimateTokens);
    assert.equal(analysis.examples.length, 3);
    assert.equal(analysis.redundant.length, 1);
    assert.equal(analysis.redundant[0].index, 1);
    assert.equal(analysis.redundant[0].duplicateOf, 0);
    assert.ok(analysis.redundant[0].similarity >= 0.7);
    assert.ok(analysis.redundantTokens > 0);
  });

  it('leaves genuinely different examples alone', () => {
    const prompt = [
      'Example 1:',
      'Input: Order 4471 has not arrived and the tracking page is empty.',
      'Output: {"category": "shipping"}',
      '',
      'Example 2:',
      'Input: The payment failed twice with card ending 9021.',
      'Output: {"category": "payment"}',
    ].join('\n');
    assert.equal(analyzeExamples(prompt, estimateTokens).redundant.length, 0);
  });

  it('does not claim to catch paraphrases', () => {
    // Documented limit: the same lesson in different words scores around 0.54,
    // close enough to two distinct examples (~0.20) that catching it would
    // mean flagging examples that teach different things. Recognising it needs
    // a model, not word-set overlap.
    const prompt = [
      'Example 1:',
      'Input: The product arrived quickly and works great.',
      'Output: positive',
      '',
      'Example 2:',
      'Input: The item arrived fast and works well.',
      'Output: positive',
    ].join('\n');
    assert.equal(analyzeExamples(prompt, estimateTokens).redundant.length, 0);
  });
});

describe('examples survive the rules', () => {
  it('does not deduplicate a shared example output line', () => {
    // Regression: two examples mapping different inputs to the same answer is
    // often the reason both are there. Removing the second output line left
    // that example with an input and no output — worse than the repetition.
    const prompt = [
      'Example 1:',
      'Input: Order 4471 has not arrived and the tracking page is empty.',
      'Output: {"category": "shipping", "escalate": false}',
      '',
      'Example 2:',
      'Input: Order 8892 has not arrived and the tracking page is empty.',
      'Output: {"category": "shipping", "escalate": false}',
    ].join('\n');

    const { optimized } = optimize(prompt);
    assert.equal(optimized.match(/Output: \{"category": "shipping"/g)?.length, 2);
    assert.ok(!optimized.includes('Input: Order 8892 has not arrived and the tracking page is empty.\n\n'));
  });

  it('still removes ordinary repeated lines', () => {
    // Deliberately free of dictionary phrases, so the only thing under test is
    // deduplication rather than a phrase rewrite.
    const line = 'The response must include the order identifier and the delivery window.';
    const { optimized } = optimize(`${line}\nSomething else entirely here.\n${line}`);
    assert.equal(optimized.split(line).length - 1, 1);
  });
});

describe('advisory ordering', () => {
  it('puts warnings above savings', () => {
    // A contradiction carries no dollar figure, so sorting purely on money
    // buried it under every opportunity. Being wrong outranks being cheap.
    const prompt = `Always answer in English.\n\nRespond in the user language.\n\n${'Stable instruction text. '.repeat(60)}`;
    const result = optimize(prompt, {
      usage: {
        model: 'claude-opus-5',
        callsPerMonth: 50_000,
        avgOutputTokens: 300,
        cacheHitRate: 0.9,
        batchEligible: false,
      },
    });

    const ids = result.advisories.map((a) => a.id);
    assert.ok(ids.includes('contradictory-instructions'));
    assert.equal(result.advisories[0].severity, 'warning');
    assert.ok(
      result.advisories.some((a) => a.severity === 'opportunity' && a.estimatedMonthlyUsd > 0),
      'the fixture should also produce a priced opportunity',
    );

    const severities = result.advisories.map((a) => a.severity);
    const rank = { warning: 0, opportunity: 1, info: 2 };
    for (let i = 1; i < severities.length; i++) {
      assert.ok(
        rank[severities[i - 1]] <= rank[severities[i]],
        `severities out of order: ${severities.join(', ')}`,
      );
    }
  });
});
