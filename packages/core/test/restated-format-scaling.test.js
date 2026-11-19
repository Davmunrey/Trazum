import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MAX_INPUT_CHARS, estimateTokens, findRestatedFormat } from '../dist/index.js';
import { foldKeyChar, keyPattern, keysInSentences } from '../dist/structure.js';

/**
 * Finding a schema's keys in the prose grows with the text, not its square.
 *
 * It grew with the square. `findRestatedFormat` asked one pattern per key of
 * every sentence, and built the pattern again for each: a prompt of 40,000
 * characters, half a schema of 1,778 keys and half prose, made `optimize`
 * take 6.8 seconds, and one of 80,000 characters took 38, measured on
 * 2026-11-18 (#772). The scanner that
 * pointed at the line called it a regular expression denial of service; the
 * pattern was linear, and the loop around it was not.
 *
 * Held here the way `segment-scaling.test.js` holds the segmenter: the new
 * search is compared, answer for answer and in the same order, with the loop
 * it replaced; the fold it compares with is compared with the engine's own
 * case-insensitive matching; and where a clock is read, it compares a text
 * with one four times its length on the same machine in the same second.
 */

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The loop as it stood before #772. */
function byLooking(keys, sentences) {
  const restatedKeys = new Set();
  const guiltySentences = new Set();
  sentences.forEach((sentence, index) => {
    for (const key of keys) {
      const pattern = new RegExp(`(?<![\\p{L}\\p{N}_-])${escapeRegExp(key)}(?![\\p{L}\\p{N}_-])`, 'iu');
      if (pattern.test(sentence)) {
        restatedKeys.add(key);
        guiltySentences.add(index);
      }
    }
  });
  return { restatedKeys, guiltySentences };
}

/** A small generator with a fixed seed: the same cases on every run. */
function sequence(seed) {
  let state = seed;
  return (below) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state % below;
  };
}

describe('the search finds what the loop found, in the order it found it', () => {
  it('on texts drawn from a small alphabet of letters, cases, boundaries and odd code points', () => {
    const next = sequence(772);
    const pick = (list) => list[next(list.length)];
    // Small, so that keys and sentences collide often. Each line is a reason:
    // plain letters and their capitals; the kelvin sign and the long s, which
    // fold into k and s; the three sigmas; the iota and the combining mark that
    // folds to it; two pairs the engine joins and casing does not; a letter
    // outside the first plane in both cases; a lone surrogate; the boundary's
    // own characters and some that are not.
    const alphabet = [
      'a', 'A', 'b', 'k', 'K', 's', 'S',
      'K', 'ſ',
      'σ', 'Σ', 'ς',
      'ι', 'ͅ',
      'ΐ', 'ΐ', 'ﬅ', 'ﬆ',
      '\u{10400}', '\u{10428}',
      '\uD800',
      '-', '_', '1', '.', ' ', '$', ':', 'é', 'İ', 'i', 'ı',
    ];
    const word = (max) => Array.from({ length: 1 + next(max) }, () => pick(alphabet)).join('');
    let found = 0;
    for (let round = 0; round < 3000; round += 1) {
      const keys = [...new Set(Array.from({ length: 1 + next(8) }, () => word(6)))].filter((key) => key.length >= 3);
      const sentences = Array.from({ length: 1 + next(4) }, () =>
        Array.from({ length: 1 + next(6) }, () => (next(3) === 0 && keys.length > 0 ? pick(keys) : word(5))).join(pick([' ', '', '-', '.', 'x', ', '])),
      );
      const want = byLooking(keys, sentences);
      const got = keysInSentences(keys, sentences);
      found += want.restatedKeys.size;
      assert.deepEqual([...got.restatedKeys], [...want.restatedKeys], `keys ${JSON.stringify(keys)} in ${JSON.stringify(sentences)}`);
      assert.deepEqual([...got.guiltySentences], [...want.guiltySentences], `sentences of ${JSON.stringify(keys)} in ${JSON.stringify(sentences)}`);
    }
    // A comparison in which nothing was ever found would agree with anything.
    assert.ok(found > 2000, `only ${found} keys were found in 3,000 cases`);
  });

  it('confirms every place with the key\'s own pattern, so a fold that joins too much finds nothing more', () => {
    // The kelvin sign is k to the engine; a key of three of them is "kkk".
    assert.deepEqual([...keysInSentences(['KKK'], ['say kkk once']).restatedKeys], ['KKK']);
    assert.ok(keyPattern('abc').test('x ABC y'));
    assert.ok(!keyPattern('abc').test('x ABC-y'));
    assert.ok(!keyPattern('abc').test('x_abc y'));
  });
});

describe('the fold is the engine\'s, for every cased character', () => {
  it('folds two characters alike whenever the engine compares them as equal without case', () => {
    // Only cased characters can be equal to another: every other code point
    // was compared with the engine on 2026-11-18 and matched itself alone.
    const cased = [];
    for (let point = 0; point <= 0x10ffff; point += 1) {
      if (point >= 0xd800 && point <= 0xdfff) continue;
      const char = String.fromCodePoint(point);
      if (char.toLowerCase() !== char || char.toUpperCase() !== char) cased.push(char);
    }
    cased.push('ͅ');
    assert.ok(cased.length > 2500, `only ${cased.length} cased characters`);
    const all = cased.join(' ');
    let joined = 0;
    for (const char of cased) {
      for (const other of all.match(new RegExp(escapeRegExp(char), 'giu')) ?? []) {
        if (other !== char) joined += 1;
        assert.equal(foldKeyChar(other), foldKeyChar(char), `the engine joins U+${char.codePointAt(0).toString(16)} and U+${other.codePointAt(0).toString(16)}; the fold does not`);
      }
    }
    assert.ok(joined > 2500, `only ${joined} pairs compared`);
  });
});

describe('a prose four times as long, under a schema four times as wide, does not take sixteen times as long', () => {
  /**
   * Measured on 2026-11-18, the many-keys shape below: with the old loop,
   * 20 times as long for four times the text (151 ms, then 3,076 ms); with
   * the search, 3 to 4 times. The line is drawn at ten, and the fastest of
   * three runs is taken for each, since a pause for memory makes a run
   * slower and never faster.
   */
  const LINE = 10;
  const shapes = [
    ['a schema of short keys above prose that names none of them', (size) => {
      const keys = [];
      for (let index = 0, length = 0; length < size / 2; index += 1) {
        const key = `"k${index.toString(36)}x": 1`;
        keys.push(key);
        length += key.length + 2;
      }
      return `\`\`\`json\n{${keys.join(', ')}}\n\`\`\`\n${'Write a plain answer for the reader. '.repeat(Math.ceil(size / 2 / 37))}`;
    }],
    ['a schema of dotted keys above prose made of their pieces', (size) => {
      const keys = [];
      for (let index = 0, length = 0; length < size / 2; index += 1) {
        const key = `"a.${index.toString(36)}": 1`;
        keys.push(key);
        length += key.length + 2;
      }
      return `\`\`\`json\n{${keys.join(', ')}}\n\`\`\`\n${'Read a.b and a.c, then a. '.repeat(Math.ceil(size / 2 / 26))}`;
    }],
  ];
  const fastest = (text) => {
    let best = Infinity;
    for (let run = 0; run < 3; run += 1) {
      const started = performance.now();
      findRestatedFormat(text, estimateTokens);
      best = Math.min(best, performance.now() - started);
    }
    return best;
  };

  for (const [name, make] of shapes) {
    it(name, () => {
      const short = make(20_000);
      const long = make(80_000);
      assert.ok(long.length <= MAX_INPUT_CHARS && long.length >= short.length * 3.9, 'the longer text is four times the shorter');
      findRestatedFormat(make(2_000), estimateTokens); // Compiled before anything is timed.
      const [before, after] = [fastest(short), fastest(long)];
      assert.ok(after < before * LINE, `${short.length} characters took ${before.toFixed(1)} ms and ${long.length} took ${after.toFixed(1)} ms: ${(after / before).toFixed(1)} times as long for four times the text`);
    });
  }
});
