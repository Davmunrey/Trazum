#!/usr/bin/env node
/**
 * Every published price in the catalogue, written to one committed file, so
 * that an edit to `packages/core/src/pricing.ts` is also an edit to that file
 * (#763).
 *
 *   node scripts/price-snapshot.mjs          exit 1 unless the file is what the catalogue builds, naming each row that differs
 *   node scripts/price-snapshot.mjs write    write the file from the catalogue
 *
 * Both read the built `@trazum/core`: run `npm run build` first.
 *
 * ## What it holds, and what it does not
 *
 * A row is what `scripts/pricing-dataset.mjs` publishes: a model's input and
 * output rates, each band, service tier, period of its history and
 * promotion, the cache and batch ratios it states, the geography multiplier
 * and the web search fee. The file keeps each row's identity and value, the
 * default ratios, and each provider's review date and pages.
 *
 * `test/price-snapshot.test.js` compares the file with the catalogue. A price
 * moved by mistake fails it, and a price moved on purpose is a second diff in
 * the same pull request, one line per row, that a reviewer reads beside the
 * page and the date. That is all it says. **Held is not correct**: whether a
 * figure is the provider's is the question of the page it was read from and
 * of `scripts/price-drift.mjs`, never of this file.
 *
 * The rows come from the dataset's own builder rather than a second walk of
 * the catalogue, so a field the dataset does not know how to write stops this
 * script as well.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { ROOT, buildDocument, loadCatalogue } from './pricing-dataset.mjs';

export const SNAPSHOT = 'packages/core/test/fixtures/price-snapshot.json';

/** The snapshot of a loaded catalogue, as an object. */
export function snapshotOf(catalogue) {
  const document = buildDocument(catalogue);
  const providers = {};
  for (const provider of Object.keys(catalogue.reviewed).sort()) {
    providers[provider] = { reviewed: catalogue.reviewed[provider], sources: catalogue.sources[provider] };
  }
  return {
    about: 'Written by scripts/price-snapshot.mjs from packages/core/src/pricing.ts. Do not edit by hand: change the catalogue and run the script.',
    defaults: document.defaults,
    providers,
    rows: Object.fromEntries(document.rows.map((row) => [row.id, row.value])),
  };
}

/** The file's text: two-space JSON, so each row is one line and a diff is the list of rows that moved. */
export const snapshotText = (snapshot) => `${JSON.stringify(snapshot, null, 2)}\n`;

/** The ids of the rows that differ between two snapshots, and whether anything besides rows does. */
export function differences(committed, built) {
  const ids = new Set([...Object.keys(committed.rows ?? {}), ...Object.keys(built.rows)]);
  const rows = [...ids].filter((id) => committed.rows?.[id] !== built.rows[id]);
  const rest = ['defaults', 'providers'].filter((key) => JSON.stringify(committed[key]) !== JSON.stringify(built[key]));
  return { rows, rest };
}

async function main() {
  const [command = 'check'] = process.argv.slice(2);
  const built = snapshotOf(await loadCatalogue(ROOT));
  const path = join(ROOT, SNAPSHOT);
  if (command === 'write') {
    writeFileSync(path, snapshotText(built));
    console.log(`wrote ${SNAPSHOT}: ${Object.keys(built.rows).length} rows`);
    return;
  }
  if (command !== 'check') {
    console.error('usage: node scripts/price-snapshot.mjs [check | write]');
    process.exit(2);
  }
  const committed = JSON.parse(readFileSync(path, 'utf8'));
  const { rows, rest } = differences(committed, built);
  if (rows.length === 0 && rest.length === 0) {
    console.log(`${SNAPSHOT} is what the catalogue builds: ${Object.keys(built.rows).length} rows`);
    return;
  }
  for (const id of rows) console.error(`  ${id}: ${committed.rows?.[id] ?? 'absent'} in the file, ${built.rows[id] ?? 'absent'} in the catalogue`);
  for (const key of rest) console.error(`  ${key} differ`);
  console.error(`${SNAPSHOT} is not what the catalogue builds. If the catalogue moved on purpose, run node scripts/price-snapshot.mjs write and commit both.`);
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`price snapshot: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
