import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { evaluate, fillPrompt, verdictFor } from '../dist/index.js';

/**
 * Provider that answers from a script, and records what it was asked.
 * `answers` is keyed by the prompt it receives, so a test can make the
 * original and the optimised prompt behave differently on purpose.
 */
function scriptedProvider(answerFor) {
  const seen = [];
  return {
    name: 'fake',
    model: 'fake-1',
    calls: seen,
    async complete({ system, user }) {
      seen.push({ system, user });
      return answerFor(system, seen.length);
    },
  };
}

describe('filling a prompt with a case input', () => {
  it('substitutes the first placeholder', () => {
    assert.equal(
      fillPrompt('Classify {{query}} into a category.', 'my order is late'),
      'Classify my order is late into a category.',
    );
  });

  it('substitutes only the first when there are several', () => {
    const filled = fillPrompt('{{a}} then {{b}}', 'X');
    assert.equal(filled, 'X then {{b}}');
  });

  it('appends when the prompt has no placeholder', () => {
    assert.equal(fillPrompt('Classify this.', 'my order is late'), 'Classify this.\n\nmy order is late');
  });

  it('substituting is what a template author actually meant', () => {
    // Appending to a template would test a prompt nobody runs.
    const filled = fillPrompt('Answer {{q}} briefly.', 'why');
    assert.ok(!filled.includes('{{q}}'));
    assert.ok(!filled.endsWith('why'));
  });
});

describe('verdicts are relative to the model own variance', () => {
  it('calls a perfect match indistinguishable', () => {
    assert.equal(verdictFor(0.8, 1), 'indistinguishable');
  });

  it('does not blame the prompt for the model being noisy', () => {
    // The headline case: 0.85 cross-agreement looks alarming until you see the
    // original manages 0.86 against itself.
    assert.equal(verdictFor(0.86, 0.85), 'within-noise');
  });

  it('flags a real divergence', () => {
    // The model is consistent with itself and much less so with the rewrite.
    assert.equal(verdictFor(0.95, 0.6), 'diverges');
  });

  it('refuses to judge when the model cannot agree with itself', () => {
    // A confident verdict off an inconsistent baseline would be worse than
    // admitting the test does not work here.
    assert.equal(verdictFor(0.3, 0.28), 'inconclusive');
    assert.equal(verdictFor(0.2, 0.9), 'inconclusive');
  });
});

describe('evaluation', () => {
  it('runs the original twice and the optimised once, per case', async () => {
    // Pinned to one case at a time: with cases in flight together the calls
    // interleave, which is correct but says nothing about the order *within*
    // a case, and that order is what this test is about.
    const provider = scriptedProvider(() => 'same answer');
    const report = await evaluate('Original {{q}}', 'Optimised {{q}}', ['a', 'b'], provider, {
      concurrency: 1,
    });

    assert.equal(report.callsMade, 6);
    assert.equal(provider.calls.length, 6);
    assert.equal(report.cases.length, 2);

    // Two originals then one optimised, for each case.
    const kinds = provider.calls.map((c) => (c.system.startsWith('Original') ? 'orig' : 'opt'));
    assert.deepEqual(kinds, ['orig', 'orig', 'opt', 'orig', 'orig', 'opt']);
  });

  it('runs cases concurrently by default', async () => {
    // The baseline pair is sequential within a case, but cases themselves
    // overlap — otherwise a twenty-case set is a coffee break.
    let inFlight = 0;
    let peak = 0;
    const provider = {
      name: 'fake',
      model: 'fake-1',
      async complete() {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight--;
        return 'answer';
      },
    };
    await evaluate('A {{q}}', 'B {{q}}', ['a', 'b', 'c', 'd', 'e', 'f'], provider);
    assert.ok(peak > 1, 'cases should overlap');
    assert.ok(peak <= 3, `default concurrency exceeded: ${peak}`);
  });

  it('reports indistinguishable when the answers never change', async () => {
    const provider = scriptedProvider(() => 'the same answer every time');
    const report = await evaluate('A {{q}}', 'B {{q}}', ['x', 'y', 'z'], provider);

    assert.equal(report.selfAgreement, 1);
    assert.equal(report.crossAgreement, 1);
    assert.equal(report.verdict, 'indistinguishable');
  });

  it('does not blame the optimisation for noise the original already had', async () => {
    // Every call returns something slightly different, regardless of prompt.
    let n = 0;
    const provider = scriptedProvider(() => `the answer is broadly this with variation ${n++ % 3}`);
    const report = await evaluate('A {{q}}', 'B {{q}}', ['x', 'y', 'z', 'w'], provider);

    assert.ok(report.selfAgreement < 1, 'the fixture should be noisy');
    assert.ok(
      ['within-noise', 'indistinguishable'].includes(report.verdict),
      `noise attributed to the prompt: ${report.verdict} (self ${report.selfAgreement}, cross ${report.crossAgreement})`,
    );
  });

  it('catches an optimisation that genuinely changed the answer', async () => {
    const provider = scriptedProvider((system) =>
      system.startsWith('Original')
        ? 'category: shipping, escalate to a human immediately'
        : 'completely different: refund issued without review',
    );
    const report = await evaluate('Original {{q}}', 'Optimised {{q}}', ['a', 'b', 'c'], provider);

    assert.equal(report.selfAgreement, 1, 'the original is perfectly consistent here');
    assert.ok(report.crossAgreement < 0.6);
    assert.equal(report.verdict, 'diverges');
  });

  it('keeps case order regardless of concurrency', async () => {
    const provider = scriptedProvider((_system, call) => `answer ${call}`);
    const report = await evaluate(
      'A {{q}}',
      'B {{q}}',
      ['first', 'second', 'third', 'fourth'],
      provider,
      { concurrency: 4 },
    );
    assert.deepEqual(
      report.cases.map((c) => c.input),
      ['first', 'second', 'third', 'fourth'],
    );
  });

  it('reports the call count so the bill is never a surprise', async () => {
    const provider = scriptedProvider(() => 'x');
    const report = await evaluate('A {{q}}', 'B {{q}}', ['1', '2', '3', '4', '5'], provider);
    assert.equal(report.callsMade, 15);
  });

  it('handles an empty case list without calling the provider', async () => {
    const provider = scriptedProvider(() => 'x');
    const report = await evaluate('A', 'B', [], provider);
    assert.equal(provider.calls.length, 0);
    assert.equal(report.callsMade, 0);
    assert.equal(report.cases.length, 0);
  });

  it('lets a provider error surface', async () => {
    const provider = {
      name: 'fake',
      model: 'fake-1',
      async complete() {
        throw new Error('endpoint responded 429');
      },
    };
    await assert.rejects(() => evaluate('A {{q}}', 'B {{q}}', ['x'], provider), /429/);
  });
});
