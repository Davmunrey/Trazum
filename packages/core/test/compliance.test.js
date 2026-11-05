import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * The compliance readiness pack stays true, or the build fails.
 *
 * A control matrix is evidence only while its evidence exists. One that names
 * a file renamed a year ago is worse than none, because an auditor finds it
 * and stops trusting the rest. And a readiness pack that grew into a claim of
 * certification would be the most expensive sentence this repository could
 * print: a customer could rely on it, and no auditor has said it.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const read = (relative) => readFileSync(join(repoRoot, relative), 'utf8');

const rows = read('docs/compliance/controls.md')
  .split('\n')
  .filter((line) => line.startsWith('| TRZ-'))
  .map((line) => {
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
    const [id, control, evidence, soc2, iso, asvs, status] = cells;
    return { id, control, evidence, soc2, iso, asvs, status, cells };
  });

describe('the control matrix', () => {
  it('has a row per control, numbered in order, each with seven cells', () => {
    assert.ok(rows.length >= 20, `only ${rows.length} rows: has the table's shape changed?`);
    rows.forEach((row, index) => {
      assert.equal(row.cells.length, 7, `${row.id} has ${row.cells.length} cells`);
      assert.equal(row.id, `TRZ-${String(index + 1).padStart(2, '0')}`, 'IDs are not sequential');
    });
  });

  it('names evidence that exists, for every row', () => {
    for (const row of rows) {
      const paths = [...row.evidence.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
      assert.ok(paths.length > 0, `${row.id} names no evidence`);
      for (const path of paths) {
        assert.ok(existsSync(join(repoRoot, path)), `${row.id} cites ${path}, which does not exist`);
      }
    }
  });

  it('references every framework on every row, in each framework’s own numbering', () => {
    for (const row of rows) {
      assert.match(row.soc2, /\b(CC\d\.\d|A1\.\d|C1\.\d|PI1\.\d|P\d\.\d)\b/, `${row.id}: no SOC 2 criterion`);
      assert.match(row.iso, /\b[5-8]\.\d{1,2}\b/, `${row.id}: no ISO 27001 Annex A control`);
      assert.match(row.asvs, /\bV\d{1,2}\.\d\b/, `${row.id}: no ASVS section`);
    }
  });

  it('says whether each control is in place, and what limits a partial one', () => {
    for (const row of rows) {
      assert.match(row.status, /^(In place|Partial: .{10,})$/, `${row.id}: status "${row.status}"`);
    }
  });
});

describe('nothing claims a certificate nobody issued', () => {
  /**
   * The pack's first sentence says Trazum is not certified. These are the
   * places a reader would meet a claim that it is: the README, every doc, the
   * security policy, and every string the web app shows.
   */
  const CLAIM = [
    /\b(SOC ?2|ISO(\/IEC)? ?27001|CASA)\b[^.\n|]{0,40}\b(certified|compliant|certification achieved|attested)\b/i,
    /\b(certified|compliant)\b[^.\n|]{0,25}\b(SOC ?2|ISO(\/IEC)? ?27001|CASA)\b/i,
  ];
  /** A denial is the opposite of a claim: "is not certified against SOC 2" is the sentence this wants. */
  const withoutDenials = (text) => text.replace(/\bnot\s+(yet\s+)?(certified|compliant)\b[^.\n|]*/gi, '');
  const claimIn = (text) => {
    const kept = withoutDenials(text);
    for (const pattern of CLAIM) {
      const found = kept.match(pattern);
      if (found) return found[0];
    }
    return null;
  };
  const docs = readdirSync(join(repoRoot, 'docs'))
    .filter((name) => name.endsWith('.md'))
    .map((name) => `docs/${name}`);
  const i18n = readdirSync(join(repoRoot, 'apps/web/lib/i18n'))
    .filter((name) => name.endsWith('.ts'))
    .map((name) => `apps/web/lib/i18n/${name}`);
  const surfaces = ['README.md', 'SECURITY.md', 'apps/web/components/marketing.tsx', ...docs, ...i18n];

  it('in the README, the docs, the security policy or the web app', () => {
    for (const path of surfaces) {
      const found = claimIn(read(path));
      assert.equal(found, null, `${path} claims "${found}"`);
    }
  });

  it('and the pack itself opens by saying so', () => {
    assert.match(
      read('docs/compliance/README.md').split('\n').slice(0, 4).join(' '),
      /Trazum is not certified against SOC 2, ISO 27001 or any other standard/,
    );
  });

  it('would catch the claim it exists to stop', () => {
    assert.ok(claimIn('Trazum is SOC 2 compliant.'));
    assert.ok(claimIn('We are ISO 27001 certified'));
    assert.ok(claimIn('certified to ISO/IEC 27001'));
    assert.ok(claimIn('Trazum is not certified against SOC 2. It is ISO 27001 certified.'), 'a denial hid the claim after it');
    assert.equal(claimIn('a CPA firm for a SOC 2 Type I'), null);
    assert.equal(claimIn('Trazum is not certified against SOC 2, ISO 27001 or any other standard.'), null);
  });
});
