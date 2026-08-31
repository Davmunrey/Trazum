import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { BUNDLED_CATALOGUE, MODELS, buildAdvisories, estimateTokens, isOffered } from '../dist/index.js';

/**
 * The catalogue prices models; nothing asked whether they still exist.
 *
 * `pricing-review.test.js` holds every *price* to a review date, so a figure
 * that has gone stale fails. The model **id** had no such guard, and the two
 * failures do not look alike from inside: a price that is still correct for an
 * id the provider now refuses is not an out-of-date number, it is a confident
 * answer to a question nobody can ask.
 *
 * `scripts/check-model-availability.mjs` sends one real request per priced
 * model and writes what came back to
 * `packages/core/test/fixtures/model-availability.json`. This file is the other
 * half: it holds the catalogue to that record, in both directions, offline.
 *
 * The first run found four — `gemini-2.5-pro`, `gemini-2.5-flash`,
 * `deepseek-v3` and `mistral-large-2` — two of which are still returned by
 * their provider's own model list.
 */

const ROOT = new URL('../../../', import.meta.url).pathname;
const RECORD = join(ROOT, 'packages/core/test/fixtures/model-availability.json');

const record = () => JSON.parse(readFileSync(RECORD, 'utf8'));
const byId = new Map(MODELS.map((model) => [model.id, model]));

describe('the catalogue and the availability record agree', () => {
  it('has a record with something in it, so nothing below passes on an empty file', () => {
    const found = record();
    assert.match(found.checkedOn, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(
      found.answered.length + found.refused.length >= 10,
      `only ${found.answered.length + found.refused.length} models were asked`,
    );
  });

  it('marks every refused model retired, in the provider’s own words', () => {
    for (const entry of record().refused) {
      const model = byId.get(entry.id);
      assert.ok(model, `the record refuses ${entry.id}, which the catalogue no longer prices`);
      assert.ok(
        model.retired,
        `${entry.id} was refused by its provider and the catalogue still offers it as current`,
      );
      assert.equal(
        model.retired.because,
        entry.message,
        `${entry.id} is retired for a reason that is not what the provider said`,
      );
    }
  });

  it('retires nothing the record did not see refused', () => {
    /**
     * The direction that matters more, and the one a well-meaning edit breaks.
     *
     * Marking a model retired removes it from every recommendation this product
     * makes. Doing that on a hunch — a blog post, a version number that looks
     * old — is the same class of mistake as inventing a price, in the opposite
     * direction: it withholds a real option. So `retired` may only be set for
     * an id a provider actually refused, on the record.
     */
    const refused = new Set(record().refused.map((entry) => entry.id));
    const unfounded = MODELS.filter((model) => model.retired && !refused.has(model.id)).map(
      (model) => model.id,
    );
    assert.deepEqual(
      unfounded,
      [],
      'a model is marked retired and no recorded request was ever refused for it',
    );
  });

  it('keeps a retired model priced, because its calls really happened', () => {
    // The half that is easy to get wrong by deleting the row. A usage log full
    // of a retired id records money that was genuinely spent, and a catalogue
    // that forgets the model makes its owner's own history unpriceable.
    for (const entry of record().refused) {
      const model = byId.get(entry.id);
      assert.ok(model.inputPerMTok > 0, `${entry.id} lost its input price`);
      assert.ok(model.outputPerMTok > 0, `${entry.id} lost its output price`);
    }
  });

  it('offers no retired model as something to move to', () => {
    for (const model of MODELS) {
      if (!model.retired) continue;
      assert.equal(isOffered(model), false, `${model.id} is retired and still offered`);
    }
    // And the predicate is not vacuous: something has to be offered.
    assert.ok(MODELS.filter(isOffered).length > 5, 'nothing is offered, so the check above is empty');
  });

  it('never justifies a retirement with an answer about the credential', () => {
    /**
     * The defect this guard was written from, caught in the making rather than
     * in a release.
     *
     * xAI answers `400 "Incorrect API key provided"` to a bad key — not 401 —
     * and the first version of that probe recorded `grok-4` as refused, with
     * the provider "quoting" a sentence about the key. A typo in an
     * environment variable would have retired a live model **in the
     * provider's own words**, on the record, and every downstream refusal
     * would have inherited it: `pricing.ts` copies `because` verbatim into
     * `retired`, and the reports quote that.
     *
     * The script now classifies those as unasked. This holds the property at
     * the record instead of at the function, because the record is what
     * reaches the catalogue: a future probe for a provider nobody has thought
     * of yet gets the same guard for free, which a unit test on one classifier
     * would not give.
     */
    const credential =
      /\b(api[ _-]?key|unauthori[sz]ed|authenticat|credential|invalid[ _-]?token|permission denied|forbidden)\b/i;
    for (const entry of record().refused) {
      assert.equal(
        credential.test(entry.message),
        false,
        `${entry.id} is recorded as refused by its provider, and the provider was talking about `
          + `the credential: ${JSON.stringify(entry.message)}`,
      );
    }
    /* And the same sentence must never have reached a retirement. */
    for (const model of MODELS) {
      if (model.retired === undefined) continue;
      assert.equal(
        credential.test(model.retired.because),
        false,
        `${model.id} is retired for what reads as an authentication failure`,
      );
    }
  });

  it('says what it could not ask, rather than counting silence as a pass', () => {
    /**
     * The doctrine rule this record is built on. Nothing is known about
     * `kimi-k2` or `grok-4` — and a report that listed only the answered and
     * the refused would read as a clean bill of health across a catalogue it
     * had covered two thirds of.
     *
     * **Why they are unasked has changed, and the fixture has not.** It was
     * that no probe existed for `moonshot` or `xai`; both are written now, and
     * what is missing is a key. The fixture still says the old reason because
     * it is the record of a run that happened on the day it happened, and
     * editing a past run's output to match today's code is how a record stops
     * being one. The next real run replaces it, reason and all.
     */
    const found = record();
    const asked = new Set([
      ...found.answered,
      ...found.refused.map((entry) => entry.id),
      ...found.notAsked.map((entry) => entry.id),
      ...found.expectedUnreachable.map((entry) => entry.id),
    ]);
    const missing = MODELS.map((model) => model.id).filter((id) => !asked.has(id));
    assert.deepEqual(missing, [], 'a priced model appears in no part of the record at all');
    for (const entry of found.notAsked) {
      assert.ok(entry.because.length > 5, `${entry.id} is unasked for no stated reason`);
    }
  });
});

describe('a retired model is what the reader is told about first', () => {
  const PROMPT = 'Summarise the attached quarterly report in three sentences, in plain English.';

  const usage = (model) => ({
    model,
    callsPerMonth: 1000,
    avgOutputTokens: 500,
    cacheHitRate: 0,
    batchEligible: false,
  });

  it('warns, and quotes the provider rather than paraphrasing it', () => {
    const retired = MODELS.find((model) => model.retired);
    assert.ok(retired, 'nothing is retired, so this check compares nothing');
    const advisories = buildAdvisories(PROMPT, estimateTokens(PROMPT), usage(retired.id), {
      pricing: BUNDLED_CATALOGUE,
    });
    const found = advisories.find((advisory) => advisory.id === 'model-retired');
    assert.ok(found, `no model-retired advisory for ${retired.id}`);
    assert.equal(found.severity, 'warning');
    assert.ok(found.detail.includes(retired.retired.because), 'the provider is not quoted');
    assert.ok(found.detail.includes(retired.id), 'the id that was refused is not named');
    assert.equal(found.estimatedMonthlyUsd, null, 'this is not a saving and must not carry one');
  });

  it('says nothing of the kind about a model that answers', () => {
    // The other half. A warning that fires on every model is a warning nobody
    // reads, and this one removes a model from every recommendation.
    const advisories = buildAdvisories(PROMPT, estimateTokens(PROMPT), usage('claude-opus-5'), {
      pricing: BUNDLED_CATALOGUE,
    });
    assert.equal(advisories.find((advisory) => advisory.id === 'model-retired'), undefined);
  });
});

describe('the two-part rule has one home', () => {
  it('lets no source file filter on recommendable without going through isOffered', () => {
    /**
     * `recommendable: false` was honoured at four call sites and `retired` is a
     * stronger statement that has to be honoured at the same four. Written as
     * two conditions side by side, the fifth site gets written with one of
     * them — which is how a retired model comes to be offered as a saving.
     *
     * So the filter has one home, and this fails a source file that reaches
     * around it. Proved by planting exactly that: a bare `recommendable !==
     * false` put back into `levers.ts` fails here by name.
     */
    const offenders = [];
    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(path);
          continue;
        }
        if (!entry.name.endsWith('.ts')) continue;
        const text = readFileSync(path, 'utf8');
        for (const [index, line] of text.split('\n').entries()) {
          // The definition itself is the one place the two halves are written
          // out, and it is inside `isOffered`.
          if (/\brecommendable\s*!==\s*false/.test(line) && !text.includes('export function isOffered')) {
            offenders.push(`${path.slice(ROOT.length)}:${index + 1}`);
          }
        }
      }
    };
    for (const pkg of ['core', 'cli', 'mcp']) walk(join(ROOT, 'packages', pkg, 'src'));
    walk(join(ROOT, 'apps/web'));
    assert.deepEqual(
      offenders,
      [],
      'a filter tests recommendable directly; use isOffered so retired is honoured too',
    );
  });
});
