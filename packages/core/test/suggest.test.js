import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { applyRewrites, rejectionText, suggestRewrites } from '../dist/index.js';

/**
 * `suggestRewrites` asks a model for `before → after` pairs instead of a whole
 * rewritten prompt.
 *
 * Almost every test here is about **not trusting the answer**. The model is a
 * source of proposals; the prompt is the source of truth, and a proposal that
 * disagrees with it is dropped rather than reconciled. A wholesale rewrite that
 * fails one check leaves the author with nothing, and this is the design that
 * degrades instead: eight surviving suggestions out of ten is a useful result.
 */

/** A provider that answers with exactly what the test hands it. */
function provider(reply) {
  return {
    name: 'fake',
    model: 'fake-1',
    async complete() {
      return typeof reply === 'string' ? reply : JSON.stringify(reply);
    },
  };
}

const PROMPT = `You should always make sure to answer in English.

It is important to note that the catalogue is at https://api.example.com/v1/items.

Use this exactly:

\`\`\`python
def classify(text):
    return model.predict(text)
\`\`\`

Please analyse {{query}} and be brief.`;

describe('it proposes phrases, not a new prompt', () => {
  it('keeps a rewrite that quotes the prompt exactly', async () => {
    const result = await suggestRewrites(
      PROMPT,
      provider([{ before: 'You should always make sure to', after: 'Always' }]),
    );

    assert.equal(result.suggestions.length, 1);
    assert.equal(result.suggestions[0].after, 'Always');
    assert.ok(result.suggestions[0].tokensSaved > 0);
    assert.deepEqual(result.suggestions[0].offsets, [0]);
  });

  it('accepts a deletion, which is what an empty replacement means', async () => {
    const result = await suggestRewrites(
      PROMPT,
      provider([{ before: 'It is important to note that ', after: '' }]),
    );
    assert.equal(result.suggestions.length, 1);
    assert.equal(result.suggestions[0].after, '');
  });

  it('orders by what each one saves', async () => {
    const result = await suggestRewrites(
      PROMPT,
      provider([
        { before: 'and be brief', after: 'briefly' },
        { before: 'You should always make sure to', after: 'Always' },
      ]),
    );
    assert.equal(result.suggestions[0].before, 'You should always make sure to');
  });
});

describe('it refuses what the prompt does not support', () => {
  it('drops a phrase the model paraphrased instead of copying', async () => {
    // The failure that matters most. A model asked to quote will sometimes
    // tidy the punctuation as it goes, and the resulting suggestion is about
    // text that does not exist.
    const result = await suggestRewrites(
      PROMPT,
      provider([{ before: 'You should always make sure that you', after: 'Always' }]),
    );

    assert.equal(result.suggestions.length, 0);
    assert.equal(result.rejected[0].reason, 'not-found');
  });

  it('refuses to edit inside a code block', async () => {
    const result = await suggestRewrites(
      PROMPT,
      provider([{ before: 'return model.predict(text)', after: 'return model(text)' }]),
    );

    assert.equal(result.suggestions.length, 0);
    assert.equal(result.rejected[0].reason, 'touches-protected');
  });

  it('refuses to edit a URL', async () => {
    const result = await suggestRewrites(
      PROMPT,
      provider([{ before: 'https://api.example.com/v1/items', after: '/v1/items' }]),
    );
    assert.equal(result.rejected[0].reason, 'touches-protected');
  });

  it('refuses a replacement that brings a placeholder in with it', async () => {
    const result = await suggestRewrites(
      PROMPT,
      provider([{ before: 'and be brief', after: 'for {{user}}' }]),
    );
    assert.equal(result.rejected[0].reason, 'introduces-protected');
  });

  it('drops a rewrite that saves nothing', async () => {
    // This is a token tool, not a style guide.
    const result = await suggestRewrites(
      PROMPT,
      provider([{ before: 'and be brief', after: 'and stay brief' }]),
    );
    assert.equal(result.rejected[0].reason, 'no-saving');
  });

  it('drops the second of two suggestions that share text', async () => {
    // Applying both produces text neither of them described.
    const result = await suggestRewrites(
      PROMPT,
      provider([
        { before: 'You should always make sure to', after: 'Always' },
        { before: 'always make sure to answer', after: 'answer' },
      ]),
    );

    assert.equal(result.suggestions.length, 1);
    assert.equal(result.rejected.at(-1).reason, 'overlaps');
  });

  it('survives a provider that returns something that is not JSON', async () => {
    // The deterministic rules have already run. An optional pass returning
    // nonsense must cost the caller nothing.
    const result = await suggestRewrites(PROMPT, provider('Sure! Here are some ideas:'));
    assert.deepEqual(result.suggestions, []);
    assert.deepEqual(result.rejected, []);
  });

  it('unwraps a fenced answer, since models add fences anyway', async () => {
    const reply =
      '```json\n[{"before": "You should always make sure to", "after": "Always"}]\n```';
    const result = await suggestRewrites(PROMPT, provider(reply));
    assert.equal(result.suggestions.length, 1);
  });

  it('ignores entries that are not two strings', async () => {
    const result = await suggestRewrites(
      PROMPT,
      provider([{ before: 42, after: 'x' }, null, 'nope', { after: 'only' }]),
    );
    assert.deepEqual(result.suggestions, []);
  });
});

describe('a phrase that occurs more than once', () => {
  const REPEATED =
    'Please note that A.\n\nPlease note that B.\n\n`Please note that C.`\n\nPlease note that D.';

  it('rewrites every occurrence outside protected content', async () => {
    // Refusing the whole suggestion because one occurrence sits in a code span
    // would be the easier answer and the wrong one.
    const result = await suggestRewrites(
      REPEATED,
      provider([{ before: 'Please note that ', after: '' }]),
    );

    assert.equal(result.suggestions.length, 1);
    assert.equal(result.suggestions[0].offsets.length, 3, 'the inline-code occurrence was included');

    const applied = applyRewrites(REPEATED, result.suggestions);
    assert.match(applied, /`Please note that C\.`/, 'the code span was edited');
    assert.equal(applied.includes('Please note that A'), false);
  });
});

describe('applying them', () => {
  it('edits right to left, so earlier edits cannot move later offsets', async () => {
    // The bug every naive version of this has. It only shows up when two edits
    // are far enough apart that a short fixture would not notice, so the
    // fixture is long on purpose.
    const filler = '\n\nSome unrelated instruction that is here to take up room.'.repeat(20);
    const prompt = `You should always make sure to be brief.${filler}\n\nIt is important to note that you must answer in English.`;

    const result = await suggestRewrites(
      prompt,
      provider([
        { before: 'You should always make sure to', after: 'Always' },
        { before: 'It is important to note that you must', after: 'You must' },
      ]),
    );
    assert.equal(result.suggestions.length, 2);

    const applied = applyRewrites(prompt, result.suggestions);
    assert.match(applied, /^Always be brief\./);
    assert.match(applied, /You must answer in English\.$/);
    assert.equal(applied.includes('It is important to note'), false);
  });

  it('returns the prompt untouched when nothing is applied', () => {
    assert.equal(applyRewrites(PROMPT, []), PROMPT);
  });
});

describe('rejections are explained in the reader language', () => {
  it('names the reason in English and Spanish', () => {
    assert.match(rejectionText('not-found', 'en'), /not in the prompt/);
    assert.match(rejectionText('not-found', 'es'), /no está en el prompt/);
    assert.match(rejectionText('touches-protected', 'en'), /verbatim/);
    assert.match(rejectionText('touches-protected', 'es'), /literalmente/);
  });
});
