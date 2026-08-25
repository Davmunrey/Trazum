import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  BUNDLED_CATALOGUE,
  PricingOverlayError,
  applyPricingOverlay,
  openrouterOverlay,
  parsePricingOverlay,
  profileUsage,
  repriceProfile,
} from '@trazum/core';

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..');

/**
 * The 1.74 price card: a dropped overlay or OpenRouter response widens the
 * catalogue every figure in the Bill tab prices with — in the page, with the
 * no-fetch invariant intact, because both transformations are pure core. The
 * functional half here runs the exact pipeline the tab runs; the structural
 * half pins the arm into the component source.
 */
describe('the Bill tab reads a dropped price card', () => {
  const bill = readFileSync(join(web, 'components/Bill.tsx'), 'utf8');
  const code = bill.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

  it('still never fetches, with the card reader inside the same file', () => {
    assert.equal(/\bfetch\s*\(/.test(code), false, 'Bill.tsx contains a fetch call');
    assert.equal(/XMLHttpRequest|sendBeacon|WebSocket|FormData/.test(code), false);
  });

  it('the arm exists: detection, application, the banner and the way back', () => {
    assert.match(code, /priceCardFrom\(/);
    assert.match(code, /openrouterOverlay\(/);
    assert.match(code, /applyPricingOverlay\(/);
    assert.match(code, /t\.bill\.priceCardApplied\(/);
    assert.match(code, /t\.bill\.priceCardBad\(/);
    // Clearing the card is a visible control, not a page reload.
    assert.match(code, /setPriceCard\(null\)/);
    // And a card re-prices what is already on screen.
    assert.match(code, /\[priceCard\]/);
  });

  it('an OpenRouter response prices a model the bundled snapshot has never met', () => {
    // The user's own case: Qwen. The fixture is the OpenRouter /models shape;
    // the pipeline is exactly the tab's — transform, apply, price, what-if.
    const openrouter = {
      data: [
        {
          id: 'qwen/qwen3-coder',
          context_length: 262144,
          pricing: { prompt: '0.00000022', completion: '0.00000095' },
        },
      ],
    };
    const known = new Set(BUNDLED_CATALOGUE.models.map((model) => model.id));
    const { overlay } = openrouterOverlay(openrouter, { knownIds: known, lastReviewed: '2026-08-25' });
    const catalogue = applyPricingOverlay(BUNDLED_CATALOGUE, overlay, 'dropped price card');

    const log = JSON.stringify({
      ts: '2026-08-10T10:00:00Z',
      model: 'qwen/qwen3-coder',
      label: 'internal',
      usage: { input_tokens: 100000, output_tokens: 4000 },
    });
    // Bundled alone cannot price it; the card can, and the arithmetic checks.
    const before = profileUsage(log, { catalogue: BUNDLED_CATALOGUE });
    assert.equal(before.total.calls, 0);
    const after = profileUsage(log, { catalogue });
    assert.equal(after.total.calls, 1);
    const expected = (100000 / 1e6) * 0.22 + (4000 / 1e6) * 0.95;
    assert.ok(Math.abs(after.total.totalUsd - expected) < 1e-9);

    // And the what-if crosses vendors both ways: the Qwen bill on Haiku.
    const whatIf = repriceProfile(after, 'claude-haiku-4-5', catalogue);
    assert.ok(whatIf !== null && whatIf.slices.length === 1);
  });

  it('the config overlay shape works too, and a malformed card refuses with the parser sentence', () => {
    const overlay = parsePricingOverlay(
      JSON.stringify({
        lastReviewed: '2026-08-25',
        models: { 'my-self-hosted-model': { displayName: 'Own Qwen', inputPerMTok: 3.97, outputPerMTok: 3.97, contextWindow: 32768, cacheMinTokens: null, tier: 'unknown', capability: 'unknown' } },
      }),
      'dropped price card',
    );
    const catalogue = applyPricingOverlay(BUNDLED_CATALOGUE, overlay, 'dropped price card');
    assert.ok(catalogue.byId.has('my-self-hosted-model'));

    assert.throws(
      () => parsePricingOverlay('{"lastReviewed":"2026-08-25","models":{"x":{"inputPerMTok":-1}}}', 'dropped price card'),
      PricingOverlayError,
    );
  });

  it('a card-only drop never analyses an empty log over a live report', () => {
    assert.match(code, /if \(parts\.length > 0\) analyze\(/);
  });
});
