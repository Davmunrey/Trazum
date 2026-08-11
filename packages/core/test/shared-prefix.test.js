import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { cacheableMinimum, sharedPrefixes } from '../dist/index.js';

/**
 * The finding no single prompt can produce.
 *
 * Most of these tests are about what it **refuses** to report, because that is
 * where a cross-prompt analysis goes wrong: it is trivially easy to write
 * something that finds "similar" prompts and tells people to unify text that
 * would not have cached anyway, or that cannot be unified without reordering
 * instructions — which is the one transformation this repository treats as
 * dangerous.
 */

/** A block of roughly `n` tokens of ordinary prose, deterministic. */
const filler = (n, word = 'instruction') => Array.from({ length: n }, () => word).join(' ');

describe('what it reports', () => {
  it('finds a preamble that differs only in whitespace', () => {
    /**
     * The trailing space on b.txt is the whole point, and the first draft of this
     * test did not have it: both fixtures carried a byte-identical first block, so
     * the module correctly reported nothing and the assertion demanded otherwise.
     * A test only asks the question its fixtures encode — this one now encodes
     * "differs, but only in whitespace" rather than "is the same".
     */
    const groups = sharedPrefixes([
      { path: 'a.txt', text: `You are a support agent.\n${filler(20)}\n\nQuery: {{q}}` },
      { path: 'b.txt', text: `You are a support agent. \n${filler(20)}\n\nOrder: {{o}}` },
    ]);

    assert.equal(groups.length, 1);
    assert.deepEqual(groups[0].paths, ['a.txt', 'b.txt']);
    assert.equal(groups[0].blocks, 1);
    assert.equal(groups[0].drift, 'whitespace');
  });

  it('names whitespace drift as whitespace, because a formatter fixes it', () => {
    const [group] = sharedPrefixes([
      { path: 'a.txt', text: 'You are an agent.\nBe brief.\n\ntail a' },
      { path: 'b.txt', text: 'You are an agent.\n\tBe   brief.\n\ntail b' },
    ]);
    assert.equal(group.drift, 'whitespace');
  });

  it('names anything else as wording, because somebody has to choose', () => {
    // Same words to `normalizeForCompare`, which strips case and punctuation, so
    // these group — but collapsing whitespace does not make them equal, so
    // unifying them is a decision rather than a reformat.
    const [group] = sharedPrefixes([
      { path: 'a.txt', text: 'You are an Agent.\n\ntail a' },
      { path: 'b.txt', text: 'you are an agent\n\ntail b' },
    ]);
    assert.equal(group.drift, 'wording');
  });

  it('extends the prefix across every block the group agrees on', () => {
    const shared = `Preamble.\n\nSecond block.\n\nThird block.`;
    const groups = sharedPrefixes([
      { path: 'a.txt', text: `${shared}\n\nfourth a` },
      { path: 'b.txt', text: `${shared} \n\nSecond block.\n\nThird  block.\n\nfourth b` },
    ]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].blocks, 3);
  });

  it('stops at the first block the group disagrees on', () => {
    // A prefix is contiguous. Agreement resuming later does not extend it,
    // because the bytes in between differ and caching matches bytes in order.
    const [group] = sharedPrefixes([
      { path: 'a.txt', text: 'Same.\n\nDiffers here.\n\nSame again.\n\ntail' },
      { path: 'b.txt', text: 'Same. \n\nSomething else entirely.\n\nSame again.\n\ntail' },
    ]);
    assert.equal(group.blocks, 1);
  });

  it('reports the largest group first', () => {
    const groups = sharedPrefixes([
      { path: 'small-a.txt', text: `Alpha.\n\ntail a` },
      { path: 'small-b.txt', text: `Alpha. \n\ntail b` },
      { path: 'big-a.txt', text: `Beta.\n\n${filler(40)}\n\ntail a` },
      { path: 'big-b.txt', text: `Beta. \n\n${filler(40)}\n\ntail b` },
    ]);
    assert.equal(groups.length, 2);
    assert.ok(groups[0].tokens > groups[1].tokens);
    assert.deepEqual(groups[0].paths, ['big-a.txt', 'big-b.txt']);
  });
});

describe('what it refuses to report', () => {
  it('says nothing about prompts whose prefixes are already identical', () => {
    // They share a cache entry today. Listing them would be noise, and noise in
    // this section teaches people to stop reading it.
    const groups = sharedPrefixes([
      { path: 'a.txt', text: 'Identical preamble.\n\ntail a' },
      { path: 'b.txt', text: 'Identical preamble.\n\ntail b' },
    ]);
    assert.deepEqual(groups, []);
  });

  it('says nothing about a prefix below the cacheable minimum', () => {
    // Unifying it would recover nothing, which is the same refusal reorderForCache
    // makes: a change that buys nothing is a diff for its own sake.
    const prompts = [
      { path: 'a.txt', text: 'Short preamble.\n\ntail a' },
      { path: 'b.txt', text: 'Short  preamble.\n\ntail b' },
    ];
    assert.equal(sharedPrefixes(prompts).length, 1, 'the group exists at all');
    assert.deepEqual(sharedPrefixes(prompts, { minTokens: 1024 }), []);
  });

  it('does not group prompts whose opening block differs', () => {
    /**
     * The important refusal.
     *
     * These two share a large amount of text — everything after the first block
     * — and share *nothing* for caching purposes, because the match runs from the
     * start of the request. Grouping on any later block would name prompts that
     * can only be made to share a prefix by reordering their instructions, and
     * reordering is the transformation this repository treats as dangerous
     * enough to keep out of `aggressive`.
     */
    const tail = `${filler(60)}\n\n${filler(60, 'more')}`;
    assert.deepEqual(
      sharedPrefixes([
        { path: 'a.txt', text: `Opening A.\n\n${tail}` },
        { path: 'b.txt', text: `Completely different opening.\n\n${tail}` },
      ]),
      [],
    );
  });

  it('does not group prompts on an empty opening block', () => {
    // An empty opening is an absence, not a match. Grouping on it would put every
    // prompt that begins with a blank line into one group and report a shared
    // prefix of nothing.
    assert.deepEqual(
      sharedPrefixes([
        { path: 'a.txt', text: '\n\nreal content a' },
        { path: 'b.txt', text: '\n\nreal content b' },
      ]),
      [],
    );
  });

  it('says nothing about a single prompt, however long its preamble', () => {
    assert.deepEqual(sharedPrefixes([{ path: 'a.txt', text: `${filler(500)}\n\ntail` }]), []);
    assert.deepEqual(sharedPrefixes([]), []);
  });

  it('attaches no dollar figure to anything', () => {
    /**
     * Asserted structurally, because this is a promise and not an omission.
     *
     * The saving lives in the cache hit rate, and `cacheHitRate` is an input to
     * Trazum's cost model rather than something it derives: `advisories.ts` takes
     * it from `--cache-hit-rate` and applies one value to every prompt. Under that
     * model, splitting one prefix into forty changes nothing, because there is no
     * term for how many cache entries exist. Pricing this would mean inventing a
     * distribution of calls across the group — the one thing here that only the
     * operator knows.
     *
     * If a figure ever belongs here it will be because the model gained that
     * term, and this test should be deleted deliberately rather than loosened.
     */
    const [group] = sharedPrefixes([
      { path: 'a.txt', text: `Preamble.\n\n${filler(30)}\n\ntail a` },
      { path: 'b.txt', text: `Preamble. \n\n${filler(30)}\n\ntail b` },
    ]);
    for (const key of Object.keys(group)) {
      assert.ok(
        !/usd|cost|saving|money|dollar/i.test(key),
        `${key} looks like a priced field — see the doc comment before adding one`,
      );
    }
  });
});

describe('properties that hold whatever the input', () => {
  it('is stable: the same input twice gives the same order', () => {
    const prompts = [
      { path: 'c.txt', text: `Same.\n\n${filler(30)}\n\nc` },
      { path: 'a.txt', text: `Same. \n\n${filler(30)}\n\na` },
      { path: 'b.txt', text: `Other.\n\n${filler(30)}\n\nb` },
      { path: 'd.txt', text: `Other. \n\n${filler(30)}\n\nd` },
    ];
    const once = sharedPrefixes(prompts);
    const twice = sharedPrefixes(prompts);
    assert.deepEqual(once, twice);
    // Two groups of equal token count: the tie is broken by path, not by Map order.
    assert.equal(once.length, 2);
    assert.deepEqual(
      once.map((group) => group.paths[0]),
      [...once.map((group) => group.paths[0])].sort(),
    );
  });

  it('never reports a prefix the group does not actually share', () => {
    // The sample is taken from the first prompt. Every other member must agree
    // with it under normalisation, or the report names text somebody does not have.
    const groups = sharedPrefixes([
      { path: 'a.txt', text: `Alpha one.\n\nBeta two.\n\ntail a` },
      { path: 'b.txt', text: `Alpha  one.\n\nBeta   two.\n\ntail b` },
      { path: 'c.txt', text: `Alpha one.\n\nBeta two!\n\ntail c` },
    ]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].paths.length, 3);
    assert.ok(groups[0].sample.startsWith('Alpha one.'));
  });

  it('survives hostile shapes without throwing', () => {
    for (const text of [
      '',
      '\n',
      '\n\n\n',
      ' ',
      'a'.repeat(20_000),
      // A NUL in the *input* is a fair hostile shape. Written as an escape,
      // because typing the byte is how five files in this repository became
      // binary to git — including this one, caught by that guard before it
      // was committed rather than three commits later.
      '\0\n\nx',
    ]) {
      assert.doesNotThrow(() =>
        sharedPrefixes([
          { path: 'a', text },
          { path: 'b', text },
        ]),
      );
    }
  });
});

describe('the gate that decides whether any of this is worth saying', () => {
  /**
   * `cacheableMinimum` was a private function in the CLI first, and a mutation
   * run deleting its `unknown` branch survived — which is what a function nothing
   * can reach looks like from the outside. It moved here to be reachable.
   */
  it('uses the model minimum when the model declares one', () => {
    assert.equal(cacheableMinimum({ caching: 'explicit', cacheMinTokens: 1024 }), 1024);
    assert.equal(cacheableMinimum({ caching: 'implicit', cacheMinTokens: 512 }), 512);
  });

  it('reports nothing for a model whose caching is unknown', () => {
    // What the live pricing overlay assigns to a model it has never seen. Telling
    // somebody to unify a preamble across twelve files to enable caching their
    // provider may not offer spends their afternoon, and unlike a wrong figure on
    // a report nothing later corrects it.
    assert.equal(cacheableMinimum({ caching: 'unknown', cacheMinTokens: 1024 }), Infinity);
  });

  it('reports nothing for a model with no caching at all', () => {
    assert.equal(cacheableMinimum({ caching: 'none', cacheMinTokens: 0 }), Infinity);
  });

  it('reports nothing when the minimum is absent or the model is', () => {
    assert.equal(cacheableMinimum({ caching: 'explicit', cacheMinTokens: null }), Infinity);
    assert.equal(cacheableMinimum({ caching: 'explicit' }), Infinity);
    assert.equal(cacheableMinimum(undefined), Infinity);
  });

  it('and Infinity really does suppress the report', () => {
    // The two halves wired together, because a gate that returns the right number
    // and is then ignored is the failure this pair exists to rule out.
    const prompts = [
      { path: 'a.txt', text: `Preamble.\n\n${filler(200)}\n\ntail a` },
      { path: 'b.txt', text: `Preamble. \n\n${filler(200)}\n\ntail b` },
    ];
    assert.equal(sharedPrefixes(prompts).length, 1, 'the group exists with no minimum');
    assert.deepEqual(
      sharedPrefixes(prompts, { minTokens: cacheableMinimum({ caching: 'unknown' }) }),
      [],
    );
  });
});

/**
 * Two mutants survive this file's tests and both are equivalent rather than
 * uncovered. Recorded so nobody removes one guard on the assumption that the
 * other is the load-bearing one.
 *
 * - Deleting `if (opening === '') continue;` changes nothing, because the
 *   extension loop breaks on an empty normalised block anyway.
 * - Changing `group.length < 2` to `< 1` changes nothing, because a lone prefix
 *   is trivially identical to itself and the already-identical check drops it.
 *
 * Both are kept: each states its own intent, and neither is reachable by a test
 * precisely because the other exists.
 */
