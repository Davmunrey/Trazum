import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  NothingToPrune,
  findExamples,
  estimateTokens,
  plannedCalls,
  pruneExamples,
  withoutExample,
} from '../dist/index.js';

/**
 * Which few-shot examples earn their tokens.
 *
 * Every test here uses a spy provider, so the suite spends nothing. That is not
 * only thrift: a test against a real model would measure the model's mood rather
 * than this code, and would be the kind of test people learn to re-run until it
 * passes.
 *
 * What the spy lets us assert instead is the part that is ours — the call
 * arithmetic, the leave-one-out construction, and which verdict each agreement
 * figure produces.
 */

/** Two examples plus a preamble and a tail, in the shape the detector finds. */
const PROMPT = [
  'You are a classifier. Answer with one word.',
  '',
  'Example:',
  'Input: my card was declined',
  'Output: payment',
  '',
  'Example:',
  'Input: where is my parcel',
  'Output: shipping',
  '',
  'Example:',
  'Input: I want my money back',
  'Output: refund',
  '',
  'Now classify: {{input}}',
].join('\n');

/**
 * A provider that answers from a table, and records what it was asked.
 *
 * `answer` receives the system prompt and the input, so a test can make the
 * answer depend on whether a particular example survived — which is the only way
 * to exercise `diverges` without a real model.
 */
function spy(answer) {
  const seen = [];
  return {
    provider: {
      name: 'spy',
      model: 'spy-1',
      complete: async ({ system, user }) => {
        seen.push({ system, user });
        return answer(system, user);
      },
    },
    seen,
  };
}

describe('what it will cost, before it costs it', () => {
  it('is two baselines per input plus one run per example', () => {
    // 3 inputs × (2 + 4 examples) = 18. The baselines are shared across every
    // example, which is the only reason this is affordable at all.
    assert.equal(plannedCalls(4, 3), 18);
    assert.equal(plannedCalls(2, 1), 4);
  });

  it('is zero when there is nothing to measure', () => {
    assert.equal(plannedCalls(1, 10), 0);
    assert.equal(plannedCalls(0, 10), 0);
    assert.equal(plannedCalls(5, 0), 0);
  });

  it('and the number it promised is the number spent', () => {
    /**
     * The two halves wired together. A planner that is right and a runner that
     * spends more is worse than no planner, because somebody budgeted against it.
     */
    const { provider, seen } = spy(() => 'payment');
    const examples = findExamples(PROMPT, estimateTokens).length;
    const inputs = ['a', 'b'];
    return pruneExamples(PROMPT, inputs, provider).then((report) => {
      assert.equal(report.callsMade, plannedCalls(examples, inputs.length));
      assert.equal(seen.length, report.callsMade);
    });
  });
});

describe('removing one example', () => {
  const examples = findExamples(PROMPT, estimateTokens);

  it('takes out the one asked for and leaves the rest', () => {
    const without = withoutExample(PROMPT, examples, 1);
    assert.ok(!without.includes('where is my parcel'), 'the wrong example survived');
    assert.ok(without.includes('my card was declined'), 'an untouched example was removed');
    assert.ok(without.includes('I want my money back'), 'an untouched example was removed');
    assert.ok(without.includes('Now classify'), 'the tail was removed');
    assert.ok(without.includes('You are a classifier'), 'the preamble was removed');
  });

  it('removes the second of two identical examples, not the first', () => {
    /**
     * The reason this is located by position rather than by
     * `prompt.replace(text, '')`. A copy-pasted few-shot section contains
     * identical blocks, and a text replace would match the first occurrence for
     * both — so measuring the removal of the second would describe the removal of
     * the first, and the report would name the wrong example.
     */
    const twice = [
      'Preamble.',
      '',
      'Example:',
      'Input: same',
      'Output: same',
      '',
      'Example:',
      'Input: middle',
      'Output: middle',
      '',
      'Example:',
      'Input: same',
      'Output: same',
      '',
      'Tail.',
    ].join('\n');
    const blocks = findExamples(twice, estimateTokens);
    assert.ok(blocks.length >= 3, `expected three blocks, found ${blocks.length}`);

    /**
     * The two identical blocks are separated by a different one, and that is the
     * point: adjacent identical blocks produce the same string whichever you
     * remove, so they cannot show the distinction. The first draft of this test
     * used adjacent copies and demanded they differ — the test was wrong, not the
     * code. With something in between, removing index 0 leaves `middle` first and
     * removing index 2 leaves it second, so a text replace that always hit the
     * first occurrence would be visible.
     */
    const withoutFirst = withoutExample(twice, blocks, 0);
    const withoutLast = withoutExample(twice, blocks, 2);
    assert.equal(withoutFirst.length, withoutLast.length);
    assert.notEqual(withoutFirst, withoutLast);
    assert.ok(withoutFirst.indexOf('middle') < withoutFirst.indexOf('Input: same'));
    assert.ok(withoutLast.indexOf('middle') > withoutLast.indexOf('Input: same'));
  });

  it('leaves no hole where the example was', () => {
    // A prompt with three consecutive newlines is one nobody wrote, and the model
    // sees the difference even when a reader would not care.
    for (let index = 0; index < examples.length; index++) {
      assert.ok(
        !/\n{3,}/.test(withoutExample(PROMPT, examples, index)),
        `removing ${index} left a gap`,
      );
    }
  });

  it('returns the prompt unchanged for an index that does not exist', () => {
    assert.equal(withoutExample(PROMPT, examples, 99), PROMPT);
    assert.equal(withoutExample(PROMPT, examples, -1), PROMPT);
  });
});

describe('what it refuses to run at all', () => {
  it('a prompt with fewer than two examples', async () => {
    await assert.rejects(
      () => pruneExamples('Just an instruction.\n\nClassify: {{input}}', ['a'], spy(() => 'x').provider),
      NothingToPrune,
    );
  });

  it('an empty set of inputs', async () => {
    // Leave-one-out with nothing to run on would report every example as
    // contributing nothing, which is the most confident wrong answer available.
    await assert.rejects(() => pruneExamples(PROMPT, [], spy(() => 'x').provider), NothingToPrune);
  });
});

describe('the verdicts', () => {
  it('calls an example redundant when removing it changes nothing', async () => {
    // A model that answers identically no matter what: every example is
    // unnecessary, and the self-agreement is perfect.
    const { provider } = spy(() => 'payment');
    const report = await pruneExamples(PROMPT, ['my card failed'], provider);

    assert.equal(report.selfAgreement, 1);
    for (const contribution of report.contributions) {
      assert.equal(contribution.verdict, 'indistinguishable', `example ${contribution.index}`);
    }
    assert.ok(report.recoverableTokens > 0);
  });

  it('calls it needed when removing it changes the answer', async () => {
    /**
     * The answer depends on whether the refund example survived, which is what a
     * load-bearing example looks like from the outside.
     */
    const { provider } = spy((system) =>
      system.includes('I want my money back') ? 'refund' : 'completely different words here',
    );
    const report = await pruneExamples(PROMPT, ['give me my money'], provider);

    const refund = report.contributions.find((c) => c.text.includes('I want my money back'));
    assert.ok(refund, 'the refund example was not found');
    assert.equal(refund.verdict, 'diverges');
    // And it is not counted as recoverable.
    assert.ok(
      report.recoverableTokens < report.contributions.reduce((sum, c) => sum + c.tokens, 0),
    );
  });

  it('refuses a verdict when the model disagrees with itself', async () => {
    /**
     * `inconclusive` is the honest answer when the yardstick is broken. A model
     * this unstable cannot judge anything, and reporting confident verdicts off it
     * would be worse than admitting the measurement does not work here.
     */
    /**
     * The answers share no words at all. The first draft used
     * `answer number ${n} entirely unlike the previous one`, which shares every
     * word but the numeral and scored 0.78 — comfortably above the 0.5 floor. The
     * test was demanding instability its fixture did not contain, which is the
     * recurring lesson in this repository: a test only asks the question its
     * fixtures encode.
     */
    const vocabularies = [
      'alpha bravo charlie delta echo foxtrot',
      'uno dos tres cuatro cinco seis',
      'ichi ni san shi go roku',
      'een twee drie vier vijf zes',
      'unus duo tres quattuor quinque sex',
      'yek do se chahar panj shesh',
      'moja mbili tatu nne tano sita',
      'bir iki uc dort bes alti',
    ];
    let call = 0;
    const { provider } = spy(() => vocabularies[call++ % vocabularies.length]);
    const report = await pruneExamples(PROMPT, ['x'], provider);

    assert.ok(report.selfAgreement < 0.5, `self-agreement was ${report.selfAgreement}`);
    for (const contribution of report.contributions) {
      assert.equal(contribution.verdict, 'inconclusive');
    }
    assert.equal(report.recoverableTokens, 0, 'tokens were called recoverable on a broken yardstick');
  });

  it('measures the baselines sequentially, so a cached answer cannot fake stability', async () => {
    /**
     * The two baseline runs exist to measure the model's variance. Issuing them
     * together invites a provider to serve one from a cache and report a variance
     * of zero — which would make every example look load-bearing, or none of them,
     * depending on the direction of the error.
     */
    let inFlight = 0;
    let sawConcurrentBaselines = false;
    const provider = {
      name: 'spy',
      model: 'spy-1',
      complete: async ({ system }) => {
        const isBaseline = system.includes('I want my money back')
          && system.includes('where is my parcel')
          && system.includes('my card was declined');
        if (isBaseline) {
          inFlight++;
          if (inFlight > 1) sawConcurrentBaselines = true;
          await new Promise((resolve) => setTimeout(resolve, 1));
          inFlight--;
        }
        return 'payment';
      },
    };

    await pruneExamples(PROMPT, ['a'], provider, { concurrency: 4 });
    assert.equal(sawConcurrentBaselines, false, 'two baseline runs for one input overlapped');
  });
});

describe('the report', () => {
  it('names the provider and model it measured against', async () => {
    const { provider } = spy(() => 'payment');
    const report = await pruneExamples(PROMPT, ['a'], provider);
    assert.equal(report.provider, 'spy');
    assert.equal(report.model, 'spy-1');
  });

  it('reports every example, in prompt order, with its token count', async () => {
    const { provider } = spy(() => 'payment');
    const report = await pruneExamples(PROMPT, ['a'], provider);
    const examples = findExamples(PROMPT, estimateTokens);

    assert.equal(report.contributions.length, examples.length);
    assert.deepEqual(
      report.contributions.map((c) => c.index),
      examples.map((_, index) => index),
    );
    for (const contribution of report.contributions) {
      assert.ok(contribution.tokens > 0, `example ${contribution.index} has no tokens`);
    }
  });
});
