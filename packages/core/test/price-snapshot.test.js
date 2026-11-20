import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { ROOT, loadCatalogue } from '../../../scripts/pricing-dataset.mjs';
import { SNAPSHOT, differences, problems, snapshotOf, snapshotText } from '../../../scripts/price-snapshot.mjs';

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

describe('node scripts/price-snapshot.mjs', () => {
  const run = (...args) => spawnSync(process.execPath, [join(ROOT, 'scripts/price-snapshot.mjs'), ...args], { encoding: 'utf8' });

  it('writes a file that check then passes, and fails it once a row moves or the order changes', () => {
    const work = mkdtempSync(join(tmpdir(), 'trazum-snapshot-'));
    const file = join(work, 'snapshot.json');
    try {
      const write = run('write', '--file', file);
      assert.equal(write.status, 0, write.stderr);
      assert.equal(readFileSync(file, 'utf8'), readFileSync(join(ROOT, SNAPSHOT), 'utf8'));
      const check = run('--file', file);
      assert.equal(check.status, 0, check.stderr);
      assert.match(check.stdout, /is what the catalogue builds: \d+ rows/);

      const text = readFileSync(file, 'utf8');
      const snapshot = JSON.parse(text);
      const [first] = Object.keys(snapshot.rows);
      snapshot.rows[first] += 1;
      writeFileSync(file, snapshotText(snapshot));
      const moved = run('check', '--file', file);
      assert.equal(moved.status, 1);
      assert.ok(moved.stderr.includes(`  ${first}: `), moved.stderr);

      // The same rows in another order: the test refuses it byte for byte, and so does check.
      const lines = text.split('\n');
      const at = lines.findIndex((line) => line.startsWith(`    "${first}"`));
      [lines[at], lines[at + 1]] = [lines[at + 1], lines[at]];
      writeFileSync(file, lines.join('\n'));
      const reordered = run('check', '--file', file);
      assert.equal(reordered.status, 1);
      assert.match(reordered.stderr, /the rows are the same, but the text is not what the script writes/);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });

  it('refuses a command it does not know', () => {
    const wrong = run('rewrite');
    assert.equal(wrong.status, 2);
    assert.match(wrong.stderr, /usage:/);
  });

  it('names a file that is not JSON', async () => {
    const built = snapshotOf(await loadCatalogue(ROOT));
    assert.deepEqual(problems(snapshotText(built), built), []);
    assert.match(problems('{', built)[0], /^the file is not JSON/);
  });
});
