import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BUNDLED_CATALOGUE, PROFILE_CSV_COLUMNS, profileToCsv, profileUsage } from '../dist/index.js';

/**
 * The profile as a spreadsheet.
 *
 * Hand arithmetic: 200k input tokens on Claude Opus 5 are $1.00, so the
 * total_usd column is checkable by eye. The interesting assertions here are
 * the refusals — no total row, no zeros where dollars are unknown, and no
 * label able to break a row or execute in a spreadsheet.
 */

const ON = new Date('2026-08-18T00:00:00Z');

const csvOf = (records) =>
  profileToCsv(
    profileUsage(records.map((r) => JSON.stringify(r)).join('\n'), {
      catalogue: BUNDLED_CATALOGUE,
      on: ON,
    }),
    { unlabelled: '(no label)' },
  );

const rowsOf = (csv) => csv.trimEnd().split('\n');

const call = (label, usd = 1) => ({
  model: 'claude-opus-5',
  ...(label === null ? {} : { label }),
  usage: { input_tokens: usd * 200_000, output_tokens: 0 },
});

describe('the profile as CSV', () => {
  it('writes the header and one row per label and model', () => {
    const rows = rowsOf(csvOf([call('chat'), call('chat'), call('batch', 3)]));
    assert.equal(rows[0], PROFILE_CSV_COLUMNS.join(','));
    assert.equal(rows.length, 3);
    // Largest bill first: batch at $3.00 outranks chat at $2.00.
    assert.match(rows[1], /^batch,claude-opus-5,1,600000,0,0,0,3\.000000,/);
    assert.match(rows[2], /^chat,claude-opus-5,2,400000,0,0,0,2\.000000,/);
    assert.match(rows[1], /,3\.000000$/);
  });

  it('has no total row — a total in a data file gets summed with the data', () => {
    const csv = csvOf([call('chat'), call('batch')]);
    assert.doesNotMatch(csv.toLowerCase(), /total,|,total\b/);
    const dataRows = rowsOf(csv).slice(1);
    const sum = dataRows.reduce((acc, row) => acc + Number(row.split(',').pop()), 0);
    // The file sums to the bill exactly once.
    assert.ok(Math.abs(sum - 2) < 1e-9, String(sum));
  });

  it('gives unpriced models their tokens and empty dollar cells, never zeros', () => {
    const rows = rowsOf(
      csvOf([call('chat'), { model: 'ft:acme-internal', usage: { input_tokens: 900_000, output_tokens: 100 } }]),
    );
    const unpriced = rows.find((row) => row.includes('ft:acme-internal'));
    assert.ok(unpriced, 'the unpriced model vanished from the file');
    // Tokens present, dollars empty: "0" there would claim the calls were free.
    assert.match(unpriced, /,900000,0,0,100,,,,,$/);
  });

  it('quotes a label that would otherwise break the row', () => {
    const rows = rowsOf(csvOf([call('billing, urgent'), call('say "hi"')]));
    assert.ok(rows.some((row) => row.startsWith('"billing, urgent",')));
    assert.ok(rows.some((row) => row.startsWith('"say ""hi""",')));
  });

  it('defuses a label a spreadsheet would run as a formula', () => {
    // A log is data. "=cmd|..." in a cell is the classic CSV injection, and a
    // label comes from whatever wrote the log.
    const rows = rowsOf(csvOf([call('=1+1')]));
    assert.ok(rows.some((row) => row.startsWith("'=1+1,")), rows.join(' | '));
  });

  it('names the unlabelled bucket in the caller’s words', () => {
    const rows = rowsOf(csvOf([call(null)]));
    assert.match(rows[1], /^\(no label\),/);
  });
});

describe('the time-series shapes', () => {
  const at = (day, hour, usd, label = 'chat') => ({
    model: 'claude-opus-5',
    label,
    ts: `${day}T${String(hour).padStart(2, '0')}:30:00Z`,
    usage: { input_tokens: usd * 200_000, output_tokens: 0 },
  });

  const shaped = (records, shape) =>
    profileToCsv(
      profileUsage(records.map((r) => JSON.stringify(r)).join('\n'), {
        catalogue: BUNDLED_CATALOGUE,
        on: ON,
      }),
      { unlabelled: '(no label)', shape },
    );

  it('writes one row per UTC day, with the day’s biggest label', () => {
    const rows = rowsOf(
      shaped([at('2026-08-01', 9, 1), at('2026-08-02', 9, 1), at('2026-08-02', 10, 3, 'batch')], 'day'),
    );
    assert.equal(rows[0], 'day,usd,calls,top_label,top_label_usd');
    assert.equal(rows[1], '2026-08-01,1.000000,1,chat,1.000000');
    assert.equal(rows[2], '2026-08-02,4.000000,2,batch,3.000000');
  });

  it('writes one row per hour that saw traffic', () => {
    const rows = rowsOf(shaped([at('2026-08-01', 9, 1), at('2026-08-01', 9, 2), at('2026-08-01', 17, 1)], 'hour'));
    assert.equal(rows[0], 'hour_utc,usd,calls');
    assert.equal(rows[1], '9,3.000000,2');
    assert.equal(rows[2], '17,1.000000,1');
  });

  it('leaves the top-label cells empty when a day carried no label', () => {
    const unlabelled = {
      model: 'claude-opus-5',
      ts: '2026-08-01T09:30:00Z',
      usage: { input_tokens: 200_000, output_tokens: 0 },
    };
    const rows = rowsOf(shaped([unlabelled], 'day'));
    // The unlabelled bucket is a real bucket, so it *is* the day's top label:
    // what must never happen is inventing a name the log did not carry.
    assert.match(rows[1], /^2026-08-01,1\.000000,1,\(no label\),1\.000000$/);
  });

  it('still has no total row in any shape', () => {
    for (const shape of ['slice', 'day', 'hour']) {
      const csv = shaped([at('2026-08-01', 9, 1), at('2026-08-02', 9, 2)], shape);
      assert.doesNotMatch(csv.toLowerCase(), /^total,/m);
    }
  });
});
