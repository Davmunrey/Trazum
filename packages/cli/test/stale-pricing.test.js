import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';
import {
  BUNDLED_CATALOGUE,
  PRICING_LAST_REVIEWED,
  reviewAgeDays,
  reviewedForModels,
} from '../../core/dist/index.js';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/**
 * The price table's age, said out loud when it matters — and **whose** age.
 *
 * These tests pin the rule, not the calendar: whether the line appears is
 * derived from a review date at run time, so a freshly reviewed table passes
 * the same suite a stale one does, asserting the opposite behaviour.
 *
 * The date they derive it from changed, and that is the point of the suite
 * now. It used to be `PRICING_LAST_REVIEWED`, the **oldest provider's** —
 * which made this file assert the defect: a log of Claude calls warned that
 * the table behind every dollar in it was reviewed on a date belonging to two
 * models it never used. The date is the report's, so the fixture's own model
 * decides.
 */

const reviewedFor = (...models) => reviewedForModels(models, BUNDLED_CATALOGUE);
const ageOf = (date) => reviewAgeDays(date, new Date());
const staleAt = (date) => {
  const age = ageOf(date);
  return age !== null && age > 45;
};

/** The fixture below is priced by one Anthropic model, so this is its date. */
const REVIEWED = reviewedFor('claude-opus-5');
const AGE = ageOf(REVIEWED);
const STALE = staleAt(REVIEWED);

const write = async (records) => {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-stale-'));
  const path = join(dir, 'usage.jsonl');
  await writeFile(path, records.map((r) => JSON.stringify(r)).join('\n') + '\n');
  return { path, dir };
};

const call = { model: 'claude-opus-5', usage: { input_tokens: 200_000, output_tokens: 0 } };

const run = (argv) =>
  spawnSync(process.execPath, [CLI, 'profile', ...argv], {
    encoding: 'utf8',
    env: SPAWN_ENV,
    timeout: 30000,
  });

describe('the price table behind every dollar', () => {
  it(`terminal ${STALE ? 'warns past 45 days' : 'stays quiet inside 45 days'}, per the table's own date`, async () => {
    const { path } = await write([call]);
    const result = run([path]);
    assert.equal(result.status, 0);
    const text = `${result.stdout}${result.stderr}`.replace(/\s+/g, ' ');
    if (STALE) {
      assert.match(text, new RegExp(`last reviewed ${REVIEWED}`));
      assert.match(text, /past the 45/);
      assert.match(text, /wrong by exactly that change/);
    } else {
      assert.doesNotMatch(text, /past the 45/);
    }
  });

  it('rides --json as provenance data either way, in two parts', async () => {
    /**
     * Both questions, because they are not the same one and a consumer needs
     * whichever it is asking. `lastReviewed` is the table's oldest provider
     * and has always meant that; `reportReviewed` is the oldest among the
     * models actually priced here, and is what the warning is decided from.
     */
    const { path } = await write([call]);
    const result = run([path, '--json']);
    const report = JSON.parse(result.stdout);
    assert.equal(report.pricing.lastReviewed, PRICING_LAST_REVIEWED);
    assert.equal(report.pricing.ageDays, ageOf(PRICING_LAST_REVIEWED));
    assert.equal(report.pricing.reportReviewed, REVIEWED);
    assert.equal(report.pricing.reportAgeDays, AGE);
  });

  it('warns about the models in the log rather than the ones holding the table back', async () => {
    /**
     * The defect this suite used to assert.
     *
     * `grok-4` and `kimi-k2` are the two entries keeping the catalogue's date
     * at its oldest: neither provider lists them any more, so neither price
     * can be re-read and neither date can honestly move. Every report was
     * being qualified by them — including reports that never touch either.
     *
     * Skipped rather than faked on the day the two dates agree: with one date
     * across the table there is no distinction to test, and asserting one
     * anyway would be asserting the calendar.
     */
    const fresh = reviewedFor('claude-opus-5');
    const held = reviewedFor('claude-opus-5', 'grok-4');
    if (fresh === held) return;

    const clean = await write([call]);
    const mixed = await write([call, { model: 'grok-4', usage: { input_tokens: 1000, output_tokens: 10 } }]);

    const cleanText = `${run([clean.path]).stdout}`.replace(/\s+/g, ' ');
    const mixedText = `${run([mixed.path]).stdout}`.replace(/\s+/g, ' ');

    assert.equal(
      /past the 45/.test(cleanText),
      staleAt(fresh),
      'a report warned, or failed to warn, on a date belonging to models it does not use',
    );
    assert.equal(/past the 45/.test(mixedText), staleAt(held));
    if (staleAt(held)) assert.match(mixedText, new RegExp(`last reviewed ${held}`));
  });

  it('reaches the markdown with the same threshold', async () => {
    const { path, dir } = await write([call]);
    const out = join(dir, 'report.md');
    const result = run([path, '--markdown-out', out]);
    assert.equal(result.status, 0);
    const markdown = await readFile(out, 'utf8');
    if (STALE) {
      assert.match(markdown, /> ⚠️ .*past the 45/);
    } else {
      assert.doesNotMatch(markdown, /past the 45/);
    }
  });

  it('speaks Spanish', async () => {
    const { path } = await write([call]);
    const result = spawnSync(process.execPath, [CLI, 'profile', path, '--locale', 'es'], {
      encoding: 'utf8',
      env: SPAWN_ENV,
      timeout: 30000,
    });
    const text = `${result.stdout}${result.stderr}`.replace(/\s+/g, ' ');
    if (STALE) {
      assert.match(text, /más de los 45 que esta herramienta considera vigentes/);
    } else {
      assert.doesNotMatch(text, /más de los 45/);
    }
  });
});
