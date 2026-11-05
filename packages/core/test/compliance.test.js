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

describe('the ASVS 4.0.3 level 2 mapping', () => {
  /**
   * Every level 2 requirement of OWASP ASVS 4.0.3, by ID, as the standard
   * publishes them (https://github.com/OWASP/ASVS/tree/v4.0.3/4.0/en): 259
   * IDs across V1 to V14. A mapping that dropped one, or invented one, would
   * be a mapping of some other standard; this list is what makes "all of
   * them" checkable rather than claimed.
   */
  const LEVEL_2 = (
    '1.1.1 1.1.2 1.1.3 1.1.4 1.1.5 1.1.6 1.1.7 1.2.1 1.2.2 1.2.3 1.2.4 1.4.1 1.4.4 1.4.5 ' +
    '1.5.1 1.5.2 1.5.3 1.5.4 1.6.1 1.6.2 1.6.3 1.6.4 1.7.1 1.7.2 1.8.1 1.8.2 1.9.1 1.9.2 ' +
    '1.10.1 1.11.1 1.11.2 1.12.2 1.14.1 1.14.2 1.14.3 1.14.4 1.14.5 1.14.6 2.1.1 2.1.2 ' +
    '2.1.3 2.1.4 2.1.5 2.1.6 2.1.7 2.1.8 2.1.9 2.1.10 2.1.11 2.1.12 2.2.1 2.2.2 2.2.3 2.3.1 ' +
    '2.3.2 2.3.3 2.4.1 2.4.2 2.4.3 2.4.4 2.4.5 2.5.1 2.5.2 2.5.3 2.5.4 2.5.5 2.5.6 2.5.7 ' +
    '2.6.1 2.6.2 2.6.3 2.7.1 2.7.2 2.7.3 2.7.4 2.7.5 2.7.6 2.8.1 2.8.2 2.8.3 2.8.4 2.8.5 ' +
    '2.8.6 2.8.7 2.9.1 2.9.2 2.9.3 2.10.1 2.10.2 2.10.3 2.10.4 3.1.1 3.2.1 3.2.2 3.2.3 ' +
    '3.2.4 3.3.1 3.3.2 3.3.3 3.3.4 3.4.1 3.4.2 3.4.3 3.4.4 3.4.5 3.5.1 3.5.2 3.5.3 3.7.1 ' +
    '4.1.1 4.1.2 4.1.3 4.1.5 4.2.1 4.2.2 4.3.1 4.3.2 4.3.3 5.1.1 5.1.2 5.1.3 5.1.4 5.1.5 ' +
    '5.2.1 5.2.2 5.2.3 5.2.4 5.2.5 5.2.6 5.2.7 5.2.8 5.3.1 5.3.2 5.3.3 5.3.4 5.3.5 5.3.6 ' +
    '5.3.7 5.3.8 5.3.9 5.3.10 5.4.1 5.4.2 5.4.3 5.5.1 5.5.2 5.5.3 5.5.4 6.1.1 6.1.2 6.1.3 ' +
    '6.2.1 6.2.2 6.2.3 6.2.4 6.2.5 6.2.6 6.3.1 6.3.2 6.4.1 6.4.2 7.1.1 7.1.2 7.1.3 7.1.4 ' +
    '7.2.1 7.2.2 7.3.1 7.3.3 7.3.4 7.4.1 7.4.2 7.4.3 8.1.1 8.1.2 8.1.3 8.1.4 8.2.1 8.2.2 ' +
    '8.2.3 8.3.1 8.3.2 8.3.3 8.3.4 8.3.5 8.3.6 8.3.7 8.3.8 9.1.1 9.1.2 9.1.3 9.2.1 9.2.2 ' +
    '9.2.3 9.2.4 10.2.1 10.2.2 10.3.1 10.3.2 10.3.3 11.1.1 11.1.2 11.1.3 11.1.4 11.1.5 ' +
    '11.1.6 11.1.7 11.1.8 12.1.1 12.1.2 12.1.3 12.2.1 12.3.1 12.3.2 12.3.3 12.3.4 12.3.5 ' +
    '12.3.6 12.4.1 12.4.2 12.5.1 12.5.2 12.6.1 13.1.1 13.1.3 13.1.4 13.1.5 13.2.1 13.2.2 ' +
    '13.2.3 13.2.5 13.2.6 13.3.1 13.3.2 13.4.1 13.4.2 14.1.1 14.1.2 14.1.3 14.1.4 14.2.1 ' +
    '14.2.2 14.2.3 14.2.4 14.2.5 14.2.6 14.3.2 14.3.3 14.4.1 14.4.2 14.4.3 14.4.4 14.4.5 ' +
    '14.4.6 14.4.7 14.5.1 14.5.2 14.5.3 14.5.4 '
  ).trim().split(' ');

  const page = read('docs/compliance/asvs-l2.md');
  const STATUSES = ['Met', 'Partial', 'Gap', 'Owner', 'N/A'];
  const mapped = page
    .split('\n')
    .map((line) => line.match(/^\| (\d+\.\d+\.\d+) \| (.+) \| ([^|]+) \| (.+) \|$/))
    .filter(Boolean)
    .map(([, id, requirement, status, why]) => ({ id, requirement, status, why }));

  /** A repository path in backticks: has a directory, or is a known top-level file. Not `Response.json`. */
  const PATH = /`((?:[\w.[\]-]+\/)+[\w.[\]-]+\.\w+|Dockerfile|[A-Z][\w-]*\.md|n0-app\.json)`/g;
  const pathsIn = (text) => [...text.matchAll(PATH)].map((match) => match[1]);

  it('maps every level 2 requirement exactly once, in the standard\u2019s order', () => {
    assert.equal(LEVEL_2.length, 259);
    assert.deepEqual(mapped.map((row) => row.id), LEVEL_2);
  });

  it('gives every requirement one of five statuses', () => {
    for (const row of mapped) assert.ok(STATUSES.includes(row.status), `${row.id}: status "${row.status}"`);
  });

  it('names evidence that exists for everything Met or Partial, and only paths that exist anywhere', () => {
    for (const row of mapped) {
      const paths = pathsIn(row.why);
      if (row.status === 'Met' || row.status === 'Partial') assert.ok(paths.length > 0, `${row.id} is ${row.status} with no evidence`);
      for (const path of paths) assert.ok(existsSync(join(repoRoot, path)), `${row.id} cites ${path}, which does not exist`);
    }
  });

  it('lists every gap among the work the pack says remains in code', () => {
    const remains = read('docs/compliance/README.md').split('## What remains, in code')[1].split('\n## ')[0];
    for (const row of mapped.filter((r) => r.status === 'Gap')) {
      assert.ok(remains.includes(row.id), `${row.id} is a gap the pack does not list as remaining`);
    }
  });

  it('has a summary that agrees with its rows', () => {
    const summary = page
      .split('\n')
      .map((line) => line.match(/^\| (V\d+) [^|]+\| (\d+) \| (\d+) \| (\d+) \| (\d+) \| (\d+) \| (\d+) \|$/))
      .filter(Boolean);
    assert.equal(summary.length, 14);
    for (const [, chapter, total, ...counts] of summary) {
      const rows = mapped.filter((row) => `V${row.id.split('.')[0]}` === chapter);
      assert.equal(rows.length, Number(total), `${chapter} total`);
      STATUSES.forEach((status, i) => {
        assert.equal(rows.filter((row) => row.status === status).length, Number(counts[i]), `${chapter} ${status}`);
      });
    }
  });

  it('would notice a dropped requirement and a path that is not one', () => {
    assert.notDeepEqual(mapped.slice(1).map((row) => row.id), LEVEL_2);
    assert.deepEqual(pathsIn('`Response.json` and `apps/web/app/c/[token]/page.tsx` and `Dockerfile`'), [
      'apps/web/app/c/[token]/page.tsx',
      'Dockerfile',
    ]);
  });
});
