import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { readDroppedVerdict, verdictMatchesSlice, UNLABELLED } from '../dist/index.js';

/**
 * The bridge between the bill and the measurement.
 *
 * The bill can price a route exactly and can say nothing about whether the
 * cheaper model still does the job. `trazum route` answers that, where the
 * credential is, and writes the answer out as a contract. This reads it back.
 *
 * The whole feature is a pairing, so the tests are mostly about refusing to
 * pair: a verdict shown beside the wrong slice is a number describing
 * something other than what was measured, which is the fault this repository
 * keeps finding in itself.
 */

const document = (over = {}) =>
  JSON.stringify({
    schemaVersion: 1,
    slice: {
      label: 'chat',
      model: 'claude-opus-5',
      modelName: 'Claude Opus 5',
      calls: 120,
      spentUsd: 40,
      route: { candidate: { id: 'claude-haiku-4-5', displayName: 'Claude Haiku 4.5' }, savingUsd: 31.5 },
      batch: null,
      combinedUsd: 31.5,
      shareOfBill: 0.62,
    },
    evaluation: {
      provider: 'anthropic',
      model: 'claude-opus-5',
      candidateModel: 'claude-haiku-4-5',
      verdict: 'indistinguishable',
      selfAgreement: 0.94,
      crossAgreement: 0.92,
      callsMade: 9,
      cases: [
        { selfSimilarity: 0.94, crossSimilarity: 0.92 },
        { selfSimilarity: 0.95, crossSimilarity: 0.91 },
        { selfSimilarity: 0.93, crossSimilarity: 0.93 },
      ],
    },
    ...over,
  });

const slice = (over = {}) => ({
  label: 'chat',
  model: 'claude-opus-5',
  route: { candidate: { id: 'claude-haiku-4-5' } },
  ...over,
});

describe('reading a dropped routing measurement', () => {
  it('reads the verdict, the two models and the workload it was measured on', () => {
    const reading = readDroppedVerdict(document());
    assert.equal(reading?.kind, 'verdict');
    assert.deepEqual(reading.verdict, {
      label: 'chat',
      model: 'claude-opus-5',
      candidateModel: 'claude-haiku-4-5',
      verdict: 'indistinguishable',
      selfAgreement: 0.94,
      crossAgreement: 0.92,
      cases: 3,
      callsMade: 9,
      savingUsd: 31.5,
    });
  });

  it('counts the cases rather than carrying them, so a two-case verdict cannot pose as a hundred', () => {
    const two = readDroppedVerdict(
      document({
        evaluation: {
          provider: 'anthropic',
          model: 'claude-opus-5',
          candidateModel: 'claude-haiku-4-5',
          verdict: 'diverges',
          selfAgreement: 0.9,
          crossAgreement: 0.4,
          callsMade: 6,
          cases: [{ selfSimilarity: 0.9, crossSimilarity: 0.4 }, { selfSimilarity: 0.9, crossSimilarity: 0.4 }],
        },
      }),
    );
    assert.equal(two.verdict.cases, 2);
    assert.equal(two.verdict.verdict, 'diverges');
  });

  it('returns null for a file that is something else entirely', () => {
    /**
     * Not a refusal: a usage log dropped on a surface that also reads
     * verdicts is a usage log, and a bridge that refused it in its own words
     * would take the file away from the code that can price it.
     */
    assert.equal(readDroppedVerdict('{"model":"claude-opus-5","usage":{"input_tokens":10}}'), null);
    assert.equal(readDroppedVerdict('not json at all'), null);
    assert.equal(readDroppedVerdict('[1,2,3]'), null);
    assert.equal(readDroppedVerdict('{"schemaVersion":1,"total":{"calls":3}}'), null);
  });

  it('refuses a document of the right shape that the contract rejects, and names what is missing', () => {
    const withoutSlice = JSON.parse(document());
    delete withoutSlice.slice;
    const reading = readDroppedVerdict(JSON.stringify(withoutSlice));
    assert.equal(reading?.kind, 'refusal');
    // The contract's own sentence, not a second opinion written in the bridge.
    assert.match(reading.because, /slice/);
    assert.notEqual(reading.because.trim(), '', 'a refusal with nothing after it is indistinguishable from a bug');
  });

  it('refuses when the evaluation names no models, which is a document nothing can be set beside', () => {
    const thin = readDroppedVerdict(
      document({ evaluation: { verdict: 'indistinguishable', selfAgreement: 0.9 } }),
    );
    assert.equal(thin?.kind, 'refusal');
    assert.match(thin.because, /candidate model|model/);
  });

  it('turns the unlabelled sentinel back into an absence', () => {
    const unlabelled = readDroppedVerdict(
      document({
        slice: {
          label: UNLABELLED,
          model: 'claude-opus-5',
          route: { candidate: { id: 'claude-haiku-4-5' }, savingUsd: 4 },
        },
      }),
    );
    assert.equal(unlabelled.verdict.label, null, 'the profile sentinel must not leak into a caption');
  });

  it('reports a missing saving as an absence, never as zero', () => {
    const noRoute = readDroppedVerdict(
      document({ slice: { label: 'chat', model: 'claude-opus-5', route: null } }),
    );
    assert.equal(noRoute.verdict.savingUsd, null, 'a saving nobody measured is not a saving of nothing');
  });
});

describe('pairing a verdict with a slice of the bill', () => {
  const verdict = readDroppedVerdict(document()).verdict;

  it('pairs the slice it was measured on', () => {
    assert.equal(verdictMatchesSlice(verdict, slice()), true);
  });

  it('refuses a different workload on the same model', () => {
    /**
     * The plant that matters. A log with `chat` and `summarise` both on
     * Opus offers both the same route, and matching on the model alone
     * would show one workload's measurement against the other's saving.
     */
    assert.equal(verdictMatchesSlice(verdict, slice({ label: 'summarise' })), false);
  });

  it('refuses the same workload measured against a different candidate', () => {
    assert.equal(
      verdictMatchesSlice(verdict, slice({ route: { candidate: { id: 'claude-sonnet-5' } } })),
      false,
    );
  });

  it('refuses a slice whose calls go to a different model than the one measured', () => {
    assert.equal(verdictMatchesSlice(verdict, slice({ model: 'claude-sonnet-5' })), false);
  });

  it('refuses a slice with no route to be right or wrong about', () => {
    assert.equal(verdictMatchesSlice(verdict, slice({ route: null })), false);
  });

  it('pairs an unlabelled verdict with the unlabelled slice, and with nothing else', () => {
    const bare = readDroppedVerdict(
      document({
        slice: {
          label: UNLABELLED,
          model: 'claude-opus-5',
          route: { candidate: { id: 'claude-haiku-4-5' }, savingUsd: 4 },
        },
      }),
    ).verdict;
    assert.equal(verdictMatchesSlice(bare, slice({ label: UNLABELLED })), true);
    assert.equal(verdictMatchesSlice(bare, slice({ label: 'chat' })), false);
  });
});

describe('what the bridge refuses to carry', () => {
  it('carries no prompt text, no case input and no model answer', () => {
    /**
     * The document has not carried these since the JSON-text sweep, and this
     * is the guard that keeps the bridge from becoming the reason to put them
     * back. A document with the old rich `cases[]` is read for its counts and
     * its scores; every string in it stays behind.
     */
    const SECRET = 'ACME-CONFIDENTIAL-Q3-PRICING';
    const rich = JSON.parse(document());
    rich.evaluation.cases = [
      {
        input: `Summarise ${SECRET}`,
        baseline: [`about ${SECRET}`, `still ${SECRET}`],
        optimized: `cheaper, also ${SECRET}`,
        selfSimilarity: 0.94,
        crossSimilarity: 0.92,
      },
    ];
    const reading = readDroppedVerdict(JSON.stringify(rich));
    assert.equal(reading?.kind, 'verdict');
    assert.ok(
      !JSON.stringify(reading.verdict).includes(SECRET),
      'the bridge carried text out of a document that happened to contain it',
    );
    // And the measurement still survives, so this is not passing by emptiness.
    assert.equal(reading.verdict.cases, 1);
    assert.equal(reading.verdict.crossAgreement, 0.92);
  });
});
