import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { BUNDLED_CATALOGUE, parseConfig, parseUsageLine, positionReport } from '@trazum/core';

import { register } from 'node:module';
register('./helpers/loader.mjs', import.meta.url);
const { en } = await import('../lib/i18n/en.ts');
const { es } = await import('../lib/i18n/es.ts');

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..');

const read = (relative) => readFileSync(join(web, relative), 'utf8');
const codeOf = (relative) =>
  read(relative)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');

/**
 * The position card is the fourth door on the 1.67 position document. The
 * other three — the CLI, its HTML page, the MCP tool — all call
 * `positionReport` and render what it returns; these guards hold the card to
 * the same discipline, textually where the property is about what the code
 * does not do, and functionally where the property is about what the shared
 * document says.
 */
describe('the position card is the fourth door on one document', () => {
  const card = codeOf('components/Position.tsx');

  it('never fetches — the log and the config stay in the page', () => {
    // The Bill tab's founding promise, inherited whole: the card reads the
    // log pasted above and a config pasted here, and neither leaves the tab.
    assert.equal(
      /\bfetch\s*\(/.test(card),
      false,
      'Position.tsx contains a fetch call — the config is supposed to never leave the page',
    );
    assert.equal(/XMLHttpRequest|sendBeacon|WebSocket/.test(card), false);
  });

  it('calls the door, not a re-implementation', () => {
    assert.match(card, /positionReport\(/, 'the card no longer calls positionReport');
    assert.match(card, /BUNDLED_CATALOGUE/, 'pricing no longer happens client-side');
    // The records reach the door through the CLI's own line parser, with the
    // CLI's own filter — one parse, four surfaces.
    assert.match(card, /parseUsageLine\(line\)/);
  });

  it('reads ceilings with the config parser the CLI uses, and no other', () => {
    assert.match(card, /parseConfig\(/, 'the ceilings no longer come from parseConfig');
    // A second JSON.parse beside parseConfig would be a second validator with
    // its own error sentences — the drift this card exists to prevent.
    // parseConfig owns the "not valid JSON" sentence.
    assert.equal(
      /JSON\.parse/.test(card),
      false,
      'Position.tsx parses JSON itself instead of letting parseConfig own it',
    );
    // And the refusal renders in the parser's own words.
    assert.match(card, /error instanceof ConfigError \? error\.message/);
  });

  it('renders the distance only when the document grants it', () => {
    // `positionReport` withholds the distance under the seven-day floor, on
    // an over and on a zero rate. The card must render the field or nothing —
    // never re-derive the division the document refused to state.
    assert.match(card, /position\.distance !== null/);
    const rederives = /(remainingUsd|limitUsd|measuredUsd)\s*[-+]?[^)\n]*\)\s*\/|\/\s*(usdPerDay|daysMeasured|overDays)/;
    assert.equal(
      rederives.test(card),
      false,
      'Position.tsx re-derives distance arithmetic the document may have withheld',
    );
    // The pattern must actually catch the defect it names, or it guards
    // nothing: this is the line someone would write.
    assert.ok(
      rederives.test('{((position.limitUsd - position.measuredUsd) / position.distance.usdPerDay).toFixed(1)}'),
      'the re-derivation pattern passed the planted defect',
    );
  });

  it('answers a ceiling-less config with a sentence, not an empty report', () => {
    // Valid-and-empty is its own state: rendering a document with no
    // positions would show a month heading over nothing and read as "fine".
    assert.match(card, /'no-ceilings'/);
    assert.match(card, /t\.position\.noCeilings/);
  });

  it('never renders a session key', () => {
    // The document has no session field to leak, and the card must not reach
    // past the document into the records for one. Grepping the code is the
    // three-doors suite's method: trust the output, not the intention.
    assert.equal(
      /record\.session|\.session\b(?!Usd)/.test(card),
      false,
      'Position.tsx reaches for a session key',
    );
  });

  it('states the source on the card', () => {
    // `source: "usage-log"` is the field that keeps the store's
    // provider-billed standing out of this figure; the sentence that says so
    // must render, not sit in a comment.
    assert.match(card, /t\.position\.source/);
  });
});

/**
 * The functional half: the exact call path the card takes — parseConfig on
 * pasted text, parseUsageLine per line, positionReport with the bundled
 * catalogue — produces the document the other doors produce. If core drifts
 * in a way that would silently change what the card shows, this fails here
 * rather than in a browser nobody is watching.
 */
describe('the fourth door answers with the other doors’ document', () => {
  const on = new Date('2026-08-15T12:00:00Z');
  const config = parseConfig(
    JSON.stringify({
      spend: { monthlyUsd: 100 },
      limits: { dayUsd: 5, sessionUsd: 6, byLabel: { support: 10, ghost: 5 } },
    }),
  );
  const lines = [
    // Eight distinct measured days — past the MIN_SCALE_DAYS floor, so the
    // month's distance line has a denominator to stand on.
    ...Array.from({ length: 8 }, (_, i) =>
      JSON.stringify({
        model: 'claude-sonnet-5',
        label: 'support',
        session: 'k-1',
        ts: `2026-08-0${i + 1}T10:00:00Z`,
        usage: { input_tokens: 1000, output_tokens: 100 },
      }),
    ),
    // A model the catalogue cannot price — money nobody can see, counted.
    JSON.stringify({
      model: 'mystery-model',
      ts: '2026-08-03T10:00:00Z',
      usage: { input_tokens: 500, output_tokens: 50 },
    }),
    // A clockless record: belongs to no window, excluded from every figure.
    JSON.stringify({ model: 'claude-sonnet-5', usage: { input_tokens: 10, output_tokens: 1 } }),
  ];
  const records = lines.map((line) => parseUsageLine(line)).filter((record) => record !== null);
  const document = positionReport(
    records,
    { spend: config.spend, limits: config.limits },
    { catalogue: BUNDLED_CATALOGUE, on },
  );

  it('parsed every fixture line', () => {
    assert.equal(records.length, lines.length);
  });

  it('names its source and its schema', () => {
    assert.equal(document.source, 'usage-log');
    assert.equal(document.schemaVersion, 1);
  });

  it('states the month within its ceiling, with the distance as division', () => {
    const month = document.positions.find((p) => p.scope === 'month');
    assert.ok(month, 'no month position');
    assert.equal(month.verdict, 'within');
    assert.ok(month.distance !== null, 'eight measured days should clear the floor');
    assert.equal(month.distance.arithmetic, 'division');
    assert.equal(month.distance.overDays, 8);
  });

  it('measures a quiet day as $0, never as cannot-tell', () => {
    // The doors' rule, side by side with budgetPositions' stale-month rule:
    // a day with no records in a clocked log is a measured zero.
    const day = document.positions.find((p) => p.scope === 'day');
    assert.ok(day, 'no day position');
    assert.equal(day.measuredUsd, 0);
    assert.equal(day.verdict, 'within');
  });

  it('names the unseen label instead of calling it under budget', () => {
    const ghost = document.unmeasured.find((entry) => entry.label === 'ghost');
    assert.ok(ghost, 'the unseen label vanished from the document');
    assert.equal(ghost.why, 'label-unseen');
  });

  it('sends the session ceiling to cannotSay, where the card renders it', () => {
    assert.ok(
      // Codes since 1.78.0: the document carries the reason, each surface
      // carries the sentence. A Spanish reader used to meet a localized
      // heading over an untranslated English paragraph here.
      document.cannotSay.includes('session-limit-at-the-doors'),
      'the per-session ceiling is not declared unanswerable',
    );
  });

  it('counts the unpriced record out loud', () => {
    assert.equal(document.unpricedRecords, 1);
    // Every code core can emit has a sentence in both locales. Without
    // this, a new code reaches a visitor as a bare slug.
    for (const code of document.cannotSay) {
      for (const [name, dict] of [['en', en], ['es', es]]) {
        assert.ok(dict.position.cannotSay[code], `no ${name} sentence for "${code}"`);
      }
    }
  });

  it('serialises with no session key anywhere', () => {
    // The card renders fields off this document; if a session key ever
    // arrives in it, the never-renders guard above is one refactor from
    // useless. Grip the document itself too.
    assert.equal(/"session"/.test(JSON.stringify(document)), false);
  });
});
