import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { ROOT, loadCatalogue } from '../../../scripts/pricing-dataset.mjs';
import { SNAPSHOT, differences, snapshotOf, snapshotText } from '../../../scripts/price-snapshot.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Every published price is in a committed file written from the catalogue
 * (#763). A sample of 69 prices found 19 that could move with no test
 * failing. This holds all of them at once: an edit to `pricing.ts` that the
 * file does not repeat fails here. It says nothing about whether a price is
 * right; that is the page it was read from, and the drift check.
 */
describe('the committed price snapshot', () => {
  it('is what the catalogue builds, row for row', async () => {
    const built = snapshotOf(await loadCatalogue(ROOT));
    const committed = JSON.parse(readFileSync(join(ROOT, SNAPSHOT), 'utf8'));
    const { rows, rest } = differences(committed, built);
    const shown = rows.slice(0, 10).map((id) => `${id}: ${committed.rows?.[id] ?? 'absent'} in the file, ${built.rows[id] ?? 'absent'} in the catalogue`);
    assert.deepEqual(
      [...shown, ...rest.map((key) => `${key} differ`)],
      [],
      `${SNAPSHOT} is not what the catalogue builds (${rows.length} row(s)). If the catalogue moved on purpose, run node scripts/price-snapshot.mjs write and commit both.`,
    );
  });

  it('is written by the script, byte for byte', async () => {
    const built = snapshotOf(await loadCatalogue(ROOT));
    assert.equal(readFileSync(join(ROOT, SNAPSHOT), 'utf8'), snapshotText(built));
  });

  it('lives where this test reads it, and holds the catalogue whole', async () => {
    assert.equal(join(HERE, 'fixtures', 'price-snapshot.json'), join(ROOT, SNAPSHOT));
    const built = snapshotOf(await loadCatalogue(ROOT));
    assert.ok(Object.keys(built.rows).length >= 500, `only ${Object.keys(built.rows).length} rows`);
    assert.ok(Object.keys(built.providers).length >= 5);
  });

  it('names a moved row, an added one and a removed one', () => {
    const before = { defaults: { a: 1 }, providers: { p: 1 }, rows: { kept: 1, moved: 2, gone: 3 } };
    const after = { defaults: { a: 1 }, providers: { p: 2 }, rows: { kept: 1, moved: 2.5, added: 4 } };
    assert.deepEqual(differences(before, after), { rows: ['moved', 'gone', 'added'], rest: ['providers'] });
  });
});
