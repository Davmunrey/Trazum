import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { after, before, describe, it } from 'node:test';

import { assetNames } from '../scripts/install-snippets.mjs';
import {
  CATALOGUE,
  CHANGELOG_FILE,
  DIRECTORY,
  MULTIPLIER_RATES,
  ROOT,
  SCHEMA_FILE,
  SITE_PATH,
  UNITS,
  WRITTEN_AFTER_RELEASE,
  buildChangelog,
  buildDocument,
  catalogueDigest,
  changesBetween,
  checkPublished,
  datasetFiles,
  loadCatalogue,
  previousOf,
  problems,
  publishedVersions,
  rowId,
  schema,
  serialise,
  validate,
} from '../scripts/pricing-dataset.mjs';
import { buildPricing } from '../scripts/release-assets.mjs';

/**
 * The price catalogue as an open dataset (#784): one document per release,
 * written by `scripts/pricing-dataset.mjs` from `packages/core/src/pricing.ts`.
 *
 * What is held here, and why each matters:
 *
 * - **It is the catalogue.** The rows and models, read back by code that
 *   shares nothing with the builder, are `MODELS` exactly: every price, band,
 *   period, service tier, promotion and ratio, and nothing else.
 * - **Every row has a page and a date**, its provider's, as the catalogue
 *   states them.
 * - **Nothing is zero, and nothing is filled.** A price of zero stops the
 *   build; an empty value is only a batch ratio's.
 * - **The published file is what the script builds.** While `pricing.ts` is
 *   the one the published document records, byte for byte.
 *
 * Reads the built `@trazum/core` (run `npm run build` first). No network.
 */

const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const clone = (value) => JSON.parse(JSON.stringify(value));
const DATE = /^\d{4}-\d{2}-\d{2}$/;

let catalogue;
let document;
let refused = null;
const scratch = mkdtempSync(join(tmpdir(), 'trazum-pricing-'));
before(async () => {
  catalogue = await loadCatalogue(ROOT);
  // Kept rather than thrown, so a catalogue the build refuses fails a named
  // test with the build's own sentence instead of cancelling the file.
  try {
    document = buildDocument(catalogue, { previous: previousOf(catalogue.version) });
  } catch (error) {
    refused = error;
  }
});
after(() => rmSync(scratch, { recursive: true, force: true }));

/** A copy of the catalogue whose models a test may change. */
const variant = (change) => {
  const models = clone(catalogue.models);
  change(models);
  return { ...catalogue, models };
};
const model = (models, id) => models.find((entry) => entry.id === id);

/**
 * The catalogue's models, read back from a document by code written apart
 * from the builder: each row put where its qualifiers say, under the field
 * its rate names. If the builder wrote a value under the wrong rate, the
 * wrong band or the wrong period, or left one out, this is not `MODELS`.
 */
function readBack(doc) {
  const models = new Map(doc.models.map((entry) => [entry.id, clone(entry)]));
  const field = { 'cache-read': 'cacheRead', 'cache-write': 'cacheWrite5m', 'cache-write-long': 'cacheWrite1h', batch: 'batch', 'batch-cache-read': 'batchCacheRead' };
  for (const row of doc.rows) {
    const entry = models.get(row.model);
    assert.ok(entry, `${row.id} prices a model that is not listed`);
    if (row.rate === 'inference-geo') {
      entry.inferenceGeoMultipliers ??= {};
      entry.inferenceGeoMultipliers[row.geo] = row.value;
      continue;
    }
    if (row.rate === 'web-search') {
      entry.webSearchPerThousandUsd = row.value;
      continue;
    }
    let holder = entry;
    if (row.until !== undefined) {
      entry.history ??= [];
      holder = entry.history.find((period) => period.until === row.until);
      if (holder === undefined) entry.history.push((holder = { until: row.until }));
    }
    if (row.serviceTier !== undefined) {
      entry.serviceTiers ??= {};
      entry.serviceTiers[row.serviceTier] ??= {};
      holder = entry.serviceTiers[row.serviceTier];
    }
    if (row.promo !== undefined) {
      entry.promo ??= clone(row.promo);
      holder = entry.promo;
    }
    if (row.band !== undefined) {
      holder.tiers ??= [];
      let band = holder.tiers.find((tier) => tier.id === row.band.id);
      if (band === undefined) holder.tiers.push((band = { id: row.band.id, when: clone(row.band.when) }));
      holder = band;
    }
    if (row.rate === 'input') holder.inputPerMTok = row.value;
    else if (row.rate === 'output') holder.outputPerMTok = row.value;
    else {
      assert.ok(field[row.rate], `${row.id}: a rate this reader does not know`);
      holder.multipliers ??= {};
      holder.multipliers[field[row.rate]] = row.value;
    }
  }
  return doc.models.map((entry) => models.get(entry.id));
}

describe('the document is the catalogue, serialised', () => {
  it('is built from the catalogue as it is, which the build does not refuse', () => {
    assert.equal(refused?.message ?? null, null);
  });

  it('reads back as MODELS, field for field', () => {
    assert.deepStrictEqual(readBack(document), clone(catalogue.models));
  });

  it('has a row for every price-bearing field the catalogue holds, and the ratios it states and no others', () => {
    // Worked out from the catalogue directly, not from the rows: a model's two
    // prices, two per band, two per period and per service tier and each of
    // their bands, two for a promotion, one per ratio, geography and fee.
    let expected = 0;
    const bands = (holder) => 2 + 2 * (holder.tiers?.length ?? 0);
    for (const entry of catalogue.models) {
      expected += bands(entry) + Object.keys(entry.multipliers ?? {}).length + (entry.promo ? 2 : 0);
      for (const period of entry.history ?? []) expected += bands(period) + Object.keys(period.multipliers ?? {}).length;
      for (const sheet of Object.values(entry.serviceTiers ?? {})) expected += bands(sheet);
      expected += Object.keys(entry.inferenceGeoMultipliers ?? {}).length + (entry.webSearchPerThousandUsd === undefined ? 0 : 1);
    }
    assert.equal(document.rows.length, expected);
    assert.equal(document.models.length, catalogue.models.length);
  });

  it('publishes the defaults the catalogue applies to a ratio a model does not state, once, and fills no row with them', () => {
    assert.deepEqual(document.defaults, { 'cache-read': 0.1, 'cache-write': 1.25, 'cache-write-long': 2, batch: 0.5 });
    for (const entry of catalogue.models.filter((candidate) => candidate.multipliers === undefined)) {
      assert.ok(!document.rows.some((row) => row.model === entry.id && Object.values(MULTIPLIER_RATES).includes(row.rate)), `${entry.id} states no ratio and has a ratio row`);
    }
  });

  it('gives every row its provider, unit, pages and date, as the catalogue states them per provider', async () => {
    const { PROVIDER_REVIEWED } = await import(pathToFileURL(join(ROOT, 'packages/core/dist/index.js')).href);
    const { PROVIDER_SOURCES } = await import(pathToFileURL(join(ROOT, 'packages/core/dist/pricing.js')).href);
    assert.equal(document.sourcesArePer, 'provider');
    for (const row of document.rows) {
      assert.equal(row.provider, model(catalogue.models, row.model).provider, row.id);
      assert.equal(row.unit, UNITS[row.rate], row.id);
      assert.ok(Array.isArray(row.sources) && row.sources.length > 0, `${row.id} has no source`);
      assert.match(row.reviewed ?? '', DATE, `${row.id} has no date`);
      assert.equal(row.reviewed, PROVIDER_REVIEWED[row.provider], row.id);
      assert.deepEqual(row.sources, [...PROVIDER_SOURCES[row.provider]], row.id);
    }
  });

  it('prices nothing at zero, and leaves a value empty only where the catalogue says a provider has no batch API', () => {
    for (const row of document.rows) {
      if (row.value === null) assert.equal(row.rate, 'batch', `${row.id} is empty`);
      else assert.ok(row.value > 0, `${row.id} is ${row.value}`);
    }
  });

  it('records the catalogue it was built from, its licence and the address of its schema', () => {
    assert.equal(document.catalogue.path, CATALOGUE);
    assert.equal(document.catalogue.sha256, catalogueDigest(read(CATALOGUE)));
    assert.equal(document.catalogue.sha256, catalogueDigest(read(CATALOGUE).replace(/\n/g, '\r\n')), 'a Windows checkout reads another digest');
    const core = JSON.parse(read('packages/core/package.json'));
    assert.deepEqual(document.licence, { spdx: core.license, url: `https://github.com/TrazumAPP/Trazum/blob/v${document.version}/LICENSE` });
    assert.equal(document.$schema, `${core.homepage}${SITE_PATH}/${SCHEMA_FILE}`);
  });
});

describe('what the build refuses', () => {
  const refuses = (change, pattern) => assert.throws(() => buildDocument(variant(change)), pattern);

  it('a model priced at zero, below zero or not at all', () => {
    refuses((models) => { models[0].inputPerMTok = 0; }, /input is 0; a price of zero/);
    refuses((models) => { models[0].outputPerMTok = -1; }, /output is -1/);
    refuses((models) => { delete models[0].outputPerMTok; }, /output is undefined/);
    refuses((models) => { model(models, 'gpt-6-astra').serviceTiers.flex.tiers[0].outputPerMTok = 0; }, /gpt-6-astra: output is 0/);
  });

  it('an empty value anywhere but a batch ratio', () => {
    refuses((models) => { model(models, 'gpt-6-astra').multipliers.cacheRead = null; }, /cache-read is empty/);
  });

  it('a provider with no date or no page', () => {
    assert.throws(() => buildDocument({ ...catalogue, reviewed: { ...catalogue.reviewed, openai: undefined } }), /provider openai has no review date/);
    assert.throws(() => buildDocument({ ...catalogue, sources: { ...catalogue.sources, openai: [] } }), /provider openai has no page/);
    refuses((models) => { delete models[0].provider; }, /names no provider/);
  });

  it('a field of the catalogue it does not know how to write, anywhere in a model', () => {
    refuses((models) => { models[0].regionalPerMTok = 3; }, /has "regionalPerMTok", which the dataset does not know how to write/);
    refuses((models) => { model(models, 'gpt-6-astra').multipliers.cacheWrite24h = 3; }, /multiplier "cacheWrite24h"/);
    refuses((models) => { model(models, 'gpt-6-astra').tiers[0].cachedPerMTok = 1; }, /band over-272k has "cachedPerMTok"/);
  });
});

describe('the published document', () => {
  const versions = publishedVersions();

  it('exists for the version the repository is at', () => {
    assert.ok(versions.includes(catalogue.version), `${DIRECTORY}/${catalogue.version}.json is missing: the release did not write it`);
  });

  it('is exactly what the script builds, while the catalogue is the one it records', (t) => {
    const published = JSON.parse(read(`${DIRECTORY}/${catalogue.version}.json`));
    if (published.catalogue.sha256 !== catalogue.sha256) {
      // The catalogue moved after this version was published; the next
      // release writes the next document, and this one stays as released.
      t.diagnostic(`${CATALOGUE} has changed since ${catalogue.version}'s document was written; the next release writes the next one`);
      return;
    }
    assert.equal(read(`${DIRECTORY}/${catalogue.version}.json`), serialise(document), 'the published document is not what the catalogue builds: run node scripts/pricing-dataset.mjs to see what it builds');
    assert.deepEqual(checkPublished(catalogue), { ok: true, path: join(DIRECTORY, `${catalogue.version}.json`), reason: '' });
  });

  it('every published version is valid, named for its version, and lists what changed since the one before it', () => {
    let previous = null;
    for (const version of versions) {
      const published = JSON.parse(read(`${DIRECTORY}/${version}.json`));
      assert.deepEqual(problems(published, catalogue.homepage), [], version);
      assert.equal(published.version, version);
      assert.deepEqual(published.changes, changesBetween(previous, published), `${version}'s changes are not what moved since ${previous?.version ?? 'nothing'}`);
      const ids = (doc) => new Set(doc.rows.map((row) => row.id));
      if (previous !== null) {
        assert.deepEqual(published.changes.rows.added, [...ids(published)].filter((id) => !ids(previous).has(id)));
        assert.deepEqual(published.changes.rows.removed, [...ids(previous)].filter((id) => !ids(published).has(id)));
      }
      for (const row of published.rows) {
        assert.ok(row.sources.length > 0 && DATE.test(row.reviewed), `${version}: ${row.id} has no source or no date`);
        assert.ok(row.value === null ? row.rate === 'batch' : row.value > 0, `${version}: ${row.id} is ${row.value}`);
      }
      previous = published;
    }
  });

  it('has its schema and its changelog as the script writes them from the published files', () => {
    assert.equal(read(`${DIRECTORY}/${SCHEMA_FILE}`), `${JSON.stringify(schema(catalogue.homepage), null, 2)}\n`);
    const texts = Object.fromEntries(versions.map((version) => [version, read(`${DIRECTORY}/${version}.json`)]));
    const changelog = JSON.parse(read(`${DIRECTORY}/${CHANGELOG_FILE}`));
    assert.equal(read(`${DIRECTORY}/${CHANGELOG_FILE}`), `${JSON.stringify(buildChangelog(texts, catalogue.homepage), null, 2)}\n`);
    assert.deepEqual(changelog.versions.map((entry) => entry.version), [...versions].reverse(), 'the changelog is not newest first, or lists another set');
    for (const entry of changelog.versions) {
      assert.equal(entry.url, `${catalogue.homepage}${SITE_PATH}/${entry.version}.json`);
      const asset = `https://github.com/TrazumAPP/Trazum/releases/download/v${entry.version}/${assetNames(entry.version).pricing}`;
      assert.equal(entry.releaseAsset, WRITTEN_AFTER_RELEASE.includes(entry.version) ? null : asset);
    }
  });

  it('is served by the site from its public folder, at the address the document and the changelog give', () => {
    assert.ok(DIRECTORY.startsWith('apps/web/public/'), 'the site does not serve this folder');
    assert.equal(`/${DIRECTORY.slice('apps/web/public/'.length)}`, SITE_PATH);
  });

  it('is copied as the release asset only once it is checked, byte for byte', async () => {
    const out = join(scratch, 'assets');
    const path = `${DIRECTORY}/${catalogue.version}.json`;
    if (JSON.parse(read(path)).catalogue.sha256 !== catalogue.sha256) {
      await assert.rejects(buildPricing(out), /is not what the catalogue at this commit builds/);
      return;
    }
    const target = await buildPricing(out);
    assert.equal(target, join(out, `trazum-pricing-${catalogue.version}.json`));
    assert.equal(readFileSync(target, 'utf8'), read(path));
  });
});

describe('what a check of a document catches', () => {
  const planted = (change) => {
    const doc = clone(document);
    change(doc);
    return problems(doc, catalogue.homepage);
  };

  it('a row without a date, without a source, at zero, empty, in another unit or under another id', () => {
    assert.ok(planted((doc) => { delete doc.rows[0].reviewed; }).some((line) => line.includes('has no "reviewed"')));
    assert.ok(planted((doc) => { doc.rows[0].sources = []; }).some((line) => line.includes('fewer than 1')));
    assert.ok(planted((doc) => { doc.rows[0].value = 0; }).some((line) => line.includes('is not above 0')));
    assert.ok(planted((doc) => { doc.rows[0].value = null; }).some((line) => line.includes('only a batch ratio may be')));
    assert.ok(planted((doc) => { doc.rows[0].unit = 'usd-per-thousand-searches'; }).some((line) => line.includes('is in usd-per-thousand-searches')));
    assert.ok(planted((doc) => { doc.rows[1].id = doc.rows[0].id; }).some((line) => line.includes('appears twice')));
    assert.ok(planted((doc) => { doc.rows[0].provider = 'openai'; }).some((line) => line.includes('the model is anthropic')));
  });

  it('a value that differs from the catalogue, which the schema cannot see and the comparison with the build does', () => {
    const doc = clone(document);
    doc.rows[0].value += 1;
    assert.deepEqual(problems(doc, catalogue.homepage), [], 'a plausible wrong price is a valid document');
    assert.notEqual(serialise(doc), serialise(document));
    assert.notDeepEqual(readBack(doc), clone(catalogue.models));
  });

  it('the validator reads only the keywords the schema uses, and refuses a schema that grew one', () => {
    assert.throws(() => validate({ oneOf: [] }, 1), /"oneOf", which validate\(\) does not read/);
    assert.deepEqual(validate({ type: 'integer', exclusiveMinimum: 0 }, 2), []);
    assert.equal(validate({ type: 'integer' }, 2.5).length, 1);
    assert.equal(validate({ type: ['number', 'null'], exclusiveMinimum: 0 }, null).length, 0);
    // A pattern is never compiled from the document under check: only the
    // ones the schema already names, from literals (Codacy, PR #809).
    assert.deepEqual(validate({ type: 'string', pattern: '^https://' }, 'https://example.org'), []);
    assert.equal(validate({ type: 'string', pattern: '^https://' }, 'http://example.org').length, 1);
    assert.throws(() => validate({ type: 'string', pattern: '(a+)+$' }, 'aaaa'), /no compiled pattern for "\(a\+\)\+\$"/);
  });

  it('every row id is the one its fields make', () => {
    for (const row of document.rows) assert.equal(row.id, rowId(row));
    assert.equal(rowId({ model: 'm', rate: 'input', serviceTier: 'flex', band: { id: 'b' }, until: 'u', promo: {}, geo: 'us' }), 'm:input:tier=flex:band=b:until=u:promo:geo=us');
  });
});

describe('versions', () => {
  it('a version published with something else is never rewritten', () => {
    const root = join(scratch, 'rewritten');
    mkdirSync(join(root, DIRECTORY), { recursive: true });
    const other = clone(document);
    other.rows[0].value += 1;
    writeFileSync(join(root, DIRECTORY, `${catalogue.version}.json`), serialise(other));
    assert.throws(() => datasetFiles(catalogue, { root }), /is published and says something else/);
  });

  it('the next version lists, against the last published file, exactly what moved in the catalogue', () => {
    const root = join(scratch, 'next');
    mkdirSync(join(root, DIRECTORY), { recursive: true });
    writeFileSync(join(root, DIRECTORY, `${catalogue.version}.json`), serialise(document));
    // One price moved, one model gone, and one provider re-read: worked out by
    // hand from what was changed below, not from what the builder printed.
    const moved = variant((models) => {
      model(models, 'claude-fable-5-2').inputPerMTok = 9;
      models.splice(models.findIndex((entry) => entry.id === 'mistral-small-2603'), 1);
    });
    moved.reviewed = { ...catalogue.reviewed, xai: '2026-11-30' };
    const files = datasetFiles(moved, { version: '99.0.0', root });
    const next = JSON.parse(files[join(DIRECTORY, '99.0.0.json')]);
    assert.equal(next.changes.since, catalogue.version);
    assert.deepEqual(next.changes.rows.added, []);
    assert.deepEqual(next.changes.rows.removed, document.rows.filter((row) => row.model === 'mistral-small-2603').map((row) => row.id));
    const xai = document.rows.filter((row) => row.provider === 'xai');
    assert.equal(next.changes.rows.changed.length, 1 + xai.length);
    assert.deepEqual(next.changes.rows.changed.find((entry) => entry.id === 'claude-fable-5-2:input'), { id: 'claude-fable-5-2:input', fields: { value: { from: 8, to: 9 } } });
    assert.deepEqual(next.changes.rows.changed.find((entry) => entry.id === xai[0].id).fields, { reviewed: { from: catalogue.reviewed.xai, to: '2026-11-30' } });
    assert.deepEqual(next.changes.models.removed, ['mistral-small-2603']);
    const changelog = JSON.parse(files[join(DIRECTORY, CHANGELOG_FILE)]);
    assert.deepEqual(changelog.versions.map((entry) => entry.version), ['99.0.0', catalogue.version]);
  });
});

describe('the page for people who consume it', () => {
  const page = read('docs/pricing-dataset.md');

  it('names every rate and every unit a row can carry', () => {
    for (const [rate, unit] of Object.entries(UNITS)) {
      assert.ok(page.includes(`\`${rate}\``), `docs/pricing-dataset.md does not name the rate ${rate}`);
      assert.ok(page.includes(`\`${unit}\``), `docs/pricing-dataset.md does not name the unit ${unit}`);
    }
  });

  it('gives the addresses as the script builds them', () => {
    assert.ok(page.includes(`${catalogue.homepage}${SITE_PATH}/`), 'the site address is not on the page');
    assert.ok(page.includes(SCHEMA_FILE) && page.includes(CHANGELOG_FILE));
    assert.ok(page.includes('trazum-pricing-<version>.json') && assetNames('1.2.3').pricing === 'trazum-pricing-1.2.3.json');
  });
});
