import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import * as realCore from '../dist/index.js';
import {
  CONFIRMED_DIFFERENCES,
  LITELLM_PROVIDERS,
  LITELLM_URL,
  compareLiteLlm,
  readLiteLlm,
  render,
} from '../../../scripts/price-crosscheck.mjs';
import { PAGES } from '../../../scripts/price-drift.mjs';

/**
 * `scripts/price-crosscheck.mjs`: LiteLLM's model list as a signal to re-read a
 * provider's page (#820).
 *
 * The LiteLLM file here is written for the test (`fixtures/litellm-sample.json`)
 * in the shape the real one has, and the catalogue is a small stand-in, so no
 * price of the real catalogue can move a result. Four things have to hold: a
 * model the catalogue lacks is reported, a rate that differs is reported, a rate
 * that matches is not, and a provider `price-drift.mjs` reads (or one this does
 * not cover) is never reported. A fifth is outside the logic: the script writes
 * nothing, least of all a price.
 */

const fixturePath = fileURLToPath(new URL('./fixtures/litellm-sample.json', import.meta.url));
const scriptPath = fileURLToPath(new URL('../../../scripts/price-crosscheck.mjs', import.meta.url));
const pricingPath = fileURLToPath(new URL('../src/pricing.ts', import.meta.url));
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));

const row = (id, provider, inputPerMTok, outputPerMTok, extra = {}) => ({ id, provider, inputPerMTok, outputPerMTok, ...extra });
const stubCore = {
  MODELS: [
    row('m-same', 'google', 1, 2, { multipliers: { cacheRead: 0.1 } }),
    row('m-diff', 'google', 1, 2),
    row('m-peak', 'google', 1, 2, { multipliers: { cacheRead: 0.1 }, tiers: [{ id: 'peak', inputPerMTok: 2, outputPerMTok: 4 }] }),
    row('m-retired', 'google', 1, 2, { retired: { on: '2026-08-28' } }),
    row('m-uncompared', 'google', 1, 2),
    row('deepseek-chat', 'deepseek', 0.3, 0.5),
    row('gpt-out-of-scope', 'openai', 1, 1),
  ],
  PROVIDER_REVIEWED: { google: '2026-11-16', deepseek: '2026-11-05', moonshot: '2026-11-05', xai: '2026-11-05', mistral: '2026-11-05' },
  effectivePricing: (model) => ({ inputPerMTok: model.inputPerMTok, outputPerMTok: model.outputPerMTok }),
  multipliersFor: (model) => ({ cacheRead: model.multipliers?.cacheRead ?? 0.1 }),
};
const SOURCES = { google: ['https://aistudio.google.com/docs/pricing'], deepseek: ['https://api-docs.deepseek.com/quick_start/pricing'] };

const ON = new Date('2026-11-19T12:00:00Z');
const run = () => compareLiteLlm(readLiteLlm(fixture), stubCore, SOURCES, ON);
const of = (findings, kind) => findings.filter((f) => f.kind === kind);

describe('the cross-check against LiteLLM', () => {
  it('reports a LiteLLM model the catalogue does not price', () => {
    const { findings } = run();
    assert.deepEqual(of(findings, 'missing').filter((f) => f.provider === 'google').map((f) => f.model).sort(), ['m-missing', 'm-same-001']);
  });

  it('reports a rate that differs, with the page and the date beside it', () => {
    const { findings } = run();
    const differs = of(findings, 'differs');
    assert.equal(differs.length, 1);
    assert.equal(differs[0].model, 'm-diff');
    assert.match(differs[0].detail, /input LiteLLM \$1\.5, catalogue \$1/);
    assert.ok(!/output LiteLLM/.test(differs[0].detail), 'the output rate matches and was reported');
    assert.match(differs[0].detail, /catalogue read 2026-11-16 at https:\/\/aistudio\.google\.com\/docs\/pricing/);
  });

  it('does not report a rate that matches, a cache read included', () => {
    const { findings, compared } = run();
    assert.ok(!findings.some((f) => f.model === 'm-same' && f.kind !== 'note'), 'm-same agrees on input, output and cache read');
    assert.equal(compared.google, 3);
    assert.equal(compared.deepseek, 1);
  });

  it('strips the provider prefix and only that: a bare key and a prefixed key are one id, a suffix is not stripped', () => {
    const { findings } = run();
    assert.ok(!findings.some((f) => f.model === 'deepseek-chat' && f.kind !== 'note'));
    assert.ok(findings.some((f) => f.model === 'm-same-001' && f.kind === 'missing'), 'm-same-001 was fuzzy-matched to m-same');
  });

  it('never reports a provider out of scope, and ignores what is not priced per token', () => {
    const { findings } = run();
    const text = JSON.stringify(findings);
    for (const name of ['gpt-out-of-scope', 'claude-out-of-scope', 'm-embedding', 'sample_spec']) assert.ok(!text.includes(name), `${name} was reported`);
    assert.ok(!findings.some((f) => f.provider === 'openai' || f.provider === 'anthropic'));
    assert.ok(!findings.some((f) => f.kind === 'differs' && /\$7/.test(f.detail)), 'a Vertex AI row was compared as Google');
  });

  it('takes a rate that matches a tier of the row as agreement, and names the tier in a note', () => {
    const { findings } = run();
    assert.ok(!findings.some((f) => f.model === 'm-peak' && f.kind === 'differs'), 'a peak-tier rate, cache read included, was reported as a difference');
    const note = findings.find((f) => f.model === 'm-peak' && f.kind === 'note');
    assert.match(note?.detail ?? '', /match the peak tier, not the base row/);
  });

  it('does not compare a retired row, and says it was retired', () => {
    const { findings } = run();
    assert.ok(!findings.some((f) => f.model === 'm-retired' && f.kind === 'differs'), 'a retired row was reported as a difference');
    assert.match(findings.find((f) => f.model === 'm-retired' && f.kind === 'note')?.detail ?? '', /retired in the catalogue on 2026-08-28/);
  });

  it('lists a catalogue model LiteLLM does not list as a note, not a guess', () => {
    const { findings } = run();
    assert.ok(findings.some((f) => f.kind === 'note' && f.model === 'm-uncompared'));
  });

  it('is unread, not clean, when LiteLLM holds nothing for a provider', () => {
    const { findings } = compareLiteLlm(readLiteLlm({}), stubCore, SOURCES);
    assert.deepEqual(of(findings, 'unread').map((f) => f.provider).sort(), Object.keys(LITELLM_PROVIDERS).sort());
  });

  it('says LiteLLM is a signal, not a source, and that nothing was copied', () => {
    const { findings, compared } = run();
    assert.match(render(findings, compared)[0], /signal, not a source: nothing below was copied/);
  });

  it('covers exactly the providers price-drift does not read', () => {
    const covered = Object.keys(LITELLM_PROVIDERS).sort();
    assert.deepEqual(covered, Object.keys(realCore.PROVIDER_REVIEWED).filter((p) => !(p in PAGES)).sort());
    assert.deepEqual(CONFIRMED_DIFFERENCES, {});
    assert.match(LITELLM_URL, /^https:\/\/raw\.githubusercontent\.com\/BerriAI\/litellm\/main\/model_prices_and_context_window\.json$/);
  });
});

describe('the script writes nothing', () => {
  const digest = () => createHash('sha256').update(readFileSync(pricingPath)).digest('hex');

  it('leaves pricing.ts as it found it, and prints the report on the fixture', () => {
    const before = digest();
    const out = execFileSync(process.execPath, [scriptPath, '--report', '--litellm-file', fixturePath], { encoding: 'utf8' });
    assert.equal(digest(), before, 'the script changed pricing.ts');
    assert.match(out, /signal, not a source/);
    assert.match(out, /MISSING {2}google m-missing/);
  });

  it('holds no call that writes a file', () => {
    const source = readFileSync(scriptPath, 'utf8');
    assert.ok(!/writeFile|appendFile|createWriteStream|copyFile|rename|unlink|rmSync|mkdirSync|openSync/.test(source), 'the script names a call that writes');
    assert.ok(/import \{ readFileSync \} from 'node:fs'/.test(source));
  });
});
