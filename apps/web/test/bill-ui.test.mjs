import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..');

const read = (relative) => readFileSync(join(web, relative), 'utf8');
const codeOf = (relative) =>
  read(relative)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');

/**
 * The Bill tab exists on one promise: the usage log is read in the browser and
 * nowhere else. A usage log names workloads, spend, session counts and models —
 * exactly the file nobody should be asked to upload to see a report about it.
 * Everything here pins that promise and the doctrine the report copy carries.
 */
describe('the bill tab reads the log in the browser and nowhere else', () => {
  const bill = codeOf('components/Bill.tsx');

  it('never fetches — there is no network call to make', () => {
    // The single property that makes the tab acceptable. A fetch added here for
    // any reason — analytics enrichment, "just metadata", a share feature — is
    // the privacy story ending, and it would compile cleanly.
    assert.equal(
      /\bfetch\s*\(/.test(bill),
      false,
      'Bill.tsx contains a fetch call — the log is supposed to never leave the page',
    );
    assert.equal(/XMLHttpRequest|sendBeacon|WebSocket/.test(bill), false);
  });

  it('prices with the bundled catalogue, in the page', () => {
    assert.match(bill, /BUNDLED_CATALOGUE/, 'pricing no longer happens client-side');
    assert.match(bill, /profileUsage\(/);
  });

  it('states the privacy promise before the input is reachable', () => {
    // The decision to paste a log is made on that sentence, so it must come
    // before the drop zone and the textarea in the source — the same ordering
    // rule the Compare tab pins for its sign convention.
    const promise = bill.indexOf('t.bill.privacy');
    const fileInput = bill.indexOf('type="file"');
    const paste = bill.indexOf('t.bill.pasteAriaLabel');
    assert.notEqual(promise, -1, 'the privacy promise is not rendered at all');
    assert.ok(promise < fileInput, 'the privacy promise renders after the file input');
    assert.ok(promise < paste, 'the privacy promise renders after the paste area');
  });

  it('sends analytics shape only, never content', () => {
    // The one telemetry call may carry booleans about what kind of report was
    // produced — never a label, a model, a count or a dollar figure.
    const calls = bill.match(/track\([\s\S]*?\)/g) ?? [];
    for (const call of calls) {
      assert.equal(
        /label|model|Usd|usd|tokens|calls:|session:/.test(call),
        false,
        `a track() call carries log content: ${call}`,
      );
    }
  });

  it('does not state a cache verdict the log cannot settle', () => {
    // When the TTL assumption alone flips the verdict, neither end may be
    // reported as the answer. The gate must compare the two verdicts and it
    // must win over the confident sentences.
    assert.match(
      bill,
      /cache\.worstCaseVerdict !== cache\.verdict/,
      'the unsettled gate is gone — the flattering half will be stated as fact',
    );
    const gate = bill.indexOf('cache.worstCaseVerdict !== cache.verdict');
    const confident = bill.indexOf('t.bill.cachePaidOff');
    assert.ok(gate !== -1 && confident !== -1 && gate < confident);
  });

  it('states the against convention before the first figure it governs', () => {
    // The Compare tab's rule for the Compare tab's reason: positive means the
    // bill grew, and a reader arriving from the rest of the report has the
    // opposite expectation loaded.
    const convention = bill.indexOf('t.bill.againstConvention');
    const totals = bill.indexOf('t.bill.againstTotals');
    assert.notEqual(convention, -1, 'the convention is not rendered at all');
    assert.ok(convention < totals, 'the convention renders after the figure it applies to');
    // Drivers are derived over the union, so appeared and vanished workloads
    // are named rather than folded silently.
    assert.match(bill, /t\.bill\.againstDriverNew/);
    assert.match(bill, /t\.bill\.againstDriverGone/);
    // A previous log with nothing priced is its own answer, not zero growth.
    assert.match(bill, /t\.bill\.againstNothingPriced/);
  });

  it('renders every TTL-fit state, including "could not be measured"', () => {
    // Four verdicts plus the unmeasured line, gated on writes existing — the
    // same discipline as truncation: silence over writes with no clock would
    // read as fine.
    for (const key of ['ttlExpires', 'ttlExpiresBoth', 'ttlOverlong', 'ttlUnsettled', 'ttlFits', 'ttlUnmeasured']) {
      assert.match(bill, new RegExp(`t\\.bill\\.${key}`), `${key} is never rendered`);
    }
    assert.match(bill, /cacheWriteTokens > 0 && report\.cacheTtlFit\.length === 0/);
    // The overlong verdict carries its exact figure, never the spend.
    assert.match(bill, /ttlOverlong\([^)]*fit\.overpayUsd/s);
  });

  it('renders all three truncation states, not two', () => {
    // "Not recorded" and "none truncated" are different answers. Dropping
    // either collapses them into the flattering one.
    assert.match(bill, /t\.bill\.truncatedWaste/);
    assert.match(bill, /t\.bill\.truncatedNone/);
    assert.match(bill, /t\.bill\.truncatedNotRecorded/);
    assert.match(bill, /stopReasonCalls === 0/, 'the not-recorded state is no longer gated on the log');
  });

  it('says when the levers describe every workload merged into one', () => {
    assert.match(bill, /t\.bill\.leversUnlabelled/);
    assert.match(bill, /UNLABELLED/, 'the unlabelled sentinel comparison is gone');
  });

  it('names conversation growth as a ceiling and sessions as never shown', () => {
    const en = read('lib/i18n/en.ts');
    assert.match(en, /ceiling and not a saving/, 'the growth figure lost its ceiling wording');
    assert.match(en, /grouped by and never shown|groups by it and never shows it/);
  });

  it('does not redefine what the core already exports', () => {
    assert.equal(/function formatUsd/.test(bill), false);
    assert.match(bill, /formatUsd,\n\s*profileUsage|formatUsd/, 'formatUsd comes from @trazum/core');
  });

  it('puts the saving beside the saving’s share, never the spend', () => {
    /**
     * `shareOfBill` on a lever slice is the *combined saving* as a fraction of
     * the bill. The first version rendered `spentUsd` next to it — "$0.4669
     * (72%)" on a slice the by-label table said was 100% of the bill, two
     * figures on one line describing different things. Caught by driving the
     * built page in a browser, not by any source assertion; this pins the fix.
     */
    const sliceCall = /t\.bill\.leverSlice\(([\s\S]*?)\)\s*\}/.exec(bill);
    assert.ok(sliceCall, 'leverSlice is not rendered');
    assert.match(sliceCall[1], /slice\.combinedUsd/, 'leverSlice must carry the combined saving');
    assert.equal(
      /slice\.spentUsd/.test(sliceCall[1]),
      false,
      'leverSlice is fed the spend — the share beside it describes the saving',
    );
    // The spend still appears, on the line that names it as spend.
    const callsLine = /t\.bill\.leverCalls\(([\s\S]*?)\)\s*\}/.exec(bill);
    assert.ok(callsLine && /slice\.spentUsd/.test(callsLine[1]));
  });
});

describe('the bill copy agrees with its own numbers', () => {
  /**
   * "1 calls are not in these totals", read off a screenshot. Every message
   * that renders a count must take it as a number and branch on one, in both
   * locales — a count formatted upstream into a string cannot conjugate.
   */
  const COUNTED = [
    'headline',
    'cacheUnsettled',
    'cacheTtlBound',
    'leverCalls',
    'truncatedWaste',
    'unpriced',
    'skipped',
  ];

  /** The source of one message implementation, sliced out of a catalogue file. */
  const messageSource = (file, name) => {
    const source = read(file);
    const start = source.indexOf(`    ${name}: (`);
    assert.notEqual(start, -1, `${file} does not define bill.${name}`);
    const next = source.slice(start + 4).search(/\n    [a-zA-Z]+:/);
    return source.slice(start, next === -1 ? undefined : start + 4 + next);
  };

  it('declares every counted parameter as a number', () => {
    const types = read('lib/i18n/types.ts');
    for (const name of COUNTED) {
      const declaration = new RegExp(`${name}\\([^)]*(calls|count): number`);
      assert.match(types, declaration, `bill.${name} takes its count as a pre-formatted string`);
    }
  });

  for (const file of ['lib/i18n/en.ts', 'lib/i18n/es.ts']) {
    it(`${file} conjugates every counted message`, () => {
      for (const name of COUNTED) {
        assert.match(
          messageSource(file, name),
          /=== 1/,
          `bill.${name} never branches on the singular`,
        );
      }
    });
  }
});
