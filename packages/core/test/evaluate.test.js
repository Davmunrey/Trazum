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

describe('measuring a route rather than a rewrite', () => {
  /**
   * The other axis, and it needed no new yardstick.
   *
   * `profile` prices a route exactly — the same tokens at a cheaper model's rate —
   * and can say nothing whatever about whether the cheaper model still does the
   * job. So the report printed a figure and a homework assignment, and homework
   * does not get done.
   *
   * The measurement is the same one that judges a rewrite, with the candidate
   * answer taken from a different model instead of a different prompt: the
   * baseline still runs **twice on the original model**, so the question becomes
   * "does the cheaper model agree with the expensive one more closely than the
   * expensive one agrees with itself?" — the model's own noise floor, measured on
   * the same cases in the same run, rather than a threshold somebody picked.
   */

  const twoProviders = () => {
    const original = scriptedProvider(() => 'the original answer');
    const candidate = scriptedProvider(() => 'the original answer');
    original.model = 'claude-opus-5';
    candidate.model = 'claude-sonnet-5';
    return { original, candidate };
  };

  it('sends the baseline to the original and the candidate to the cheaper model', async () => {
    /**
     * Two calls on the expensive model and one on the cheap one, per case. Getting
     * this backwards would measure the *cheap* model's variance and judge the
     * expensive one against it — a yardstick from the wrong instrument.
     */
    const { original, candidate } = twoProviders();
    const report = await evaluate('a prompt {{x}}', 'a prompt {{x}}', ['one', 'two'], original, {
      candidateProvider: candidate,
      concurrency: 1,
    });

    assert.equal(original.calls.length, 4, 'the baseline did not run twice per case');
    assert.equal(candidate.calls.length, 2, 'the candidate did not answer once per case');
    assert.equal(report.callsMade, 6);
  });

  it('reports which model each side came from', async () => {
    // A report that named one model could not say what it had compared, and the
    // whole decision is which of the two you keep paying for.
    const { original, candidate } = twoProviders();
    const report = await evaluate('p', 'p', ['one'], original, { candidateProvider: candidate });

    assert.equal(report.model, 'claude-opus-5');
    assert.equal(report.candidateModel, 'claude-sonnet-5');
  });

  it('leaves the ordinary comparison naming one model twice', async () => {
    // No candidate provider is the rewrite question, where both answers come from
    // the same model. Reporting a different candidate there would be an invention.
    const provider = scriptedProvider(() => 'same');
    const report = await evaluate('before', 'after', ['one'], provider);
    assert.equal(report.candidateModel, report.model);
  });

  it('judges the cheaper model against the expensive one\'s own noise, not against agreement', async () => {
    /**
     * The original disagrees with itself here — two different answers to the same
     * case — and the candidate matches the first exactly. A verdict built on raw
     * agreement would call a perfect match a pass regardless; this one has to
     * survive the comparison with a baseline that is itself unstable.
     */
    let n = 0;
    const original = scriptedProvider(() => (n++ % 2 === 0 ? 'answer one' : 'a completely different reply'));
    const candidate = scriptedProvider(() => 'answer one');
    original.model = 'claude-opus-5';
    candidate.model = 'claude-haiku-4-5';

    const report = await evaluate('p', 'p', ['one'], original, {
      candidateProvider: candidate,
      concurrency: 1,
    });

    assert.ok(report.crossAgreement > report.selfAgreement, 'the yardstick was not the baseline variance');
    assert.notEqual(report.verdict, 'diverges', 'a candidate inside the noise was called a divergence');
  });
});
