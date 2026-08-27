import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
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
  it('carries no promotion that expires before the next review is due', () => {
    const horizon = new Date(Date.now() + STALE_PRICING_DAYS * 86_400_000)
      .toISOString()
      .slice(0, 10);
    for (const model of MODELS) {
      if (!model.promo) continue;
      assert.ok(
        model.promo.until > horizon,
        `${model.id}'s promotion ends ${model.promo.until}, inside the ${STALE_PRICING_DAYS} `
          + 'days this tool calls its table current. Ask the provider what it charges after '
          + 'that and write the answer as the price — left alone, this record changes the '
          + 'figure on its own.',
      );
    }
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

describe('the staleness threshold is one number', () => {
  const sources = () => {
    const found = [];
    const walk = (absolute) => {
      for (const entry of readdirSync(absolute)) {
        if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue;
        const child = join(absolute, entry);
        if (statSync(child).isDirectory()) {
          walk(child);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(entry) || entry.endsWith('.d.ts')) continue;
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
