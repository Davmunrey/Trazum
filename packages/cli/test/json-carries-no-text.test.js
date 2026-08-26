import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { pruneDocument, routeDocument } from '../dist/index.js';

/**
 * `docs/json-output.md` opens with a promise: **nothing here carries a session
 * key or prompt text**. Two documents carried it anyway, and nothing said so.
 *
 * `trazum route --json` printed the whole `EvalReport`, whose `cases[]` holds
 * the caller's own case text and three model answers. `trazum prune --json`
 * printed `ExampleContribution.text` — a few-shot example, which is prompt text
 * by any reading. Neither carried a `schemaVersion`.
 *
 * `format-promises.test.js` enforces that promise over *"every document this
 * package can build — the profile, the roll-up and the prompt draft"*. Both of
 * these are built in the CLI, so they sat outside a guard whose own comment
 * describes the state they were in: a promise that quietly stops being true,
 * because nothing would say so.
 *
 * These two are tested against the builders rather than by running the
 * commands, and that is the point rather than a shortcut: reaching either
 * document for real costs provider calls and an API key, so a guard that
 * demanded a live run is a guard that would never run in CI. The builders take
 * the rich object and return the document, so the stripping is a pure function
 * a test can hand deliberately obvious text to.
 */

/** Text no document may carry, distinctive enough that a substring hit is real. */
const SECRET = 'ACME-CONFIDENTIAL-Q3-PRICING';

const evalReport = {
  provider: 'anthropic',
  model: 'claude-opus-5',
  candidateModel: 'claude-haiku-4-5',
  selfAgreement: 0.94,
  crossAgreement: 0.91,
  verdict: 'indistinguishable',
  callsMade: 6,
  cases: [
    {
      input: `Summarise ${SECRET}`,
      baseline: [`The answer mentions ${SECRET}`, `Reworded, still ${SECRET}`],
      optimized: `Cheaper model, also ${SECRET}`,
      selfSimilarity: 0.94,
      crossSimilarity: 0.91,
    },
  ],
};

const pruneReport = {
  provider: 'anthropic',
  model: 'claude-opus-5',
  selfAgreement: 0.93,
  recoverableTokens: 240,
  callsMade: 10,
  contributions: [
    { index: 0, text: `Input: ${SECRET}\nOutput: positive`, tokens: 120, agreementWithout: 0.93, verdict: 'indistinguishable' },
    { index: 1, text: 'Input: something else\nOutput: negative', tokens: 120, agreementWithout: 0.71, verdict: 'diverges' },
  ],
};

const documents = {
  'route --json': routeDocument({ label: 'chat', calls: 100 }, evalReport),
  'prune --json': pruneDocument(pruneReport),
};

describe('the CLI documents keep the promise the core documents are held to', () => {
  it('carries no prompt text, no case input and no model answer', () => {
    for (const [name, document] of Object.entries(documents)) {
      const serialised = JSON.stringify(document);
      assert.ok(
        !serialised.includes(SECRET),
        `${name} carries text from the prompt or the answers it measured`,
      );
    }
  });

  it('says which version it is, on every one of them', () => {
    for (const [name, document] of Object.entries(documents)) {
      assert.equal(document.schemaVersion, 1, `${name} carries no schemaVersion`);
    }
  });

  it('keeps the measurement that made the document worth having', () => {
    /**
     * The other half. Stripping is easy to do by deleting everything, and a
     * document with nothing in it passes the guard above perfectly.
     */
    const route = documents['route --json'];
    assert.equal(route.evaluation.verdict, 'indistinguishable');
    assert.equal(route.evaluation.crossAgreement, 0.91);
    assert.equal(route.evaluation.cases.length, 1, 'the per-case evidence was thrown away with the text');
    assert.equal(route.evaluation.cases[0].crossSimilarity, 0.91);

    const prune = documents['prune --json'];
    assert.equal(prune.recoverableTokens, 240);
    assert.equal(prune.contributions.length, 2, 'the per-example evidence went with the text');
    assert.deepEqual(
      prune.contributions.map((one) => one.index),
      [0, 1],
      'without an index nothing says which example a verdict is about',
    );
    assert.equal(prune.contributions[1].verdict, 'diverges');
  });
});
