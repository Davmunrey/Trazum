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
});
