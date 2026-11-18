import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { join, segment } from '../dist/index.js';

/**
 * The edges of a protected span.
 *
 * Every test here exists because mutation testing changed a line of
 * `segment.ts` and nothing failed (#690). The first run, on 2026-11-17, left
 * 25 of that file's 74 mutants alive. The suite held what a span protects and
 * said almost nothing about where one ends: two spans that touch, a span at
 * the very start or end of the text, a quotation that begins on the character
 * after a code span. Each of those is one comparison in the source, and each
 * comparison could be moved by one without a test noticing.
 *
 * What these do not hold, and why, is in `docs/mutation-testing.md`: the
 * shortcuts that only save time, and the guards against a match of no length,
 * which no pattern in the file can produce.
 */

const shape = (text) =>
  segment(text).map((part) => `${part.kind === 'protected' ? part.protection : 'mutable'}:${part.text}`);

describe('two protected spans that touch are both protected', () => {
  it('keeps a code span that starts where a placeholder ends', () => {
    // The placeholder is found first and reserved. The code span begins on the
    // very next character, which is next to the reservation and not inside it.
    assert.deepEqual(shape('{{name}}`id`'), ['placeholder:{{name}}', 'inline-code:`id`']);
  });

  it('keeps a code span that ends where a placeholder starts', () => {
    assert.deepEqual(shape('`id`{{name}}'), ['inline-code:`id`', 'placeholder:{{name}}']);
  });

  it('keeps a tag wrapped tight around a code span, on both sides', () => {
    assert.deepEqual(shape('<b>`id`</b>'), ['xml-tag:<b>', 'inline-code:`id`', 'xml-tag:</b>']);
  });

  it('keeps an address that follows a placeholder with only a space between', () => {
    assert.deepEqual(shape('{{greeting}} ops@example.com'), [
      'placeholder:{{greeting}}',
      'mutable: ',
      'email:ops@example.com',
    ]);
  });
});

describe('a quotation that starts right after a protected span is still a quotation', () => {
  it('sees the quotation mark that follows a code span', () => {
    // The scan for quotations blanks out what is already reserved. Blanking
    // one character too many takes the opening mark with it, and the string
    // the model is told to say goes back to being editable prose.
    assert.deepEqual(shape('`reply`"Please hold on"'), ['inline-code:`reply`', 'quoted:"Please hold on"']);
  });

  it('sees the quotation mark that follows a placeholder', () => {
    assert.deepEqual(shape("{{agent}}'Please hold on'"), ['placeholder:{{agent}}', "quoted:'Please hold on'"]);
  });
});

describe('a quotation swallows what is inside it, and only that', () => {
  const text = 'Say "Hello {{name}}" first and "Goodbye" last.';

  it('keeps the placeholder inside one quotation when there is a second quotation', () => {
    // Asked whether the placeholder is inside *every* quotation, the answer
    // is no, the placeholder stays reserved next to the quotation that
    // contains it, and the same characters are emitted twice.
    assert.deepEqual(shape(text), [
      'mutable:Say ',
      'quoted:"Hello {{name}}"',
      'mutable: first and ',
      'quoted:"Goodbye"',
      'mutable: last.',
    ]);
  });

  it('gives back exactly the text it was given', () => {
    assert.equal(join(segment(text)), text);
  });

  it('leaves a placeholder outside every quotation protected as a placeholder', () => {
    assert.deepEqual(shape('{{name}} said "Goodbye"'), ['placeholder:{{name}}', 'mutable: said ', 'quoted:"Goodbye"']);
  });
});

describe('a span is not shortened by a word it happens to contain', () => {
  it('protects a code span that is the word undefined', () => {
    // Only the URL and email patterns trim trailing punctuation. Trimming
    // with a pattern that is not there turns into removing the word
    // "undefined", and the span ends nine characters early.
    assert.deepEqual(shape('Return `undefined` here.'), ['mutable:Return ', 'inline-code:`undefined`', 'mutable: here.']);
  });

  it('protects a placeholder and a tag that contain it', () => {
    assert.deepEqual(shape('{{undefined}}'), ['placeholder:{{undefined}}']);
    assert.deepEqual(shape('<undefined>'), ['xml-tag:<undefined>']);
  });
});

describe('no segment is empty', () => {
  // An empty segment says there is text where there is none. `join` hides it;
  // anything that counts segments, or compares two descriptions of the same
  // text, does not.
  const cases = {
    'a span at the very start': '`id` is the key',
    'a span at the very end': 'the key is `id`',
    'a span that is the whole text': '`id`',
    'two spans that touch': '{{name}}`id`',
    'two spans that touch, between prose': 'use {{name}}`id` here',
    'a quotation at the very end': 'Reply "Please hold on"',
  };
  for (const [name, text] of Object.entries(cases)) {
    it(`for ${name}`, () => {
      const parts = segment(text);
      assert.deepEqual(parts.filter((part) => part.text.length === 0), []);
      assert.equal(join(parts), text);
    });
  }

  it('and none at all for an empty text', () => {
    assert.deepEqual(segment(''), []);
  });
});
