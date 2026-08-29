import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  analyzeExamples,
  estimateTokens,
  findContradictions,
  findExamples,
  findRestatedFormat,
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

describe('the example detector reads the labels prompts actually use', () => {
  /**
   * **Nine of these fourteen found nothing, and the suite was green.**
   *
   * `findExamples` feeds six analyses — `prune`, `profile`, `review`, the
   * redundant-example advisory, the CLI's example view, and the rule that
   * protects example lines from deduplication. All six read the same splitter,
   * and its opener vocabulary was `example`, `input`, `user`, `usuario`, `q`.
   * A support prompt labelled `Customer:` / `Agent:` — the commonest shape
   * there is — split into nothing, so `prune` had no examples to evaluate and
   * `profile` reported that the examples cost zero tokens. On the prompt this
   * was found with, they were **38% of it**.
   *
   * The failure was silent by construction: no label, no blocks, no finding.
   * Nothing distinguishes that from a prompt with no examples in it, which is
   * why it survived and why nothing here caught it.
   *
   * **Written as prompts rather than as a list of labels**, deliberately. A
   * fixture that enumerated the same strings the module declares would be two
   * copies of one list agreeing with each other; these are the shapes the
   * detector has to work on, and they fail if the vocabulary narrows again for
   * any reason — including a refactor that keeps the list and breaks the regex
   * it is built into.
   */
  const LABELLINGS = [
    ['User', 'Assistant'],
    ['Customer', 'Agent'],
    ['Human', 'Assistant'],
    ['Q', 'A'],
    ['Question', 'Answer'],
    ['Input', 'Output'],
    ['Client', 'Support'],
    ['Prompt', 'Response'],
    ['Query', 'Reply'],
    ['Usuario', 'Asistente'],
    ['Cliente', 'Agente'],
    ['Pregunta', 'Respuesta'],
    ['REQUEST', 'RESPONSE'],
    ['Example', 'Result'],
  ];

  /** One three-example prompt, wearing whichever labels it is handed. */
  const promptWith = (asker, answerer) =>
    [
      'Answer the customer from the account record.',
      '',
      ...[1, 2, 3].flatMap((n) => [
        `${asker}: sample question number ${n} about the account`,
        `${answerer}: sample answer number ${n} explaining the account`,
        '',
      ]),
    ].join('\n');

  it('finds the examples under every labelling a real prompt uses', () => {
    const blind = LABELLINGS.filter(
      ([asker, answerer]) => findExamples(promptWith(asker, answerer), estimateTokens).length < 2,
    ).map(([asker, answerer]) => `${asker}:/${answerer}:`);

    assert.deepEqual(
      blind,
      [],
      `the detector is blind to ${blind.length} of ${LABELLINGS.length} labellings: ${blind.join(', ')}`,
    );
  });

  it('and splits between examples, not between a question and its answer', () => {
    /*
      The reason answerer labels are not tiers. Splitting on `Answer:` as well
      would cut each example in half and then compare the halves, which is both
      wrong and worse than finding nothing: the halves are dissimilar, so the
      redundancy advisory would go quiet on genuinely duplicated examples.
    */
    for (const [asker, answerer] of LABELLINGS) {
      const blocks = findExamples(promptWith(asker, answerer), estimateTokens);
      assert.equal(blocks.length, 3, `${asker}: split into ${blocks.length} blocks`);
      for (const block of blocks) {
        assert.match(
          block.text,
          new RegExp(`${answerer}:`, 'i'),
          `${asker}: an example was cut away from its answer`,
        );
      }
    }
  });

  it('reports what the examples cost, which was previously nothing', () => {
    // The arithmetic is the finding. Not a verdict about whether any example
    // should go — that is the human's, and `prune` measures it with cases.
    const prompt = promptWith('Customer', 'Agent');
    const blocks = findExamples(prompt, estimateTokens);
    const inExamples = blocks.reduce((sum, block) => sum + block.tokens, 0);
    assert.ok(inExamples > 0, 'the examples were found and still cost nothing');
    assert.ok(
      inExamples / estimateTokens(prompt) > 0.5,
      'a prompt that is mostly examples reported otherwise',
    );
  });

  it('does not split ordinary prose that happens to use those words', () => {
    /*
      The cost of widening, checked rather than assumed. `Prompt:`, `Request:`
      and `A:` are ordinary English, and a splitter that fired on them would
      invent examples in a prompt that has none — and every analysis downstream
      would then be reasoning about blocks nobody wrote.
    */
    const prose = [
      'Write a summary of the incident.',
      '',
      'A good summary states what broke, when, and who it affected.',
      'A bad summary lists timestamps with no narrative.',
      '',
      'Query the database only when the answer is not in the ticket.',
      'Request approval before contacting the customer directly.',
    ].join('\n');

    assert.deepEqual(
      findExamples(prose, estimateTokens),
      [],
      'the detector invented examples in a prompt that has none',
    );
  });

  it('leaves a labelled answer line alone when the rules deduplicate', () => {
    /*
      `duplicate-lines` skips lines matching the field pattern, because two
      examples sharing an answer are demonstrating that two inputs map to the
      same output — removing the second leaves an example with no answer. That
      pattern is now built from the same two lists the splitter uses, so a
      labelling the splitter learned is a labelling the rule protects, and the
      pair cannot drift apart again the way `Q:` and `Question:` did.
    */
    const prompt = [
      'Classify each message.',
      '',
      'Customer: my order has not arrived and the tracking page is empty',
      'Agent: this is a shipping problem and I will escalate it now',
      '',
      'Customer: the parcel is late and the tracking link shows nothing at all',
      'Agent: this is a shipping problem and I will escalate it now',
    ].join('\n');

    const result = optimize(prompt);
    assert.equal(
      (result.optimized.match(/Agent: this is a shipping problem/g) ?? []).length,
      2,
      'an example lost the answer it exists to demonstrate',
    );
  });
});

describe('examples delimited by a tag, which is what Anthropic documents', () => {
  /**
   * A prompt wrapping its demonstrations in `<example>` found **zero** of them,
   * and this product's headline model is Claude. The convention is in the
   * provider's own prompting documentation, so it is not an edge case: it is
   * the shape a reader is told to use. On the code-review prompt this was found
   * with, the examples are **68% of the prompt** and every analysis downstream
   * was reasoning as though they cost nothing.
   */
  const TAGGED = [
    'You are a code reviewer. Review the diff and report defects.',
    '',
    '<example>',
    '<input>def add(a, b): return a - b</input>',
    '<output>Bug: add subtracts. Should be a + b.</output>',
    '</example>',
    '',
    '<example>',
    '<input>def mul(a, b): return a + b</input>',
    '<output>Bug: mul adds. Should be a * b.</output>',
    '</example>',
    '',
    '<example>',
    '<input>def div(a, b): return a * b</input>',
    '<output>Bug: div multiplies. Should be a / b.</output>',
    '</example>',
    '',
    'Report only real defects. Do not report style.',
  ].join('\n');

  it('finds each tagged example, and only what the tag contains', () => {
    const blocks = findExamples(TAGGED, estimateTokens);
    assert.equal(blocks.length, 3);
    // The instruction above and the instruction below are not inside any tag,
    // so no block may carry them. A splitter that ran to the next delimiter
    // would swallow the closing sentence into the last example and inflate it.
    for (const block of blocks) {
      assert.doesNotMatch(block.text, /code reviewer/, 'an example absorbed the opening instruction');
      assert.doesNotMatch(block.text, /Report only real defects/, 'an example absorbed the closing instruction');
    }
  });

  it('and they are most of what that prompt costs, which was reported as nothing', () => {
    const blocks = findExamples(TAGGED, estimateTokens);
    const inExamples = blocks.reduce((sum, block) => sum + block.tokens, 0);
    assert.ok(
      inExamples / estimateTokens(TAGGED) > 0.5,
      'a prompt that is mostly tagged examples reported otherwise',
    );
  });

  it('prefers the tag over any label nested inside it', () => {
    /*
      `<input>`/`<output>` inside each example would also match the label tiers.
      Whichever wins must be the outer one, or every example is cut in half and
      the halves are compared against each other.
    */
    assert.equal(findExamples(TAGGED, estimateTokens).length, 3);
  });

  it('ignores a tag that is being documented rather than used', () => {
    /*
      A prompt that teaches somebody how to write examples contains the tag and
      no examples. Fenced regions are removed before matching, so the sample in
      the fence is prose about a tag rather than a use of one.
    */
    const teaching = [
      'When you add a few-shot example, wrap it like this:',
      '',
      '```',
      '<example>',
      'input here',
      '</example>',
      '',
      '<example>',
      'another input',
      '</example>',
      '```',
      '',
      'Keep them short.',
    ].join('\n');

    assert.deepEqual(
      findExamples(teaching, estimateTokens),
      [],
      'the detector read documentation about a tag as a use of it',
    );
  });

  it('needs two before it calls anything a set of examples', () => {
    // One example is not a set, and the redundancy question needs a pair. A
    // single tag falls through to the label tiers rather than being reported.
    const one = ['Do the task.', '', '<example>', 'input: a', 'output: b', '</example>'].join('\n');
    assert.deepEqual(findExamples(one, estimateTokens), []);
  });
});

describe('output formats stated twice', () => {
  const SCHEMA = [
    '```json',
    '{',
    '  "category": "payment | shipping | refund",',
    '  "reply": "text for the customer",',
    '  "escalate": false',
    '}',
    '```',
  ].join('\n');

  it('flags prose that walks the schema it already shows', () => {
    const prompt = [
      'Classify the support ticket.',
      '',
      'Return JSON with a category field holding the ticket type, a reply field',
      'with the text for the customer, and an escalate field set to true when a',
      'human is needed.',
      '',
      SCHEMA,
    ].join('\n');

    const found = findRestatedFormat(prompt, estimateTokens);
    assert.ok(found);
    assert.deepEqual(found.keys.sort(), ['category', 'escalate', 'reply']);
    assert.equal(found.restatedKeys.length, 3);
    assert.ok(found.restatedTokens > 0);
  });

  it('ignores prose that mentions one field in passing', () => {
    // "set escalate to true when..." is ordinary clarification, not a
    // restatement. Flagging it would make the advisory noise.
    const prompt = [
      'Classify the support ticket.',
      '',
      SCHEMA,
      '',
      'Set escalate to true only when the customer explicitly asks for a human.',
    ].join('\n');
    assert.equal(findRestatedFormat(prompt, estimateTokens), null);
  });

  it('does not count the schema naming its own keys', () => {
    assert.equal(findRestatedFormat(`Classify the ticket.\n\n${SCHEMA}`, estimateTokens), null);
  });

  it('needs a schema with enough fields to be worth reporting', () => {
    const twoFields = [
      'Return a category field and a reply field.',
      '',
      '```json',
      '{ "category": "x", "reply": "y" }',
      '```',
    ].join('\n');
    assert.equal(findRestatedFormat(twoFields, estimateTokens), null);
  });

  it('reads only top-level keys, not nested ones', () => {
    const nested = [
      '```json',
      '{ "result": { "category": "x", "reply": "y", "escalate": false } }',
      '```',
      '',
      'Describe the category, the reply and whether to escalate.',
    ].join('\n');
    // Only `result` is top level, so there is nothing to restate.
    assert.equal(findRestatedFormat(nested, estimateTokens), null);
  });

  it('tolerates a schema that is illustrative rather than valid JSON', () => {
    // Prompts routinely show trailing commas, ellipses and placeholders.
    // Refusing to read those would skip the prompts most worth checking.
    const loose = [
      '```json',
      '{',
      '  "category": <one of: payment, shipping, refund>,',
      '  "reply": "...",',
      '  "escalate": true|false,',
      '  ...',
      '}',
      '```',
      '',
      'Fill category with the ticket type, reply with the customer text, and',
      'escalate when a human is needed.',
    ].join('\n');

    const found = findRestatedFormat(loose, estimateTokens);
    assert.ok(found, 'an illustrative schema should still be read');
    assert.equal(found.restatedKeys.length, 3);
  });

  it('surfaces as a priced advisory', () => {
    const prompt = [
      'Classify the ticket.',
      'Return a category field, a reply field and an escalate field.',
      '',
      SCHEMA,
    ].join('\n');
    const result = optimize(prompt, {
      usage: {
        model: 'claude-opus-5',
        callsPerMonth: 50_000,
        avgOutputTokens: 300,
        cacheHitRate: 0.9,
        batchEligible: false,
      },
    });
    const advisory = result.advisories.find((a) => a.id === 'restated-output-format');
    assert.ok(advisory);
    assert.equal(advisory.severity, 'opportunity');
    assert.ok(advisory.estimatedMonthlyUsd > 0);
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
