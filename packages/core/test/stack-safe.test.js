import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { heliconeRecords, langsmithRecords, litellmRecords, segment } from '../dist/index.js';

/**
 * Inputs large enough to overflow the stack, where the input decides the size.
 *
 * `push(...items)` passes every element as its own argument, and past a few
 * hundred thousand of them V8 throws `RangeError: Maximum call stack size
 * exceeded`. A prompt of quote characters within `MAX_INPUT_CHARS` made the web
 * app answer 502, and a usage export of 0.6 MB broke three importers (#937).
 */

describe('an input the size of the limits', () => {
  it('segments 200,000 quotations without overflowing', () => {
    const text = `'"`.repeat(200_000);
    assert.ok(segment(text).length > 0);
  });

  const rows = JSON.stringify(Array.from({ length: 200_000 }, () => 0));
  for (const [name, read] of [
    ['Helicone', heliconeRecords],
    ['LiteLLM', litellmRecords],
    ['LangSmith', langsmithRecords],
  ]) {
    it(`reads a ${name} export of 200,000 rows without overflowing`, () => {
      assert.doesNotThrow(() => read(rows));
    });
  }
});

describe('the core’s sources', () => {
  it('never push a spread array, whose size the input may decide', () => {
    const dir = new URL('../src/', import.meta.url);
    const found = [];
    for (const name of readdirSync(dir, { recursive: true })) {
      if (!String(name).endsWith('.ts')) continue;
      readFileSync(new URL(name, dir), 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (/\.push\(\s*\.\.\./.test(line)) found.push(`${name}:${i + 1}`);
        });
    }
    assert.deepEqual(found, [], 'push each element in a loop instead (#937)');
  });
});
