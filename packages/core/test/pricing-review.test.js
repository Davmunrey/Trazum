import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  MODELS,
  PRICING_LAST_REVIEWED,
  PROVIDER_REVIEWED,
  STALE_PRICING_DAYS,
  reviewAgeDays,
} from '../dist/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (relativePath) => readFileSync(join(ROOT, relativePath), 'utf8');

/**
 * The price table is the one thing in this product that cannot be derived from
 * anything inside the repository. Every other number here comes out of the
 * code; these come out of seven companies' pricing pages, and the only thing
 * standing between a reader and a figure nobody charges is somebody having
 * looked recently.
 *
 * That guarantee had three separate holes, and one of them had already turned
 * into a wrong price with a date on it.
 *
 * 1. The age at which this tool stops calling its own table current was typed
 *    into three surfaces as `45` and printed to readers as prose in four
 *    strings. Seven copies of one claim, none of them checked against another.
 * 2. One review date covered all seven providers, so a review of one of them
 *    could not be recorded without overstating the other six. The date was
 *    written once, on 2026-08-04, already reading 2026-06-24, and never moved.
 * 3. Sonnet 5 carried a promotion ending 2026-08-31 and a base price of 3/15
 *    underneath it. Anthropic cancelled that increase and made the
 *    introductory 2/10 standard; the catalogue did not know, so on 2026-09-01
 *    every Sonnet 5 figure would have risen 50% on its own.
 *
 * The third is why the first two matter, and it is the one thing this file
 * cannot catch early: no offline check knows a provider changed its mind. What
 * it can do is refuse the residue — a promotion whose window has closed is a
 * price change sitting on a timer — and hold the disclosure honest so a reader
 * is told the truth about how old the number in front of them is.
 */
describe('the price table says how old it is, once and accurately', () => {
  it('derives the headline date from the providers rather than repeating it', () => {
    const dates = Object.values(PROVIDER_REVIEWED);
    assert.ok(dates.length >= 5, `only ${dates.length} providers carry a review date`);
    assert.equal(
      PRICING_LAST_REVIEWED,
      [...dates].sort()[0],
      'the catalogue date is not the oldest provider date',
    );
  });

  it('has a review date for every provider it prices, and no others', () => {
    const priced = new Set(MODELS.map((model) => model.provider).filter(Boolean));
    const reviewed = new Set(Object.keys(PROVIDER_REVIEWED));
    for (const provider of priced) {
      assert.ok(
        reviewed.has(provider),
        `${provider} is priced but has no review date — its figures have no provenance`,
      );
    }
    for (const provider of reviewed) {
      assert.ok(
        priced.has(provider),
        `${provider} carries a review date but prices nothing`,
      );
    }
  });

  it('never claims a review that has not happened yet', () => {
    for (const [provider, date] of Object.entries(PROVIDER_REVIEWED)) {
      assert.match(date, /^\d{4}-\d{2}-\d{2}$/, `${provider}'s review date is not a date`);
      assert.notEqual(
        reviewAgeDays(date, new Date()),
        null,
        `${provider} was reviewed in the future — a typo or a clock, either way not an age`,
      );
    }
  });

  /**
   * A promotion is a price with an expiry written next to it, and an expiry is
   * the one price change this table can see coming.
   *
   * Checking that the window has already closed would be useless: it fires on
   * the first day the figures are wrong, which is the day the reader finds out
   * anyway. The lead time comes from the cadence this product already
   * publishes — it tells readers it treats its table as current for
   * `STALE_PRICING_DAYS` — so a promotion expiring inside that window will
   * expire before the next review this tool promises, and has to be resolved
   * now rather than then.
   *
   * Sonnet 5 is why. Its promotion ran to 2026-08-31 over a base price of
   * 3/15, Anthropic cancelled the increase and made 2/10 standard, and nothing
   * here knew: on 2026-09-01 every Sonnet 5 figure would have risen 50% by
   * itself. This check would have asked the question on 2026-07-17.
   */
  /**
   * What "resolved" means, once the question has been asked.
   *
   * The check above this one's first version could not be satisfied by doing
   * what it asks. It failed on 2026-11-16 for Gemini 3.6 and 3.8 Flash, whose
   * introductory price ends 2026-12-31; the page was read that day and said
   * the same thing; and the only ways to make the check pass were to delete a
   * promotion Google still runs or to wait out 45 red days. So a promotion
   * records the day its end was last confirmed on the provider's page
   * (`promo.confirmedOn`), and the question is whether that day falls inside
   * the window. A provider that cancels the rise after the confirmation is
   * what the weekly re-reads are for; no offline check knows.
   *
   * A promotion whose window has closed is refused outright: the price moved
   * on its own that morning, and the row should now say so plainly, with the
   * old figures in `history` for the logs that predate it.
   */
  const day = (ms) => new Date(ms).toISOString().slice(0, 10);
  const promotionProblem = (model, now) => {
    const { until, confirmedOn } = model.promo;
    const today = day(now);
    if (until < today) {
      return `${model.id}'s promotion ended ${until}. Its price changed on its own that day: move the `
        + 'promotional figures to `history` and delete `promo`.';
    }
    if (until > day(now + STALE_PRICING_DAYS * 86_400_000)) return null;
    const windowOpens = day(Date.parse(`${until}T00:00:00Z`) - STALE_PRICING_DAYS * 86_400_000);
    if (confirmedOn !== undefined && confirmedOn > today) {
      return `${model.id}'s promotion was confirmed on ${confirmedOn}, which has not happened yet.`;
    }
    if (confirmedOn === undefined || confirmedOn < windowOpens) {
      return `${model.id}'s promotion ends ${until}, inside the ${STALE_PRICING_DAYS} `
        + 'days this tool calls its table current. Ask the provider what it charges after '
        + 'that and write the answer as the price — left alone, this record changes the '
        + 'figure on its own. If the page still says the same, record the day it was read as '
        + `\`promo.confirmedOn\` (on or after ${windowOpens}).`;
    }
    return null;
  };

  it('carries no promotion that expires before the next review is due, unless its end was just confirmed', () => {
    for (const model of MODELS) {
      if (!model.promo) continue;
      assert.equal(promotionProblem(model, Date.now()), null);
    }
  });

  it('asks the question 45 days out, takes a dated answer, and refuses a promotion left to lapse', () => {
    const promoted = (promo) => ({ id: 'model-x', promo: { inputPerMTok: 1, outputPerMTok: 2, ...promo } });
    const at = (iso) => Date.parse(`${iso}T12:00:00Z`);
    // Far from its end: nothing to ask yet.
    assert.equal(promotionProblem(promoted({ until: '2026-12-31' }), at('2026-11-15')), null);
    // 45 days out and nobody has looked: the alarm.
    assert.match(promotionProblem(promoted({ until: '2026-12-31' }), at('2026-11-16')), /Ask the provider.*on or after 2026-11-16/);
    // A confirmation from before the window is not an answer to the question.
    assert.match(promotionProblem(promoted({ until: '2026-12-31', confirmedOn: '2026-10-10' }), at('2026-11-16')), /Ask the provider/);
    // Read again inside the window: answered, until the day the promotion ends.
    assert.equal(promotionProblem(promoted({ until: '2026-12-31', confirmedOn: '2026-11-16' }), at('2026-11-16')), null);
    assert.equal(promotionProblem(promoted({ until: '2026-12-31', confirmedOn: '2026-11-16' }), at('2026-12-31')), null);
    // A date nobody could have read the page on.
    assert.match(promotionProblem(promoted({ until: '2026-12-31', confirmedOn: '2026-12-25' }), at('2026-11-20')), /has not happened yet/);
    // The window closed: a confirmation does not keep a lapsed promotion.
    assert.match(promotionProblem(promoted({ until: '2026-12-31', confirmedOn: '2026-11-16' }), at('2027-01-01')), /ended 2026-12-31.*history/);
  });
});

/**
 * A change a provider has announced for a day, and this table has not made.
 *
 * A promotion is one kind of dated change and `promo` holds it. Google
 * announced another on its pricing and deprecation pages, read 2026-11-16:
 * "Effective December 1, 2026, all API requests to `gemini-2.5-pro` will
 * automatically route to Gemini 3.8 Flash and be billed at Gemini 3.8 Flash
 * rates", and `gemini-2.5-flash` to Gemini 3.5 Flash-Lite the same way. That
 * is a day with no instant, so it cannot be written as a period of `history`
 * yet, and a row that changed early would misprice every call until then.
 *
 * So it is written down here, where the calendar can reach it. Each entry
 * names a row, the day, and what the provider said; the row's note has to say
 * it too, so a reader of the bill is told before the day; and from the day
 * itself this fails until somebody re-reads the page, changes the row and
 * removes the entry. An announcement nobody acts on is a wrong price with a
 * date on it.
 */
describe('a change a provider announced for a day', () => {
  const ANNOUNCED = [
    {
      id: 'gemini-2.5-pro',
      on: '2026-12-01',
      what: 'Google routes every request to gemini-3.8-flash and bills it at that model\'s rates',
      billedAs: 'gemini-3.8-flash',
    },
    {
      id: 'gemini-2.5-flash',
      on: '2026-12-01',
      what: 'Google routes every request to gemini-3.5-flash-lite and bills it at that model\'s rates',
      billedAs: 'gemini-3.5-flash-lite',
    },
  ];
  const announcementProblem = (entry, now, models = MODELS) => {
    const row = models.find((model) => model.id === entry.id);
    if (row === undefined) return `${entry.id} is announced to change on ${entry.on} and is not in the catalogue.`;
    if (!models.some((model) => model.id === entry.billedAs)) {
      return `${entry.id} will be billed as ${entry.billedAs} from ${entry.on}, and the catalogue has no price for ${entry.billedAs}.`;
    }
    if (!(row.notes ?? '').includes(entry.on)) {
      return `${entry.id} changes on ${entry.on} (${entry.what}) and its note does not name that day.`;
    }
    if (new Date(now).toISOString().slice(0, 10) >= entry.on) {
      return `${entry.id}: ${entry.what} since ${entry.on}. Re-read the provider's page, change the row `
        + '(the old price goes into `history`), and remove this entry.';
    }
    return null;
  };

  it('is named in the row it changes, has a price to change to, and has not arrived unanswered', () => {
    for (const entry of ANNOUNCED) assert.equal(announcementProblem(entry, Date.now()), null);
  });

  it('waits until the day, then fails until the row is changed', () => {
    const at = (date) => Date.parse(`${date}T12:00:00Z`);
    const entry = { id: 'old', on: '2026-12-01', what: 'it is billed as new', billedAs: 'new' };
    const rows = [{ id: 'old', notes: 'Billed as new from 2026-12-01.' }, { id: 'new' }];
    assert.equal(announcementProblem(entry, at('2026-11-30'), rows), null);
    assert.match(announcementProblem(entry, at('2026-12-01'), rows), /since 2026-12-01\. Re-read/);
    assert.match(announcementProblem(entry, at('2027-02-01'), rows), /since 2026-12-01/);
    // The reader of a bill is told before the day, by the row's own note.
    assert.match(announcementProblem(entry, at('2026-11-20'), [{ id: 'old', notes: 'Retired.' }, { id: 'new' }]), /does not name that day/);
    // A model cannot be billed as one this table cannot price.
    assert.match(announcementProblem(entry, at('2026-11-20'), [rows[0]]), /no price for new/);
    assert.match(announcementProblem(entry, at('2026-11-20'), [rows[1]]), /not in the catalogue/);
  });
});

/**
 * The one table in the documentation that is arithmetic on the price list.
 *
 * `docs/commands.md` and the doc comment on `levers.ts` both print what moving
 * a call down a tier is worth, and both had it typed. It read "Opus 5 →
 * Sonnet 5 is 40% off", computed from Sonnet 5's 3/15 list price while every
 * test, every transcript and the product itself used the 2/10 it was actually
 * charged at — so the headline figure in the lever table disagreed with the
 * output printed four lines below it. Correcting the price made it 60%, and
 * typed once more it would drift again on the next price change.
 */
describe('what the documentation says a tier step is worth', () => {
  const savingBetween = (fromId, toId) => {
    const from = MODELS.find((model) => model.id === fromId);
    const to = MODELS.find((model) => model.id === toId);
    assert.ok(from && to, `${fromId} or ${toId} is not in the catalogue`);
    const onInput = 1 - to.inputPerMTok / from.inputPerMTok;
    const onOutput = 1 - to.outputPerMTok / from.outputPerMTok;
    assert.equal(
      Math.round(onInput * 100),
      Math.round(onOutput * 100),
      `${fromId} → ${toId} saves a different share on input than on output; `
        + 'one percentage cannot describe the step any more',
    );
    return Math.round(onInput * 100);
  };

  const STEPS = [
    { from: 'claude-opus-5', to: 'claude-sonnet-5' },
    { from: 'claude-opus-5', to: 'claude-haiku-4-5' },
  ];

  it('is the arithmetic on the prices, wherever it is printed', () => {
    const written = [
      { path: 'docs/commands.md', text: read('docs/commands.md') },
      { path: 'packages/core/src/levers.ts', text: read('packages/core/src/levers.ts') },
    ];
    let checked = 0;
    for (const { from, to } of STEPS) {
      const saving = savingBetween(from, to);
      /* The table names models the way prose does: "Sonnet 5", not "Claude Sonnet 5". */
      const target = MODELS.find((model) => model.id === to).displayName.replace(/^Claude /, '');
      for (const { path, text } of written) {
        const row = text.split('\n').find((line) => line.includes('which model the call goes to'));
        assert.ok(row !== undefined, `${path} no longer has the lever table`);
        const said = row.match(new RegExp(`${target}[^|]*?\\*{0,2}(\\d+)\\*{0,2}%`));
        assert.ok(said !== null, `${path}'s lever table states no figure for ${target}`);
        assert.equal(
          Number(said[1]),
          saving,
          `${path} says moving to ${target} is ${said[1]}% off; the prices make it ${saving}%`,
        );
        checked += 1;
      }
    }
    assert.equal(checked, STEPS.length * written.length);
  });
});

/**
 * The same arithmetic as a span, which is where it did the most damage.
 *
 * "which model a call goes to moves 40% to 80%" is the product's headline
 * argument, and its floor is Opus 5 → Sonnet 5 while its ceiling is Opus 5 →
 * Haiku 4.5. The floor was computed from Sonnet 5's $3/$15 list price, so when
 * that price turned out to be $2/$10 the sentence was wrong in thirteen
 * places at once: both CLI locales, the type that documents them, the README,
 * the Claude Code skill and the plugin copy generated from it, and the landing
 * in five languages plus its proof row. It is the first thing a visitor reads.
 *
 * Written differently in each language — `40% to 80%`, `del 40% al 80%`,
 * `40–80 %`, `40 bis 80 %` — so the ceiling is what this looks for and the
 * number in front of it is what it checks.
 */
describe('the span a model switch is worth', () => {
  const SPANS = [
    'packages/cli/src/i18n/en.ts',
    'packages/cli/src/i18n/es.ts',
    'packages/cli/src/i18n/types.ts',
    'packages/cli/src/index.ts',
    'README.md',
    '.claude/skills/trazum/SKILL.md',
    'plugin/skills/trazum/SKILL.md',
    'apps/web/app/landing/page.tsx',
  ];

  it('states the prices as its floor and its ceiling, in every language', () => {
    const from = MODELS.find((model) => model.id === 'claude-opus-5');
    const toFloor = MODELS.find((model) => model.id === 'claude-sonnet-5');
    const toCeiling = MODELS.find((model) => model.id === 'claude-haiku-4-5');
    assert.ok(from && toFloor && toCeiling, 'the three models this span is drawn from are gone');
    const floor = Math.round((1 - toFloor.inputPerMTok / from.inputPerMTok) * 100);
    const ceiling = Math.round((1 - toCeiling.inputPerMTok / from.inputPerMTok) * 100);

    /* `40% to 80%`, `del 40% al 80%`, `40–80 %`, `40 bis 80 %`, `40-80%`. */
    const span = new RegExp(`(\\d+)\\s*%?\\s*(?:to|al|a|à|bis|[–-])\\s*${ceiling}\\s*%`, 'g');
    let found = 0;
    for (const path of SPANS) {
      const text = read(path);
      for (const match of text.matchAll(span)) {
        found += 1;
        assert.equal(
          Number(match[1]),
          floor,
          `${path} says the span starts at ${match[1]}%; Opus 5 → Sonnet 5 is ${floor}% off`,
        );
      }
    }
    assert.ok(found >= 10, `only ${found} statements of the span found across ${SPANS.length} files`);
  });
});

describe('the staleness threshold is one number', () => {
  const sources = () => {
    const found = [];
    const walk = (absolute) => {
      /* Entry types off the one readdir, so no name is stat'd separately. */
      for (const entry of readdirSync(absolute, { withFileTypes: true })) {
        const name = entry.name;
        if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue;
        const child = join(absolute, name);
        if (entry.isDirectory()) {
          walk(child);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(name) || name.endsWith('.d.ts')) continue;
        found.push({ path: relative(ROOT, child), code: readFileSync(child, 'utf8') });
      }
    };
    for (const root of ['packages/core/src', 'packages/cli/src', 'packages/mcp/src', 'apps/web']) {
      walk(join(ROOT, root));
    }
    return found;
  };

  it('reads the sources it claims to read', () => {
    const found = sources();
    assert.ok(found.length >= 50, `only ${found.length} sources walked`);
    assert.ok(found.some((file) => file.path === 'packages/core/src/pricing.ts'));
  });

  it('is compared against nowhere but the constant', () => {
    /*
      `pricingAge > 45`, `staleDays >= 30`, and every spelling in between.
      Named narrowly on purpose: a cookie's `maxAge < 0` is an age compared to a
      number and has nothing to do with this, so the identifier has to say it is
      about pricing, review or staleness before the comparison is anyone's business.
    */
    const literal = /\b\w*(?:[Pp]ricing|[Rr]eview|[Ss]tale)\w*\s*(?:[<>]=?|===|!==)\s*\d+/;
    for (const { path, code } of sources()) {
      for (const line of code.split('\n')) {
        const match = line.match(literal);
        if (match === null) continue;
        assert.fail(
          `${path} compares an age against a typed number: ${match[0]}. `
            + 'Import STALE_PRICING_DAYS — three surfaces used to keep their own copy of it, '
            + 'and a reader was told one threshold while another was applied.',
        );
      }
    }
  });

  it('is the number every locale tells the reader', () => {
    const locales = [
      'apps/web/lib/i18n/en.ts',
      'apps/web/lib/i18n/es.ts',
      'packages/cli/src/i18n/en.ts',
      'packages/cli/src/i18n/es.ts',
    ];
    let checked = 0;
    for (const path of locales) {
      const source = read(path);
      const at = source.indexOf('pricesStale:');
      assert.notEqual(at, -1, `${path} has no pricesStale sentence`);
      /* The sentence runs to the next key at the same indentation. */
      const rest = source.slice(at);
      const ends = rest.slice(20).search(/\n {4}\S/);
      const sentence = ends === -1 ? rest : rest.slice(0, 20 + ends);
      const numbers = [...sentence.matchAll(/(?<![$\w{])\b(\d+)\b/g)].map((m) => Number(m[1]));
      assert.ok(numbers.length > 0, `${path}'s pricesStale sentence states no threshold`);
      for (const number of numbers) {
        assert.equal(
          number,
          STALE_PRICING_DAYS,
          `${path} tells the reader ${number} days; STALE_PRICING_DAYS is ${STALE_PRICING_DAYS}`,
        );
      }
      checked += 1;
    }
    assert.equal(checked, locales.length);
  });
});
