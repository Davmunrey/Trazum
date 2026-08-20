import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { BUNDLED_CATALOGUE, multipliersFor } from '../dist/index.js';
import { sectionOf } from '../../../test-utils/section.mjs';

/**
 * The money table in the README, checked against the catalogue it describes.
 *
 * Six rows of hard numbers about what caching and batching cost at each
 * provider, written by hand, read by nothing. One of them was wrong: **"512 on
 * Anthropic"**, when Anthropic's cache floor is a property of the model and
 * spans 512 to 4,096. A reader on Haiku 4.5 building a 512-token prefix would
 * have been promised a saving that could never arrive, which is the one
 * direction this project says it must never be wrong in.
 *
 * Two other rows had quietly gone stale by omission rather than by error:
 * DeepSeek was missing from the cache-read row and xAI from the row saying how
 * caching starts. Nobody had written anything false about them; they had simply
 * been added to the catalogue and not to the prose, which is how a table stops
 * being a description and becomes a snapshot.
 *
 * Membership is asserted rather than counted, for the reason this repository
 * has learned nine times: a count goes wrong silently and a name does not.
 */

const README = new URL('../../../README.md', import.meta.url).pathname;
const MODELS = BUNDLED_CATALOGUE.models ?? Object.values(BUNDLED_CATALOGUE);

/** How the table writes each provider's name. */
const LABEL = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google',
  moonshot: 'Moonshot',
  deepseek: 'DeepSeek',
  xai: 'xAI',
  mistral: 'Mistral',
};

const table = () => sectionOf(readFileSync(README, 'utf8'), '## Every model you pay for by the token');

/** One row of the two-column table, by the label in its first cell. */
const row = (text, label) => {
  const found = text.match(new RegExp(`^\\| ${label} \\| (.+) \\|$`, 'm'));
  assert.ok(found, `the "${label}" row has been renamed or removed`);
  return found[1];
};

describe('the provider-facts table describes the catalogue', () => {
  it('names every provider it has a fact about', () => {
    const providers = [...new Set(MODELS.map((m) => m.provider))];
    const unlabelled = providers.filter((p) => !LABEL[p]);
    assert.deepEqual(unlabelled, [], `no README label known for: ${unlabelled.join(', ')}`);

    const text = table();
    const unmentioned = providers.filter((p) => !text.includes(LABEL[p]));
    assert.deepEqual(unmentioned, [], `priced but absent from the table: ${unmentioned.join(', ')}`);
  });

  it('puts every provider on the correct side of the cache-read split', () => {
    const text = table();
    const cacheRead = row(text, 'Cache read');

    for (const provider of new Set(MODELS.map((m) => m.provider))) {
      const models = MODELS.filter((m) => m.provider === provider);
      // A provider with no cache at all belongs in the "Prompt caching" row.
      if (models.every((m) => m.caching === 'none')) continue;

      const rates = new Set(models.map((m) => multipliersFor(m).cacheRead));
      assert.equal(rates.size, 1, `${provider} prices cache reads more than one way: ${[...rates]}`);
      const [rate] = rates;
      assert.ok(
        cacheRead.includes(LABEL[provider]),
        `${LABEL[provider]} reads cache at ${rate * 100}% and the cache-read row does not name it`,
      );
    }
  });

  it('puts every provider on the correct side of the automatic/explicit split', () => {
    const text = table();
    const starts = row(text, 'How caching starts');

    for (const provider of new Set(MODELS.map((m) => m.provider))) {
      const models = MODELS.filter((m) => m.provider === provider);
      if (models.every((m) => m.caching === 'none')) continue;
      assert.ok(
        starts.includes(LABEL[provider]),
        `${LABEL[provider]} has a cache and the "How caching starts" row does not name it`,
      );
    }
  });

  it('does not attribute one cache minimum to a provider that has several', () => {
    /**
     * The defect itself. `cacheMinTokens` lives on the model, and the row that
     * summarised it by provider was reporting the smallest floor as if it were
     * the only one.
     */
    const text = table();
    const minimum = row(text, 'Cache minimum');

    for (const provider of new Set(MODELS.map((m) => m.provider))) {
      const floors = new Set(
        MODELS.filter((m) => m.provider === provider && m.caching !== 'none').map(
          (m) => m.cacheMinTokens,
        ),
      );
      if (floors.size <= 1) continue;
      const claimed = new RegExp(`[\\d,]+ on ${LABEL[provider]}\\b`);
      assert.doesNotMatch(
        minimum,
        claimed,
        `${LABEL[provider]} has ${floors.size} different cache minimums (${[...floors]
          .sort((a, b) => a - b)
          .join(', ')}) and the row states one figure for it`,
      );
    }
  });

  it('names every distinct cache minimum in the catalogue', () => {
    const text = table();
    const minimum = row(text, 'Cache minimum');
    const floors = [
      ...new Set(MODELS.filter((m) => m.caching !== 'none').map((m) => m.cacheMinTokens)),
    ].sort((a, b) => a - b);

    const missing = floors.filter((n) => !minimum.includes(n.toLocaleString('en-US')));
    assert.deepEqual(
      missing,
      [],
      `these cache minimums are in the catalogue and named nowhere in the row: ${missing.join(', ')}`,
    );
  });
});
