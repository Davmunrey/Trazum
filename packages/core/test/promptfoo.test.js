import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { toPromptfoo } from '../dist/index.js';

/**
 * Exporting a before/after pair for somebody else's harness.
 *
 * The thing these tests mostly guard is a boundary rather than a behaviour:
 * Trazum builds the suite and does **not** write the assertions. It knows
 * whether the prompt still says the same thing; it does not know whether your
 * classifier still hits 94%, and a tool that guessed at that would be a tool
 * with opinions about somebody else's product.
 */

const CASES = ['My card was declined.', 'The app crashes.'];

const TEMPLATED = `You are a classifier.

Classify {{query}} into one of the categories.`;

describe('the suite it builds', () => {
  it('carries both prompts, labelled so the diff is obvious', () => {
    const { config } = toPromptfoo(TEMPLATED, 'Classify {{query}}.', CASES, { level: 'safe' });

    assert.equal(config.prompts.length, 2);
    assert.equal(config.prompts[0].label, 'before');
    assert.match(config.prompts[1].label, /after.*trazum.*safe/);
    assert.equal(config.prompts[0].raw, TEMPLATED);
  });

  it('turns each case into a var bound to the prompt placeholder', () => {
    const { config } = toPromptfoo(TEMPLATED, 'Classify {{query}}.', CASES);

    assert.deepEqual(config.tests, [
      { vars: { query: 'My card was declined.' } },
      { vars: { query: 'The app crashes.' } },
    ]);
  });

  it('maps the model to a promptfoo provider', () => {
    const anthropic = toPromptfoo(TEMPLATED, 'x {{query}}', CASES, { model: 'claude-opus-5' });
    assert.deepEqual(anthropic.config.providers, ['anthropic:messages:claude-opus-5']);
    assert.deepEqual(anthropic.warnings, []);

    const openai = toPromptfoo(TEMPLATED, 'x {{query}}', CASES, { model: 'gpt-5' });
    assert.deepEqual(openai.config.providers, ['openai:gpt-5']);
  });

  it('warns rather than guessing when the vendor has no known id', () => {
    // A wrong provider id fails at run time with a message about promptfoo,
    // which sends the reader to the wrong project.
    const { warnings } = toPromptfoo(TEMPLATED, 'x {{query}}', CASES, { model: 'kimi-k2' });
    assert.equal(warnings[0]?.kind, 'unmapped-provider');
    assert.match(warnings[0].detail, /is a guess/);
  });

  it('is valid JSON whatever the prompt contains', () => {
    // The reason this emits JSON rather than hand-rolled YAML: a prompt with a
    // colon, a tab, a quote and a line ending in a space is a quoting bug in
    // any emitter this dependency-free package could ship.
    const nasty = 'Rules:\n\t- Say "hello": politely.   \nUse {{query}}.\n\n```\nnot json\n```';
    const { config } = toPromptfoo(nasty, `${nasty} shorter`, ['a: b', '"quoted"', 'tab\there']);

    const round = JSON.parse(JSON.stringify(config));
    assert.equal(round.prompts[0].raw, nasty);
    assert.equal(round.tests[0].vars.query, 'a: b');
  });
});

describe('what it will and will not assert', () => {
  it('seeds is-json when the prompt shows a JSON block', () => {
    // Not an opinion about the task: the prompt already demands this.
    const prompt = 'Return {{query}} as:\n\n```json\n{"category": "billing"}\n```\n';
    const { config } = toPromptfoo(prompt, prompt, CASES);
    assert.deepEqual(config.defaultTest, { assert: [{ type: 'is-json' }] });
  });

  it('recognises an untagged block that parses as JSON', () => {
    const prompt = 'Return {{query}} as:\n\n```\n{"category": "billing"}\n```\n';
    const { config } = toPromptfoo(prompt, prompt, CASES);
    assert.deepEqual(config.defaultTest, { assert: [{ type: 'is-json' }] });
  });

  it('does not read "return JSON" in prose as a demand', () => {
    // A phrase is where guessing starts. The block is checkable; the sentence
    // could be "do not return JSON".
    const prompt = 'Classify {{query}}. Do not return JSON.';
    const { config } = toPromptfoo(prompt, prompt, CASES);
    assert.equal(config.defaultTest, undefined);
  });

  it('leaves an untagged Python block alone', () => {
    const prompt = 'Use this on {{query}}:\n\n```\ndef f(x):\n    return x\n```\n';
    const { config } = toPromptfoo(prompt, prompt, CASES);
    assert.equal(config.defaultTest, undefined);
  });

  it('writes no assertion about accuracy, quality or agreement', () => {
    // The boundary. `trazum eval` measures agreement; this suite exists for the
    // question it cannot ask, and filling it in would answer the wrong one
    // twice.
    const prompt = 'Classify {{query}} accurately and be helpful.';
    const { config } = toPromptfoo(prompt, 'Classify {{query}}.', CASES);
    const serialized = JSON.stringify(config.defaultTest ?? {}) + JSON.stringify(config.tests);

    for (const forbidden of ['similar', 'llm-rubric', 'factuality', 'answer-relevance']) {
      assert.equal(
        serialized.includes(forbidden),
        false,
        `the export invented a "${forbidden}" assertion about somebody else's task`,
      );
    }
  });
});

describe('placeholders it cannot drive', () => {
  it('appends the case when there is no placeholder, as eval does', () => {
    const plain = 'You are a classifier. Answer with one word.';
    const { config, warnings } = toPromptfoo(plain, plain, CASES);

    assert.match(config.prompts[0].raw, /\{\{input\}\}$/);
    assert.deepEqual(config.tests[0], { vars: { input: 'My card was declined.' } });
    assert.equal(warnings[0]?.kind, 'appended-input');
  });

  it('warns that promptfoo will not substitute ${x}', () => {
    // Silently emitting this produces a suite where every case runs against the
    // literal template and the numbers look fine.
    const prompt = 'Classify ${query} into a category.';
    const { warnings } = toPromptfoo(prompt, prompt, CASES);

    const warning = warnings.find((w) => w.kind === 'unsupported-placeholder');
    assert.ok(warning, `no warning for \${query}: ${JSON.stringify(warnings)}`);
    assert.match(warning.detail, /leave untouched|leave it untouched/);
  });

  it('says which placeholder the cases fill when there are several', () => {
    const prompt = 'In {{locale}}, classify {{query}} for {{tenant}}.';
    const { warnings } = toPromptfoo(prompt, prompt, CASES);

    const warning = warnings.find((w) => w.kind === 'multiple-placeholders');
    assert.ok(warning);
    assert.match(warning.detail, /3 placeholders/);
    assert.match(warning.detail, /defaultTest\.vars/);
  });

  it('binds to the first placeholder, matching what eval substitutes', () => {
    // The two commands have to be testing the same prompt, or a green suite and
    // a red eval are about different things.
    const prompt = 'In {{locale}}, classify {{query}}.';
    const { config } = toPromptfoo(prompt, prompt, CASES);
    assert.deepEqual(config.tests[0], { vars: { locale: 'My card was declined.' } });
  });
});
