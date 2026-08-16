import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BUNDLED_CATALOGUE, billLevers, catalogueFromOverlay, profileUsage } from '../dist/index.js';

/**
 * What would actually move this bill.
 *
 * The rules recover about **1%** — measured, three tokens out of three hundred and
 * six on an ordinary support prompt. On a company spending twenty thousand a month
 * that is two hundred, and nobody installs a tool for two hundred. This module is
 * the answer: the levers that are not the prompt, priced from the same log at
 * published rates.
 *
 * Every figure below is checked against arithmetic done by hand rather than against
 * a recorded string. A snapshot of a wrong number is a test that defends the bug.
 */

// 2026-08-16 is inside Sonnet 5's introductory window ($2/$10 rather than $3/$15),
// so the date is pinned: a test that silently reprices when a promotion lapses is
// a test that will one day fail for a reason nobody changed.
const ON = new Date('2026-08-16T00:00:00Z');

const levers = (records, options = {}) =>
  billLevers(
    profileUsage(records.map((r) => JSON.stringify(r)).join('\n'), {
      catalogue: options.catalogue ?? BUNDLED_CATALOGUE,
      on: ON,
    }),
    { catalogue: options.catalogue ?? BUNDLED_CATALOGUE, on: ON, ...options },
  );

const call = (over = {}) => ({
  model: 'claude-opus-5',
  label: 'support-rag',
  usage: { input_tokens: 9000, output_tokens: 300 },
  ...over,
});

const many = (n, over) => Array.from({ length: n }, () => call(over));

describe('routing to a cheaper model', () => {
  it('prices the same tokens at the cheaper model, exactly', () => {
    /**
     * 400 calls of 9,000 input and 300 output on Opus 5 ($5/$25):
     * 3.6M input = $18.00, 120k output = $3.00, so $21.00.
     *
     * The same tokens on Sonnet 5 at its introductory $2/$10: $7.20 + $1.20 =
     * $8.40. The route is worth $12.60 — 60% of that slice, against the ~1% a
     * rules pass over the prompt file would recover.
     */
    const [slice] = levers(many(400)).slices;

    assert.equal(slice.route.candidate.id, 'claude-sonnet-5');
    assert.ok(Math.abs(slice.spentUsd - 21) < 1e-9, `spent ${slice.spentUsd}`);
    assert.ok(Math.abs(slice.route.savingUsd - 12.6) < 1e-9, `saving ${slice.route.savingUsd}`);
  });

  it('steps down one rung, not to the cheapest thing on the shelf', () => {
    /**
     * Opus 5 is `large`, so the candidate is a `mid` model — Sonnet 5 — and not
     * Haiku 4.5, which is `small` and would show a bigger number.
     *
     * The arithmetic must not lead the advice. Frontier to small is an 80% saving
     * and a different product, and a report that opens with it has chosen the
     * headline over the reader.
     */
    const [slice] = levers(many(400)).slices;
    assert.equal(slice.route.candidate.id, 'claude-sonnet-5');
    assert.notEqual(slice.route.candidate.id, 'claude-haiku-4-5');
  });

  it('never crosses a vendor', () => {
    /**
     * A cheaper model at another provider is a migration, not a routing change.
     * Pricing one as though it were a switch you could make on Tuesday is a saving
     * nobody can take — derived over the catalogue so a provider added later is
     * covered without anybody remembering to.
     */
    for (const model of BUNDLED_CATALOGUE.models) {
      const [slice] = levers(many(20, { model: model.id })).slices;
      if (!slice?.route) continue;
      const candidate = BUNDLED_CATALOGUE.byId.get(slice.route.candidate.id);
      assert.equal(
        candidate.provider,
        model.provider,
        `${model.id} was offered ${candidate.id}, which is a different vendor`,
      );
    }
  });

  it('offers nothing from the bottom of the ladder', () => {
    // Haiku 4.5 is `small`. There is no step below it, and inventing one would
    // mean recommending a model chosen by a default value.
    const [slice] = levers(many(400, { model: 'claude-haiku-4-5' })).slices;
    assert.equal(slice?.route ?? null, null);
  });

  it('refuses a candidate that could not hold these calls', () => {
    /**
     * A cheaper model that cannot fit the prompt is not cheaper, it is broken.
     * Built through an overlay so the constraint is tested rather than the
     * catalogue's current happy accident: the only `mid` model of this provider
     * has a window far below what these calls already sent.
     */
    const catalogue = catalogueFromOverlay(
      JSON.stringify({
        lastReviewed: '2026-08-16',
        models: {
          'acme-big': {
            displayName: 'Acme Big', inputPerMTok: 10, outputPerMTok: 40,
            contextWindow: 1_000_000, cacheMinTokens: 1024, tier: 'opus',
            capability: 'large', caching: 'explicit',
          },
          'acme-small': {
            displayName: 'Acme Small', inputPerMTok: 1, outputPerMTok: 4,
            contextWindow: 8_000, cacheMinTokens: 1024, tier: 'sonnet',
            capability: 'mid', caching: 'explicit',
          },
        },
      }),
    );
    // Both models are provider-less in an overlay, so they match each other.
    const [slice] = levers(many(10, { model: 'acme-big', usage: { input_tokens: 200_000, output_tokens: 100 } }), {
      catalogue,
    }).slices;
    assert.equal(slice?.route ?? null, null, 'offered a model that cannot hold the prompt');
  });
});

describe('the Batch API', () => {
  it('halves input and output, and leaves the cache lines alone', () => {
    /**
     * The published discount covers input and output. Whether it reaches cache
     * reads and writes is not something this catalogue records, so they stay at
     * full price — which understates the saving, and that is the direction to be
     * wrong in.
     */
    const [slice] = levers(
      many(400, { usage: { input_tokens: 9000, output_tokens: 300, cache_read_input_tokens: 5000 } }),
    ).slices;
    // input $18.00 + output $3.00 = $21.00 of batchable spend, halved.
    assert.ok(Math.abs(slice.batch.savingUsd - 10.5) < 1e-9, `saving ${slice.batch.savingUsd}`);
  });

  it('stays quiet where the provider sells no batch API', () => {
    // `null` is "there is no batch API", which is different from an unstated one.
    // Offering a discount nobody sells is worse than saying nothing.
    for (const id of ['kimi-k2', 'deepseek-v3', 'grok-4']) {
      const [slice] = levers(many(400, { model: id })).slices;
      assert.equal(slice?.batch ?? null, null, `${id} was offered a batch discount it does not sell`);
    }
  });
});

describe('two levers on one slice', () => {
  it('combines them by computing, never by adding', () => {
    /**
     * The fault this grouping exists for. Route was $12.60 and batch was $10.50 on
     * a slice that had spent $21.00, printed as two rows — and a reader who added
     * them got $23.10, a saving larger than the bill it came from. Impossible, and
     * in the flattering direction.
     *
     * Batching a routed call discounts the *cheaper* model: Sonnet costs $8.40, so
     * batching it saves $4.20 and the pair is worth $16.80.
     */
    const [slice] = levers(many(400)).slices;

    assert.ok(Math.abs(slice.combinedUsd - 16.8) < 1e-9, `combined ${slice.combinedUsd}`);
    assert.ok(
      slice.combinedUsd < slice.route.savingUsd + slice.batch.savingUsd,
      'the combination was a sum',
    );
  });

  it('can never save more than the slice ever cost, on any model', () => {
    /**
     * The invariant behind the whole file, checked over the catalogue rather than
     * on the one case that produced it. A saving above the spend is arithmetically
     * impossible, so any model that produces one has a pricing entry or a lever
     * that is wrong.
     */
    for (const model of BUNDLED_CATALOGUE.models) {
      for (const { combinedUsd, spentUsd } of levers(
        many(50, { model: model.id, usage: { input_tokens: 4000, output_tokens: 400, cache_read_input_tokens: 1000 } }),
      ).slices) {
        assert.ok(
          combinedUsd <= spentUsd + 1e-9,
          `${model.id}: ${combinedUsd} saved out of ${spentUsd} spent`,
        );
      }
    }
  });
});

describe('what it refuses to report', () => {
  it('prices nothing against a model it could not price at all', () => {
    // An unpriced model contributes counts and never dollars, and a lever computed
    // from a zero bill is a saving invented out of nothing.
    const { slices } = levers([call({ model: 'some-finetune-nobody-published' })]);
    assert.deepEqual(slices, []);
  });

  it('drops what is too small to act on rather than burying what is not', () => {
    /**
     * Not a judgement about small money — a judgement about attention. Thirty rows
     * worth a tenth of a percent each bury the two worth twenty.
     */
    const records = [...many(400), ...many(1, { label: 'tiny', usage: { input_tokens: 10, output_tokens: 1 } })];
    const labels = levers(records).slices.map((s) => s.label);
    assert.ok(labels.includes('support-rag'));
    assert.ok(!labels.includes('tiny'), 'a slice worth a rounding error was listed');
  });

  it('keeps a label on two models apart', () => {
    /**
     * A route is decided per model. A label spanning two of them has no single
     * answer, and pricing it against a candidate would mean applying one of the
     * two current prices to tokens that were never billed at it.
     */
    const { slices } = levers([...many(400), ...many(400, { model: 'claude-opus-4-7' })]);
    const models = new Set(slices.filter((s) => s.label === 'support-rag').map((s) => s.model));
    assert.equal(models.size, 2, 'two models under one label were merged into one decision');
  });
});

describe('the ceiling on shortening the prompt', () => {
  it('is everything that is not output, and is stated as a ceiling', () => {
    /**
     * The comparison that makes the rest of the report honest. A 1% win reported
     * without saying 1% of what is not information.
     *
     * Deliberately generous: it counts retrieved context, conversation history and
     * tool results, none of which live in a prompt file and none of which a rules
     * pass can touch. The real figure is below it, usually far below — so as a
     * ceiling it is never wrong in the direction that flatters the rules.
     */
    const { promptCeilingUsd, promptCeilingShare, totalUsd } = levers(many(400));
    // 3.6M input at $5/MTok. Output is $3.00 of the $21.00 and is excluded.
    assert.ok(Math.abs(promptCeilingUsd - 18) < 1e-9, `ceiling ${promptCeilingUsd}`);
    assert.ok(Math.abs(promptCeilingShare - 18 / 21) < 1e-9);
    assert.ok(promptCeilingUsd < totalUsd, 'a ceiling of the whole bill explains nothing');
  });

  it('is reported even when there is no lever to compare it against', () => {
    /**
     * Silence here would be the worst outcome: a bill already on the cheapest
     * model with no batch API is exactly the reader who most needs to know that
     * shortening prompts is not where their money is.
     */
    const { slices, promptCeilingUsd } = levers(many(400, { model: 'kimi-k2' }));
    assert.deepEqual(slices, [], 'kimi-k2 is bottom-of-family with no batch API');
    assert.ok(promptCeilingUsd > 0, 'the ceiling went unreported when nothing else did');
  });
});
