import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { optimize, segment, estimateTokens } from '../dist/index.js';

describe('protected content', () => {
  it('leaves fenced code blocks untouched', () => {
    const prompt = [
      'Please analyse this in order to find the bug.',
      '',
      '```python',
      'def   add(a,  b):   # spacing    on purpose',
      '    return a + b',
      '```',
      '',
      'Thank you very much.',
    ].join('\n');

    const { optimized } = optimize(prompt);
    assert.ok(optimized.includes('def   add(a,  b):   # spacing    on purpose'));
    assert.ok(optimized.includes('    return a + b'));
  });

  it('keeps URLs, template placeholders and XML tags intact', () => {
    const prompt =
      'Please read https://example.com/a__b?x=1&y=2 and use {{user_name}} inside <context attr="v  v"> in order to answer.';

    const { optimized } = optimize(prompt);
    assert.ok(optimized.includes('https://example.com/a__b?x=1&y=2'));
    assert.ok(optimized.includes('{{user_name}}'));
    assert.ok(optimized.includes('<context attr="v  v">'));
  });

  it('does not swallow the sentence-final period into the URL', () => {
    const segs = segment('Read https://example.com/guide. Then answer.');
    const url = segs.find((s) => s.protection === 'url');
    assert.equal(url.text, 'https://example.com/guide');

    // And the period is still there exactly once in the output.
    const { optimized } = optimize('Please read https://example.com/guide. Thanks.');
    assert.ok(optimized.includes('https://example.com/guide.'));
    assert.ok(!optimized.includes('..'));
  });

  it('keeps punctuation that genuinely belongs to the URL', () => {
    const segs = segment('See https://example.com/a.b.c/path?x=1 now');
    const url = segs.find((s) => s.protection === 'url');
    assert.equal(url.text, 'https://example.com/a.b.c/path?x=1');
  });

  it('labels every kind of protected content', () => {
    const segs = segment('text `code` https://a.b {{x}} <tag> end');
    const kinds = segs.filter((s) => s.kind === 'protected').map((s) => s.protection);
    assert.ok(kinds.includes('inline-code'));
    assert.ok(kinds.includes('url'));
    assert.ok(kinds.includes('placeholder'));
    assert.ok(kinds.includes('xml-tag'));
  });
});

describe('deterministic rules', () => {
  it('is reproducible: the same input yields the same output', () => {
    const prompt = 'Please, in order to help me, basically summarise this. Thanks.';
    const a = optimize(prompt);
    const b = optimize(prompt);
    assert.equal(a.optimized, b.optimized);
    assert.equal(a.tokensAfter, b.tokensAfter);
  });

  it('never increases the token count', () => {
    const prompts = [
      'Hello',
      '',
      'Analyse    this    text.\n\n\n\nThen summarise it.',
      'Please kindly analyze in order to help me. Thank you!',
      '```\ncode\n```',
      'a'.repeat(500),
    ];
    for (const prompt of prompts) {
      const result = optimize(prompt, { level: 'aggressive' });
      assert.ok(
        result.tokensAfter <= result.tokensBefore,
        `"${prompt.slice(0, 30)}" went from ${result.tokensBefore} to ${result.tokensAfter}`,
      );
    }
  });

  it('drops courtesy and compresses verbose phrases', () => {
    const result = optimize('Please, in order to help me, summarise the text. Thank you.');
    assert.ok(!/please/i.test(result.optimized));
    assert.ok(!/in order to/i.test(result.optimized));
    assert.ok(/\bto\b/i.test(result.optimized));
    assert.ok(result.tokensSaved > 0);
    assert.ok(result.rules.some((r) => r.id === 'politeness'));
    assert.ok(result.rules.some((r) => r.id === 'verbose-phrases'));
  });

  it('removes repeated paragraphs', () => {
    const block = 'Always answer in English and keep a formal tone with the end user.';
    const result = optimize(`${block}\n\nA different instruction here.\n\n${block}`);
    assert.equal(result.optimized.split(block).length - 1, 1);
    assert.ok(result.rules.some((r) => r.id === 'duplicate-blocks'));
  });

  it('the aggressive level enables rules the safe level leaves alone', () => {
    const prompt = 'This is VERY important. You MUST verify your answer before responding.';
    const safe = optimize(prompt, { level: 'safe' });
    const aggressive = optimize(prompt, { level: 'aggressive' });
    assert.ok(aggressive.tokensAfter <= safe.tokensAfter);
    assert.ok(aggressive.rules.some((r) => r.level === 'aggressive'));
    assert.ok(!safe.rules.some((r) => r.level === 'aggressive'));
  });

  it('honours disabled rules', () => {
    const prompt = 'Please summarise this.';
    const result = optimize(prompt, { disableRules: ['politeness'] });
    assert.ok(/please/i.test(result.optimized));
    assert.ok(!result.rules.some((r) => r.id === 'politeness'));
  });

  it('takes the commas that delimited the removed aside with it', () => {
    const { optimized } = optimize('Read the query and, if you don\'t mind, classify it.');
    assert.equal(optimized, 'Read the query and classify it.');
  });

  it('leaves no orphaned punctuation when a whole sentence is removed', () => {
    const { optimized } = optimize('Summarise the text. Thank you very much!');
    assert.equal(optimized, 'Summarise the text.');
  });

  it('recapitalises when the removal leaves a sentence starting lowercase', () => {
    const { optimized } = optimize('Please summarise the text.');
    assert.equal(optimized, 'Summarise the text.');
  });

  it('leaves no stray spaces or blank lines at the start of a line', () => {
    const { optimized } = optimize(
      'Instruction one.\n\nBasically do this.\n\nInstruction three.',
    );
    for (const line of optimized.split('\n')) {
      assert.ok(!/^ \S/.test(line), `line with leftover space: ${JSON.stringify(line)}`);
    }
    assert.ok(!/\n{3,}/.test(optimized));
  });

  it('preserves the indentation of nested markdown lists', () => {
    const prompt = 'Steps:\n\n- one\n  - one point one\n    - deeper still';
    const { optimized } = optimize(prompt);
    assert.ok(optimized.includes('  - one point one'));
    assert.ok(optimized.includes('    - deeper still'));
  });

  it('does not break a word that contains a phrase as a substring', () => {
    // "very" is a dictionary entry; it must not be cut out of "delivery".
    const result = optimize('Check the delivery and the everyday flow in order to finish.', {
      level: 'aggressive',
    });
    assert.ok(result.optimized.includes('delivery'));
    assert.ok(result.optimized.includes('everyday'));
  });
});

describe('Spanish prompts', () => {
  // The phrase dictionaries are data, not interface: a Spanish prompt has to
  // be optimised just as well as an English one, and the report it produces is
  // still in the requested locale.
  it('applies the Spanish dictionary entries', () => {
    const result = optimize('Por favor, con el fin de ayudarme, resume el texto. Gracias.');
    assert.ok(!/por favor/i.test(result.optimized));
    assert.ok(!/con el fin de/i.test(result.optimized));
    assert.ok(/para/i.test(result.optimized));
    assert.ok(result.tokensSaved > 0);
  });

  it('cleans up Spanish punctuation left behind by a removal', () => {
    assert.equal(optimize('Resume el texto. ¡¡¡Muchas gracias!!!').optimized, 'Resume el texto.');
    assert.equal(
      optimize('Analiza la consulta y, si no te importa, clasifícala.').optimized,
      'Analiza la consulta y clasifícala.',
    );
  });

  it('does not cut a dictionary phrase out of the middle of a word', () => {
    const result = optimize('Analiza el ándel y la muyosa con el fin de terminar.');
    assert.ok(result.optimized.includes('ándel'));
    assert.ok(result.optimized.includes('muyosa'));
  });
});

describe('heuristic tokenizer', () => {
  it('returns 0 for empty text', () => {
    assert.equal(estimateTokens(''), 0);
  });

  it('grows with the length of the text', () => {
    const short = estimateTokens('Hello world');
    const long = estimateTokens('Hello world '.repeat(50));
    assert.ok(long > short * 20);
  });

  it('never returns negative values or NaN', () => {
    for (const text of ['🚀🚀', '日本語のテキスト', '!!!???', '   ', '\n\n\n', 'a1b2c3']) {
      const tokens = estimateTokens(text);
      assert.ok(Number.isFinite(tokens) && tokens >= 0, `fails on ${JSON.stringify(text)}`);
    }
  });
});
