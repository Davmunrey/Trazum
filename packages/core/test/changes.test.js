import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { extractChanges, optimize } from '../dist/index.js';

describe('per-rule change extraction', () => {
  it('reports a removal as before → empty', () => {
    const changes = extractChanges('Be quite accurate.', 'Be accurate.');
    assert.deepEqual(changes, [{ before: 'quite', after: '' }]);
  });

  it('reports a replacement as before → after', () => {
    const changes = extractChanges('Answer in order to help.', 'Answer to help.');
    assert.equal(changes.length, 1);
    assert.equal(changes[0].before, 'in order');
    assert.equal(changes[0].after, '');
  });

  it('keeps whole words when the edit is mid-sentence', () => {
    // Regression: the common prefix and suffix are trimmed by character but
    // the diff runs by word, so both boundaries have to be pushed out to
    // whitespace. Without it, removing "quite" from "should be quite accurate"
    // reported itself as `be quit → b` — accurate, useless, and worse than
    // showing nothing.
    const changes = extractChanges(
      'The classification should be quite accurate.',
      'The classification should be accurate.',
    );
    assert.deepEqual(changes, [{ before: 'quite', after: '' }]);
  });

  it('does not extend the common suffix past where it is actually common', () => {
    // Regression: the boundary walk grew the suffix instead of shrinking it,
    // which claims two different strings match and produced `should be → sho`.
    const changes = extractChanges('I think the answer is fine.', 'The answer is fine.');
    assert.equal(changes.length, 1);
    assert.equal(changes[0].before, 'I think the');
    assert.equal(changes[0].after, 'The');
  });

  it('returns nothing when the texts are identical', () => {
    assert.deepEqual(extractChanges('same text', 'same text'), []);
  });

  it('ignores whitespace-only churn', () => {
    // The whitespace rule's hit count already reports it; a change list full of
    // invisible edits is noise.
    assert.deepEqual(extractChanges('a  b', 'a b'), []);
  });

  it('reports several changes from one rule', () => {
    const changes = extractChanges(
      'This is very important and extremely urgent and quite clear.',
      'This is important and urgent and clear.',
    );
    assert.equal(changes.length, 3);
    assert.deepEqual(
      changes.map((c) => c.before),
      ['very', 'extremely', 'quite'],
    );
  });

  it('caps the list', () => {
    const before = Array.from({ length: 20 }, (_, i) => `word${i} very thing${i}`).join('. ');
    const after = before.replace(/ very/g, '');
    assert.equal(extractChanges(before, after, 5).length, 5);
    assert.equal(extractChanges(before, after, 2).length, 2);
  });

  it('gives up rather than truncating on a change too large to summarise', () => {
    // An empty list reads as "nothing to show"; a truncated one would read as
    // "this is all that happened", which would be a lie.
    const before = `${'alpha '.repeat(2000)}END`;
    const after = `${'beta '.repeat(2000)}END`;
    assert.deepEqual(extractChanges(before, after), []);
  });

  it('stays fast on adversarial input', () => {
    // Same posture as the ReDoS suite: this runs on attacker-controlled text
    // behind an HTTP endpoint, so the cost is bounded by construction.
    const before = `${'x'.repeat(200_000)} tail`;
    const after = `${'y'.repeat(200_000)} tail`;
    const started = Date.now();
    extractChanges(before, after);
    assert.ok(Date.now() - started < 2000, 'change extraction should bail, not grind');
  });
});

describe('changes on the report', () => {
  it('every rule that fired carries a change list', () => {
    const result = optimize(
      'Please, in order to help me, basically summarise this VERY important text. Thanks.',
      { level: 'aggressive' },
    );
    assert.ok(result.rules.length > 0);
    for (const rule of result.rules) {
      assert.ok(Array.isArray(rule.changes), `${rule.id} has no change list`);
    }
    const intensifiers = result.rules.find((r) => r.id === 'intensifiers');
    assert.ok(intensifiers);
    assert.deepEqual(intensifiers.changes, [{ before: 'VERY', after: '' }]);
  });

  it('shows the original text, not the internal markers', () => {
    // Rules run on masked text where protected content is a private-use
    // marker. Reporting that would be unreadable.
    const result = optimize(
      'Please read `config.yaml` and https://example.com/docs to help me.',
      { level: 'aggressive' },
    );
    for (const rule of result.rules) {
      for (const change of rule.changes) {
        assert.ok(
          !/[-]/.test(change.before + change.after),
          `${rule.id} leaked a mask marker: ${JSON.stringify(change)}`,
        );
      }
    }
  });
});

describe('self-verification removal leaves no fragment', () => {
  // Found by the per-rule change list the moment it existed: the phrase
  // matched but the subject and modal in front of it did not, so
  // "You MUST double-check your answer before responding." became "You must."
  const cases = [
    'You MUST double-check your answer before responding.',
    'You should verify your answer before responding.',
    'Always double-check your answer before responding.',
    'Make sure to verify your answer before responding.',
    'DEBES verificar tu respuesta antes de contestar.',
    'Asegúrate de revisar tu respuesta.',
  ];

  for (const prompt of cases) {
    it(`leaves nothing behind: ${prompt.slice(0, 40)}`, () => {
      const { optimized } = optimize(prompt, { level: 'aggressive' });
      assert.equal(
        optimized,
        '',
        `left a fragment instead of removing the whole instruction: ${JSON.stringify(optimized)}`,
      );
    });
  }

  it('still removes the bare form mid-paragraph', () => {
    const { optimized } = optimize('Summarise it. Double-check your answer.', {
      level: 'aggressive',
    });
    assert.equal(optimized, 'Summarise it.');
  });
});
