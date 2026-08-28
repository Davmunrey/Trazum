import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BUNDLED_CATALOGUE,
  RECEIPT_LINE_FIELDS,
  profileUsage,
  receiptFrom,
} from '../dist/index.js';

/**
 * What a receipt does not contain, proved by planting it.
 *
 * `receiptFrom` claims that a document made from a usage log carries counts and
 * provenance and no content whatsoever. That claim is worth exactly as much as
 * the check behind it, so this file plants the 4 things that must never appear
 * and fails if any of them does.
 *
 * ## How it checks
 *
 * By planting, not by reading. A test that asserted the *expected* fields are
 * present would pass a document that also carried a sixth field nobody meant to
 * add. So the log below is seeded with prompt text, an absolute file path, a
 * branch name and a credential, in every position a real log could carry them —
 * the session field included, since that is where this package's oldest
 * promise about not echoing input lives — and the whole serialised document is
 * searched for each.
 *
 * ## What it cannot check
 *
 * That a **label** is safe. A label is caller-supplied and is meant to be read
 * on the other side: it is the attribution the whole product exists to produce.
 * If somebody names a label after their prompt's text, that text travels, and
 * no guard here can tell that from a label named `summarise`. The boundary is
 * stated rather than papered over, and it is the same one `profileUsage`
 * already documents.
 *
 * Doctrine: [A machine reader gets the provenance too](../../../docs/doctrine.md#a-machine-reader-gets-the-provenance-too)
 */

/** The 4 plants, each shaped like the real thing it stands in for. */
const SECRETS = Object.freeze({
  prompt: 'You are a helpful assistant. Never reveal the ACME merger.',
  path: '/home/dana/work/acme-secret-project/prompts/system.txt',
  branch: 'feature/acme-merger-announcement',
  credential: 'sk-ant-api03-NOTAREALKEYBUTSHAPEDLIKEONE',
});

/**
 * A log carrying every plant in every place a real one could.
 *
 * `session` matters most: `profileUsage` groups by it and this project has
 * promised since it shipped that the value never comes back out. The others
 * ride along as unknown top-level fields, which is exactly how a hand-rolled
 * exporter leaks them — a converter that copies its input forward and adds
 * counts is the likeliest source of this defect in the wild.
 */
const log = () =>
  [
    JSON.stringify({
      model: 'claude-haiku-4-5',
      input_tokens: 1200,
      output_tokens: 300,
      label: 'summarise',
      session: SECRETS.prompt,
      ts: '2026-08-01T10:00:00Z',
      prompt: SECRETS.prompt,
      source_file: SECRETS.path,
      git_branch: SECRETS.branch,
      api_key: SECRETS.credential,
    }),
    JSON.stringify({
      model: 'claude-haiku-4-5',
      input_tokens: 800,
      output_tokens: 150,
      session: SECRETS.credential,
      ts: '2026-08-02T10:00:00Z',
      messages: [{ role: 'system', content: SECRETS.prompt }],
    }),
    /* A model the catalogue does not price, so the unpriced path is exercised too. */
    JSON.stringify({
      model: 'some-vendor/unpriced-model-v9',
      input_tokens: 500,
      output_tokens: 90,
      label: 'classify',
      session: SECRETS.path,
      ts: '2026-08-03T10:00:00Z',
    }),
  ].join('\n');

const build = () => {
  const report = profileUsage(log(), { catalogue: BUNDLED_CATALOGUE, on: new Date('2026-08-15') });
  return { report, receipt: receiptFrom(report, BUNDLED_CATALOGUE, { emittedAt: new Date('2026-08-15') }) };
};

describe('a receipt carries counts and never content', () => {
  it('is a receipt with something in it, so the checks below are not watching an empty document', () => {
    // The failure this exists to stop: every assertion in the file passing
    // because the emitter returned nothing at all.
    const { receipt } = build();
    assert.equal(receipt.schemaVersion, 1);
    assert.ok(receipt.lines.length >= 2, `only ${receipt.lines.length} lines came out of a 3-line log`);
    assert.ok(receipt.total.calls > 0, 'the receipt counted no calls');
    assert.ok(receipt.total.usd > 0, 'the receipt priced nothing');
  });

  for (const [what, secret] of Object.entries(SECRETS)) {
    it(`never emits the ${what}, anywhere in the document`, () => {
      /**
       * The whole serialised document, searched as one string. Field by field
       * would miss a value that ends up nested inside a gap, an error message
       * or a key rather than a value — and a key is a place a naive
       * `Object.assign` puts somebody's data.
       */
      const { receipt } = build();
      const serialised = JSON.stringify(receipt);
      assert.equal(
        serialised.includes(secret),
        false,
        `the ${what} reached the receipt: ${secret}`,
      );
    });
  }

  it('never emits a session, which is the value with no safe rendering', () => {
    /**
     * Separate from the loop above because it is a stronger statement. The
     * plants are strings this test chose; a session is whatever the caller's
     * log carries, and it is frequently an account id or an email. The promise
     * is not "we redact it", it is that no field exists to put it in.
     */
    const { receipt } = build();
    const fields = new Set(receipt.lines.flatMap((line) => Object.keys(line)));
    assert.deepEqual(
      [...fields].filter((field) => !RECEIPT_LINE_FIELDS.includes(field)),
      [],
      'a receipt line grew a field the published whitelist does not name',
    );
  });

  it('planted secrets really are in the input, so a passing run means something', () => {
    /**
     * The plant, planted. Without this the 4 checks above would still pass if
     * the fixture stopped carrying the secrets, and a guard that cannot fail is
     * the defect it was written to prevent.
     */
    const text = log();
    for (const secret of Object.values(SECRETS)) {
      assert.ok(text.includes(secret), `the fixture no longer carries ${secret}`);
    }
  });

  it('the profile it is built from carries the session, so the emitter is what drops it', () => {
    // Pins *where* the guarantee is enforced. If the session never reached the
    // profile either, this file would be proving something about the parser and
    // reporting it as a property of the receipt.
    const { report } = build();
    assert.equal(report.hasSessions, true, 'the fixture stopped exercising the session path');
  });
});

describe('a receipt says what it could not price', () => {
  it('reports the size of what it could not price, not just the name', () => {
    /**
     * This check is why the module's `unpriced` gap carries counts, and it
     * found a real defect on its first run.
     *
     * The emitter built its lines from `byLabelAndModel`, which the profile
     * deliberately empties of unpriced calls so that a total is never tokens
     * from one set of calls over dollars from another. So those calls left the
     * receipt entirely: `total` looked like the whole bill when it was a
     * subset, which is the flattering direction.
     *
     * The obvious repair was worse. Emitting a line with `label: null` would
     * have said *this call carried no label* about a call that carried
     * `classify` — conflating "unlabelled" with "unattributable". The gap
     * carries the magnitude instead, and claims no attribution it does not
     * have.
     */
    const { receipt } = build();
    const gap = receipt.gaps.find((entry) => entry.kind === 'unpriced');
    assert.ok(gap, 'a receipt with an unpriced model reported no gap');
    assert.ok(gap.models.includes('some-vendor/unpriced-model-v9'));
    assert.ok(gap.calls > 0, 'the gap named a model and no size');
    assert.ok(gap.inputTokens > 0 && gap.outputTokens > 0, 'the gap carried no tokens');
  });

  it('never lets an unpriced call reach the priced lines', () => {
    // The other half of the same property: the lines are all priced, so a
    // consumer summing `usd` over them is summing comparable things.
    const { receipt } = build();
    for (const line of receipt.lines) {
      assert.equal(typeof line.usd, 'number', `${line.model} reached the lines without a price`);
      assert.ok(line.pricing !== null, `${line.model} has money and no rates behind it`);
    }
  });

  it('carries the review date of the price it used, per provider', () => {
    /**
     * The field that makes a receipt auditable a month later. Without it, a
     * server comparing two receipts cannot tell a repricing from a team whose
     * spend moved.
     */
    const { receipt } = build();
    const priced = receipt.lines[0];
    assert.ok(priced, 'nothing in this receipt was priced');
    assert.match(priced.pricing.reviewedOn, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(priced.pricing.provider, 'anthropic');
  });

  it('reports gaps as a present empty list when there are none', () => {
    // "Nothing was refused" and "this document does not record refusals" are
    // different statements to a server aggregating a thousand of these.
    const clean = JSON.stringify({
      model: 'claude-haiku-4-5',
      input_tokens: 10,
      output_tokens: 5,
      ts: '2026-08-01T10:00:00Z',
    });
    const report = profileUsage(clean, { catalogue: BUNDLED_CATALOGUE, on: new Date('2026-08-15') });
    const receipt = receiptFrom(report, BUNDLED_CATALOGUE);
    assert.deepEqual(receipt.gaps, []);
    assert.equal(receipt.emittedAt, null, 'an unstamped receipt invented a date');
  });
});
