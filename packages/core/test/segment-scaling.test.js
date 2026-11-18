import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MAX_INPUT_CHARS, segment } from '../dist/index.js';
import { firstOverlap, heldBy } from '../dist/segment.js';

/**
 * The segmenter's work grows with the text, not with its square.
 *
 * It did grow with the square. For every match, `segment` asked whether the
 * match overlapped a reservation by looking at every reservation, so a text
 * of nothing but protected spans cost the square of their number: half a
 * second at 70 kB, and 26 to 30 seconds at the 400 kB the HTTP API accepts,
 * measured on 2026-11-18 (#716). One request, half a minute of one core.
 *
 * What noticed was a test with a five-second budget, and only when it ran
 * under coverage on a slower machine, one run in three. A budget in seconds
 * is a statement about a machine. So nothing here is one:
 *
 * - the two searches are compared, answer for answer, with the plain loops
 *   they replaced;
 * - how many ranges a search reads is counted, which no clock is needed for;
 * - and where a clock is read, it is to compare a text with one four times
 *   its length on the same machine in the same second.
 */

/** A small generator with a fixed seed: the same ranges on every run. */
function sequence(seed) {
  let state = seed;
  return (below) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state % below;
  };
}

/** Ranges in order, none overlapping, some touching, as `segment` keeps them. */
function ranges(count, next) {
  const made = [];
  let at = next(3);
  for (let index = 0; index < count; index += 1) {
    const length = 1 + next(4);
    made.push({ start: at, end: at + length, kind: 'placeholder' });
    at += length + next(3); // A gap of none makes two ranges touch.
  }
  return made;
}

/** What `segment` did before: the first range, in order, that overlaps. */
const firstOverlapByLooking = (list, start, end) => list.find((range) => start < range.end && end > range.start);
/** And for quotations: whether any of them holds the whole span. */
const heldByLooking = (list, start, end) => list.some((quote) => start >= quote.start && end <= quote.end);

/** The same list, counting how many of its entries are read. */
function counted(list) {
  let reads = 0;
  const watched = new Proxy(list, {
    get(target, key, receiver) {
      if (typeof key === 'string' && /^\d+$/.test(key)) reads += 1;
      return Reflect.get(target, key, receiver);
    },
  });
  return { watched, reads: () => reads };
}

describe('the first reservation a match overlaps', () => {
  it('is the one the plain loop finds, for every span over every layout tried', () => {
    const next = sequence(20261118);
    let asked = 0;
    for (let layout = 0; layout < 60; layout += 1) {
      const list = ranges(next(9), next);
      const edge = (list.at(-1)?.end ?? 0) + 3;
      for (let start = 0; start < edge; start += 1) {
        for (let end = start + 1; end <= edge; end += 1) {
          assert.equal(firstOverlap(list, start, end), firstOverlapByLooking(list, start, end), `[${start}, ${end}) over ${JSON.stringify(list.map((range) => [range.start, range.end]))}`);
          asked += 1;
        }
      }
    }
    assert.ok(asked > 5000, `only ${asked} spans were tried`);
  });

  it('a span that only touches a reservation does not overlap it, on either side', () => {
    const list = [{ start: 4, end: 8, kind: 'placeholder' }, { start: 8, end: 10, kind: 'inline-code' }, { start: 20, end: 25, kind: 'xml-tag' }];
    assert.equal(firstOverlap(list, 0, 4), undefined, 'ends where the first begins');
    assert.equal(firstOverlap(list, 10, 20), undefined, 'fills the gap exactly');
    assert.equal(firstOverlap(list, 25, 30), undefined, 'begins where the last ends');
    assert.equal(firstOverlap(list, 3, 5), list[0]);
    assert.equal(firstOverlap(list, 7, 8), list[0], 'the last character of the first');
    assert.equal(firstOverlap(list, 8, 9), list[1], 'the first character of the second, which touches the first');
    assert.equal(firstOverlap(list, 24, 99), list[2]);
  });

  it('of several, it is the first in the text, which is where the scan resumes from', () => {
    const list = [{ start: 4, end: 8, kind: 'placeholder' }, { start: 8, end: 10, kind: 'inline-code' }, { start: 20, end: 25, kind: 'xml-tag' }];
    assert.equal(firstOverlap(list, 0, 99), list[0]);
    assert.equal(firstOverlap(list, 9, 99), list[1]);
    assert.equal(firstOverlap(list, 10, 99), list[2]);
  });

  it('nothing is reserved, or the span is past everything reserved', () => {
    assert.equal(firstOverlap([], 0, 5), undefined);
    assert.equal(firstOverlap([{ start: 0, end: 2, kind: 'placeholder' }], 2, 5), undefined);
    assert.equal(firstOverlap([{ start: 0, end: 2, kind: 'placeholder' }], 50, 60), undefined);
  });

  it('reads a handful of a hundred thousand reservations, not all of them', () => {
    const list = ranges(100_000, sequence(7));
    const last = list.at(-1).end;
    for (const start of [0, 1, Math.floor(last / 3), Math.floor(last / 2), last - 1, last, last + 10]) {
      const { watched, reads } = counted(list);
      assert.equal(firstOverlap(watched, start, start + 2), firstOverlapByLooking(list, start, start + 2));
      // Seventeen halvings find one of 100,000, and one more read is the answer.
      assert.ok(reads() <= 19, `${reads()} reservations read to place a span at ${start}`);
    }
  });
});

describe('whether a quotation holds a reservation', () => {
  it('is what the plain loop says, for every span over every layout tried', () => {
    const next = sequence(716);
    let asked = 0;
    for (let layout = 0; layout < 60; layout += 1) {
      const list = ranges(next(9), next);
      const edge = (list.at(-1)?.end ?? 0) + 3;
      for (let start = 0; start < edge; start += 1) {
        for (let end = start + 1; end <= edge; end += 1) {
          assert.equal(heldBy(list, start, end), heldByLooking(list, start, end), `[${start}, ${end}) in ${JSON.stringify(list.map((range) => [range.start, range.end]))}`);
          asked += 1;
        }
      }
    }
    assert.ok(asked > 5000, `only ${asked} spans were tried`);
  });

  it('held means all of it: flush with either end is held, one character over is not', () => {
    const quotes = [{ start: 10, end: 20, kind: 'quoted' }, { start: 20, end: 30, kind: 'quoted' }];
    assert.equal(heldBy(quotes, 10, 20), true, 'the whole quotation');
    assert.equal(heldBy(quotes, 10, 12), true, 'flush with its start');
    assert.equal(heldBy(quotes, 18, 20), true, 'flush with its end');
    assert.equal(heldBy(quotes, 9, 12), false, 'begins one character before it');
    assert.equal(heldBy(quotes, 18, 21), false, 'runs one character into the next');
    assert.equal(heldBy(quotes, 20, 30), true, 'the second, which touches the first');
    assert.equal(heldBy(quotes, 30, 31), false, 'after both');
    assert.equal(heldBy(quotes, 0, 3), false, 'before both');
    assert.equal(heldBy([], 0, 3), false);
  });

  it('reads a handful of a hundred thousand quotations, not all of them', () => {
    const list = ranges(100_000, sequence(11));
    const last = list.at(-1).end;
    for (const start of [0, Math.floor(last / 2), last - 1, last + 10]) {
      const { watched, reads } = counted(list);
      assert.equal(heldBy(watched, start, start + 1), heldByLooking(list, start, start + 1));
      assert.ok(reads() <= 19, `${reads()} quotations read to place a span at ${start}`);
    }
  });
});

describe('the segmenter uses them', () => {
  it('a reservation a quotation swallows gives way to it, and one beside it stays', () => {
    const shape = (text) => segment(text).map((part) => `${part.kind === 'protected' ? part.protection : 'mutable'}:${part.text}`);
    assert.deepEqual(shape('say "hello {{name}}" to {{other}}'), ['mutable:say ', 'quoted:"hello {{name}}"', 'mutable: to ', 'placeholder:{{other}}']);
    assert.deepEqual(shape('{{a}}"b"`c`'), ['placeholder:{{a}}', 'quoted:"b"', 'inline-code:`c`']);
  });

  it('the scan resumes after a reservation it ran into, and still finds what follows', () => {
    // The shape the segmenter's own comment describes: a code span sitting
    // just past a fence, which a skipped overlap used to hide.
    const text = '```\nx\n``` `span` ```\ny\n```';
    const spans = segment(text).filter((part) => part.kind === 'protected').map((part) => part.text);
    assert.deepEqual(spans, ['```\nx\n```', '`span`', '```\ny\n```']);
  });
});

describe('a text four times as long does not take sixteen times as long', () => {
  /**
   * The clock is read here, and only to compare the machine with itself: the
   * segmenter on the same shape at a quarter of the cap and at the cap. Work
   * that grows with the length makes the longer one take about four times as
   * long, and work that grows with its square makes it sixteen or more.
   *
   * Measured on 2026-11-18 on these three shapes: with the plain loops, 24 to
   * 35 times as long, the cap taking 3 to 10 seconds; with the halving, 5 to
   * 8 times, the cap taking under 50 ms. The line is drawn at fourteen. The
   * fastest of three runs is taken for each, since a pause for memory makes
   * a run slower and never faster.
   *
   * `optimize` is not what is timed. It does a good deal of honest work on
   * the same text, which grows with the length and hides the square until
   * the text is large: at a sixteenth and a quarter of the cap the old code
   * came out at 8 times through `optimize`, which no line drawn here would
   * have called a fault.
   */
  const LINE = 14;
  const shapes = [
    ['placeholders, tags and code spans, nothing else', (count) => `${'{{a}} '.repeat(count)}${'<b> '.repeat(count)}${'`c` '.repeat(count)}`, 14],
    ['quotations each holding a placeholder', (count) => '"{{a}}" '.repeat(count), 8],
    ['code spans beside placeholders', (count) => '{{a}}`c` '.repeat(count), 9],
  ];
  const fastest = (text) => {
    let best = Infinity;
    for (let run = 0; run < 3; run += 1) {
      const started = performance.now();
      segment(text);
      best = Math.min(best, performance.now() - started);
    }
    return best;
  };

  for (const [name, make, unit] of shapes) {
    it(name, () => {
      const short = make(Math.floor(MAX_INPUT_CHARS / 4 / unit));
      const long = make(Math.floor(MAX_INPUT_CHARS / unit));
      assert.ok(long.length <= MAX_INPUT_CHARS && long.length >= short.length * 3.9, 'the longer text is the cap and four times the shorter');
      segment(make(200)); // Compiled before anything is timed.
      const [before, after] = [fastest(short), fastest(long)];
      assert.ok(after < before * LINE, `${short.length} characters took ${before.toFixed(1)} ms and ${long.length} took ${after.toFixed(1)} ms: ${(after / before).toFixed(1)} times as long for four times the text`);
    });
  }
});
