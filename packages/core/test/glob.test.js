import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { matchGlob, mostSpecificMatch, specificity } from '../dist/index.js';

describe('glob matching', () => {
  it('matches a literal path', () => {
    assert.ok(matchGlob('prompts/system.txt', 'prompts/system.txt'));
    assert.ok(!matchGlob('prompts/system.txt', 'prompts/other.txt'));
  });

  it('* stays inside one segment', () => {
    assert.ok(matchGlob('prompts/*.txt', 'prompts/system.txt'));
    assert.ok(!matchGlob('prompts/*.txt', 'prompts/nested/system.txt'));
    assert.ok(!matchGlob('*.txt', 'prompts/system.txt'));
  });

  it('** crosses segments, including none', () => {
    assert.ok(matchGlob('prompts/**', 'prompts/system.txt'));
    assert.ok(matchGlob('prompts/**', 'prompts/a/b/c/system.txt'));
    assert.ok(matchGlob('**/system.txt', 'system.txt'), '** must be able to match nothing');
    assert.ok(matchGlob('**/system.txt', 'a/b/system.txt'));
    assert.ok(matchGlob('**', 'anything/at/all.txt'));
  });

  it('? matches exactly one character', () => {
    assert.ok(matchGlob('v?.txt', 'v1.txt'));
    assert.ok(!matchGlob('v?.txt', 'v10.txt'));
    assert.ok(!matchGlob('v?.txt', 'v.txt'));
  });

  it('handles consecutive ** without losing track', () => {
    assert.ok(matchGlob('**/**/system.txt', 'a/system.txt'));
    assert.ok(matchGlob('a/**/**/b.txt', 'a/b.txt'));
  });

  it('normalises separators and a leading ./', () => {
    assert.ok(matchGlob('prompts/*.txt', './prompts/system.txt'));
    assert.ok(matchGlob('prompts/*.txt', 'prompts//system.txt'));
    assert.ok(matchGlob('prompts/*.txt', 'prompts\\system.txt'), 'a Windows path should still match');
  });

  it('does not match a partial segment as a whole one', () => {
    assert.ok(!matchGlob('prompts/**', 'prompts-old/system.txt'));
    assert.ok(!matchGlob('sys*.txt', 'prompts/system.txt'));
  });

  it('declines a pattern or path past the length bound', () => {
    // Refusing is the point: the matcher is quadratic, and these patterns come
    // from a file in the repository — on a pull request, from whoever opened it.
    assert.ok(!matchGlob(`${'a'.repeat(2000)}*`, 'a'));
    assert.ok(!matchGlob('**', 'a/'.repeat(4000)));
  });

  it('stays fast on the shapes that break a regex translation', () => {
    // `**` compiled to `(?:[^/]*\/)*` is the classic nested quantifier: a long
    // near-match makes it backtrack exponentially. The segment DP has no such
    // shape, and this is the fixture that would have caught it.
    const hostile = [
      ['**/**/**/**/**/**/x.txt', `${'a/'.repeat(200)}y.txt`],
      ['a/*/*/*/*/*/*/*/*/b.txt', `a/${'x/'.repeat(200)}c.txt`],
      [`${'*'.repeat(200)}b`, 'a'.repeat(400)],
    ];

    for (const [pattern, path] of hostile) {
      const started = process.hrtime.bigint();
      matchGlob(pattern, path);
      const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
      assert.ok(elapsedMs < 250, `"${pattern}" took ${elapsedMs.toFixed(1)}ms`);
    }
  });
});

describe('which pattern wins', () => {
  // "Most specific" needs a stated definition, because a budget resolved from
  // the wrong pattern is a number nobody can trace back to their config.
  it('more literal characters beats fewer', () => {
    assert.ok(specificity('prompts/system.txt') > specificity('prompts/*.txt'));
    assert.ok(specificity('prompts/*.txt') > specificity('prompts/**'));
    assert.ok(specificity('prompts/**') > specificity('**'));
  });

  it('picks the most specific of several matching patterns', () => {
    const patterns = ['**', 'prompts/**', 'prompts/*.txt', 'prompts/system.txt'];
    assert.equal(mostSpecificMatch(patterns, 'prompts/system.txt'), 'prompts/system.txt');
    assert.equal(mostSpecificMatch(patterns, 'prompts/other.txt'), 'prompts/*.txt');
    assert.equal(mostSpecificMatch(patterns, 'prompts/a/b.txt'), 'prompts/**');
    assert.equal(mostSpecificMatch(patterns, 'README.md'), '**');
  });

  it('returns null when nothing matches', () => {
    assert.equal(mostSpecificMatch(['prompts/**'], 'src/index.ts'), null);
    assert.equal(mostSpecificMatch([], 'anything.txt'), null);
  });

  it('does not depend on the order the patterns were written in', () => {
    // Object key order is easy to reorder by accident. A budget that changes
    // because two keys swapped places would get blamed on the tool.
    const forward = ['prompts/**', 'prompts/*.txt'];
    const backward = ['prompts/*.txt', 'prompts/**'];
    assert.equal(
      mostSpecificMatch(forward, 'prompts/system.txt'),
      mostSpecificMatch(backward, 'prompts/system.txt'),
    );
  });
});
