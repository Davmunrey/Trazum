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

  it('renders both claims about conversations that never came back, decided by the reads', () => {
    /**
     * The same tokens are a loud fact when the slice recorded zero cache reads
     * (nothing read those writes, anywhere) and a quiet ceiling when it has
     * reads — the provider's cache is keyed by prefix, so the log cannot see
     * whose write a read hit. Rendering only one claim would either state a
     * conditional as a fact or soften a fact into a maybe.
     */
    assert.match(bill, /t\.bill\.singleTurnConfirmed/);
    assert.match(bill, /t\.bill\.singleTurnCeiling/);
    // The branch is the slice's own reads, not a threshold invented here.
    assert.match(bill, /cacheReadTokens \?\? 0/);
    assert.match(bill, /reads === 0/);
  });

  it('drills into one period under the CLI’s rules, refusals included', () => {
    // The window line and the loud undated count, before any figure is
    // trusted as "the log".
    assert.match(bill, /t\.bill\.windowLine/);
    assert.match(bill, /t\.bill\.windowUndated/);
    // The refusals, kept in step with the CLI: a window matching nothing
    // names what the log covers; a clockless log cannot be windowed; a
    // window that starts after it ends is an error.
    assert.match(bill, /t\.bill\.windowMatchesNothing/);
    assert.match(bill, /t\.bill\.windowNeedsClock/);
    assert.match(bill, /t\.bill\.windowOrder/);
    // A bare date is that whole UTC day: the until bound adds a day to the
    // half-open window rather than excluding the day it names.
    assert.match(bill, /T00:00:00Z`\) \+ 86_400_000/);
    // The same window on both sides of the comparison — a windowed bill
    // against an unwindowed one compares a slice to a whole.
    // `catalogue` since 1.74: the bundled snapshot, or the dropped price card —
    // the invariant is unchanged (same catalogue and window on both sides).
    assert.match(bill, /profileUsage\(previous, \{\s*catalogue,\s*sinceMs,\s*untilMs,/);
  });

  it('names the fields the log is missing, from counts rather than booleans', () => {
    assert.match(bill, /t\.bill\.coverageHeading/);
    assert.match(bill, /t\.bill\.needsLabel/);
    assert.match(bill, /t\.bill\.needsSession/);
    assert.match(bill, /t\.bill\.needsTs/);
    // Counts, and the cache-TTL denominator is the records that wrote.
    assert.match(bill, /fieldCoverage\.label < fieldCoverage\.parsed/);
    assert.match(bill, /fieldCoverage\.cacheTtl < fieldCoverage\.cacheWrites/);
  });

  it('draws the shape of the day and points at the lever without claiming it', () => {
    /**
     * Twenty-four bars, gaps included: a chart that closed the gaps would
     * make every workload look flat, and flat is the finding that points at
     * the Batch API. The sentence names the lever and leaves the decision
     * with the reader.
     */
    assert.match(bill, /t\.bill\.hourChartLabel/);
    assert.match(bill, /t\.bill\.hoursConcentrated/);
    assert.match(bill, /t\.bill\.hoursFlat/);
    assert.match(bill, /Array\.from\(\{ length: 24 \}/);
    // The same 80% measure the CLI states, so the two cannot disagree.
    assert.match(bill, /covered >= 0\.8 \* total\.totalUsd/);
  });

  it('drills into one workload by clicking it, and says what that does to the shares', () => {
    /**
     * The CLI's --label, reached by clicking a row. The banner has to carry
     * the awkward half — every share below is a share of *this* workload's
     * bill — or a reader takes "100%" as a statement about the whole log.
     */
    assert.match(bill, /t\.bill\.drillActive/);
    assert.match(bill, /t\.bill\.drillClear/);
    // Both logs of a comparison are filtered the same way, as on the CLI.
    assert.match(bill, /label !== null \? \{ label \} : \{\}/);
    // No drill-down inside a drill-down: it would filter an already-filtered
    // report and quietly produce an empty one.
    assert.match(bill, /drillLabel === null \? onDrill : undefined/);
  });

  it('renders what one conversation costs, tail sentence and all', () => {
    // Median against p95, never a mean — and the tail sentence only past
    // ten times the median, so a uniformly expensive workload is not sent
    // hunting for a tail it does not have.
    assert.match(bill, /t\.bill\.sessionCost\(/);
    assert.match(bill, /t\.bill\.sessionCostTail/);
    assert.match(bill, /p95Usd > 10 \* shape\.medianUsd/);
  });

  it('states the move batched on the target, hedged and never summed', () => {
    assert.match(bill, /t\.bill\.whatIfBatchOnTarget\(/);
    assert.match(bill, /whatIf\.batchOnTarget !== null && \(/);
  });

  it('corrects the what-if figure the target would refuse to bill', () => {
    // The discounted row prices cache entries the target's minimum would
    // refuse to create; the correction renders beside it, never instead of it.
    assert.match(bill, /t\.bill\.whatIfCacheBeyond\(/);
    assert.match(bill, /slice\.cacheBeyondTarget !== null && \(/);
  });

  it('names what the comparison stopped being able to see', () => {
    // The dollars render a fixed finding and a blinded log identically; the
    // card exists because only coverage tells them apart, and the silenced
    // list only belongs to a collapse.
    assert.match(bill, /coverageDrift\(prev\.fieldCoverage, report\.fieldCoverage\)/);
    assert.match(bill, /t\.bill\.coverageSilenced\(drift\.field\)/);
    assert.match(bill, /drift\.delta < 0 && \(/);
  });

  it('states the worst conversation when the percentiles refused a small log', () => {
    // A maximum is a fact at any count; the card appears exactly when the
    // per-slice percentiles have nothing to say and the log still has
    // conversations to count.
    assert.match(bill, /t\.bill\.sessionSpendOnly\(/);
    assert.match(bill, /report\.sessionCosts\.length === 0 && report\.sessionSpend !== null/);
  });

  it('names which workload pays for truncated answers, over measured calls', () => {
    assert.match(bill, /t\.bill\.truncatedBy/);
    // The denominator is the calls that recorded a stop reason, never all of
    // them: a workload logging the field half the time is not one whose other
    // half completed.
    assert.match(bill, /truncatedCalls \/ entry\.breakdown\.stopReasonCalls/);
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

  it('reprices onto another model in the page, with the caveat above the figure', () => {
    /**
     * `--what-if` in the tab. The comparison is repriced client-side like
     * everything else here, and the assumption has to render *before* the
     * dollar figure: a number with the caveat underneath is a recommendation
     * with small print, and this comparison has never seen a prompt.
     */
    assert.match(bill, /repriceProfile\(report, whatIfModel, catalogue\)/);
    const assumption = bill.indexOf('t.bill.whatIfAssumption');
    const total = bill.indexOf('t.bill.whatIfTotal');
    assert.notEqual(assumption, -1, 'the what-if assumption is not rendered at all');
    assert.ok(assumption < total, 'the assumption renders after the figure it qualifies');
  });

  it('names a call too large for the target model instead of pricing it', () => {
    // A call over the target's context window would fail, not cost less, and
    // the refusal is a warn-styled block rather than a line of muted prose.
    assert.match(bill, /t\.bill\.whatIfOverContext/);
    assert.match(bill, /whatIf\.overContext\.slice/);
    const en = read('lib/i18n/en.ts');
    assert.match(en, /Those calls would fail, not cost less/);
    assert.match(en, /multiplication, not advice/);
  });

  it('keeps spend already on the target out of the difference', () => {
    assert.match(bill, /whatIf\.alreadyOnTarget\.calls > 0/);
    assert.match(bill, /t\.bill\.whatIfUnpriced/);
  });

  it('describes how big the calls are, with the CLI’s threshold', () => {
    // Two surfaces summarising one log differently is a second opinion nobody
    // asked for, so the threshold lives in both and the copy matches.
    assert.match(bill, /report\.inputShapes\.length > 0/);
    assert.match(bill, /shape\.p95OverMedian! >= 4/);
    const en = read('lib/i18n/en.ts');
    assert.match(en, /The fix is a limit on the large calls, not a rewrite/);
    assert.match(en, /there is no tail to cap/);
  });

  it('says what the size costs, not only what it is', () => {
    // A large slice reading almost everything from cache is a very different
    // bill from one paying full rate, and the token counts cannot say which.
    assert.match(bill, /shape\.cachedShare >= 0\.5/);
    assert.match(bill, /t\.bill\.inputFullRate/);
  });

  it('names no ceiling when the calls are past what the buckets measure', () => {
    assert.match(bill, /t\.bill\.inputHuge/);
    const en = read('lib/i18n/en.ts');
    assert.match(en, /No ceiling is named because there is none to name honestly/);
  });

  it('carries the CLI’s newest findings, with the CLI’s thresholds', () => {
    // repeatedTurns, contextPressure, modelMixDrift and duplicateLines — the
    // findings the CLI grew that the tab lacked. The thresholds must match
    // the CLI's (85% loud on pressure, fifteen points on drift): two
    // surfaces summarising one log differently is a second opinion nobody
    // asked for.
    assert.match(bill, /report\.repeatedTurns\.length > 0/);
    assert.match(bill, /contextPressure\(report, catalogue\)/);
    assert.match(bill, /row\.share >= 0\.85/);
    assert.match(bill, /Math\.abs\(m\.lastShare - m\.firstShare\) >= 0\.15/);
    assert.match(bill, /report\.duplicateLines\.count > 0/);
    const en = read('lib/i18n/en.ts');
    assert.match(en, /names the pattern and stops/);
    assert.match(en, /When it crosses is not predicted here/);
    assert.match(en, /Where the mix goes next is not in this log/);
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
