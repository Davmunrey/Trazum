import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { estimateTokens } from '../dist/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const corpusDir = join(here, 'corpus');
const truthPath = join(here, 'fixtures', 'token-ground-truth.json');

/**
 * The accuracy claim, checked.
 *
 * `±15%` is printed on every report, appears in both READMEs, in the estimator's
 * own doc comment and in VERSIONING.md as part of the frozen API. Every dollar
 * figure Trazum prints descends from it — and until this file existed, the
 * estimator was tested for exactly three things: zero on empty input, monotonic
 * growth, and never returning NaN. Nothing measured its accuracy at all.
 *
 * This repository's security suite opens with *"a promise nobody checks is a
 * promise that expires."* The error band is precisely such a promise, and it is
 * the one the product's central claim rests on.
 *
 * Ground truth comes from the official counting endpoint, which cannot run here:
 * it needs a key, and the deterministic core stays offline. So the numbers are
 * committed as a fixture that `scripts/measure-token-band.mjs` writes.
 */

const PUBLISHED_BAND = 0.15;

const corpusFiles = readdirSync(corpusDir).filter((n) => n.endsWith('.txt')).sort();

const digestOf = (entries) => {
  const hash = createHash('sha256');
  for (const [name, text] of entries) hash.update(`${name} ${text} `);
  return hash.digest('hex').slice(0, 16);
};

const corpus = corpusFiles.map((name) => [name, readFileSync(join(corpusDir, name), 'utf8')]);
const truth = existsSync(truthPath) ? JSON.parse(readFileSync(truthPath, 'utf8')) : null;

describe('the corpus itself', () => {
  // These run whether or not anything has been measured. A corpus that has
  // rotted is worth knowing about before somebody spends a key measuring it.

  it('covers every text type the estimator treats differently', () => {
    // The estimator is calibrated per character class — words, digits,
    // punctuation, newlines, CJK, astral symbols. A corpus of English prose
    // would measure one of those branches and report a band for all of them.
    const TYPES = ['prose-latin', 'cjk', 'code', 'few-shot', 'punctuation', 'numeric'];
    const covered = new Set();

    for (const [, text] of corpus) {
      if (/[぀-ヿ一-鿿]/.test(text)) covered.add('cjk');
      if (/```/.test(text)) covered.add('code');
      if (/^Input:/m.test(text) && /^Output:/m.test(text)) covered.add('few-shot');
      if (/\|.*\|/.test(text)) covered.add('punctuation');
      if (/\d{1,3}(,\d{3})+\.\d{2}/.test(text)) covered.add('numeric');
      if (/\b(the|que)\b/.test(text)) covered.add('prose-latin');
    }

    const uncovered = TYPES.filter((t) => !covered.has(t));
    assert.deepEqual(uncovered, [], `no corpus sample exercises: ${uncovered.join(', ')}`);
  });

  it('is made of samples long enough to measure anything', () => {
    // A twenty-character sample makes the band look excellent, because the
    // estimator's rounding is a small absolute error on a small number.
    //
    // Measured in tokens rather than characters, because characters are the
    // wrong unit for exactly the reason this corpus exists: 306 characters of
    // Chinese carry about as many tokens as 1,300 characters of English, and a
    // character floor would reject the densest sample in the set.
    //
    // Using the estimator to size the corpus that measures the estimator is
    // circular, but harmlessly so — this is an order-of-magnitude floor, not a
    // measurement, and an estimator wrong enough to break it would fail every
    // band assertion below anyway.
    for (const [name, text] of corpus) {
      const tokens = estimateTokens(text);
      assert.ok(tokens > 150, `${name} is ~${tokens} tokens, too short to be evidence`);
    }
  });
});

describe('the published error band', () => {
  if (truth === null) {
    // Not silently green. "0 failures" from a check that measured nothing is the
    // most misleading thing this suite could report — the same reasoning that
    // makes `trazum check` treat an unbudgeted run as an error rather than a
    // pass. A skip says so out loud and names the command that fixes it.
    it('has not been measured yet', { skip: 'run scripts/measure-token-band.mjs' }, () => {});

    it('is therefore described as a claim rather than a measurement', () => {
      // Until the fixture exists, the documentation must not say the band was
      // measured. This is the assertion that stops "±15%" quietly hardening from
      // an estimate into a fact nobody established.
      const tokenizer = readFileSync(join(here, '..', 'src', 'tokenizer.ts'), 'utf8');
      assert.match(
        tokenizer,
        /not been measured|unverified|pending measurement/i,
        'the tokenizer claims a band without saying it is unverified, and no ground truth exists',
      );
    });
    return;
  }

  it('was measured against the corpus as it stands now', () => {
    // A fixture describing text that has since been edited is worse than no
    // fixture: it passes, and it is describing something else.
    assert.equal(
      truth.corpusDigest,
      digestOf(corpus),
      'the corpus changed since it was measured — re-run scripts/measure-token-band.mjs',
    );
  });

  it('measured every sample in the corpus', () => {
    const measured = new Set(truth.samples.map((s) => s.file));
    const missing = corpusFiles.filter((n) => !measured.has(n));
    assert.deepEqual(missing, [], `never measured: ${missing.join(', ')}`);
  });

  for (const sample of truth?.samples ?? []) {
    it(`holds for ${sample.file} (${sample.type})`, () => {
      const text = readFileSync(join(corpusDir, sample.file), 'utf8');
      const estimated = estimateTokens(text);
      const error = Math.abs(estimated - sample.actualTokens) / sample.actualTokens;

      assert.ok(
        error <= PUBLISHED_BAND,
        `${sample.file}: estimated ${estimated}, actual ${sample.actualTokens} — ` +
          `${(error * 100).toFixed(1)}% error, outside the published ±${PUBLISHED_BAND * 100}%. ` +
          'Either the estimator needs work for this text type, or the reports need to ' +
          'stop printing one band for all text.',
      );
    });
  }

  it('reports the worst type, so the band is a finding rather than a hope', () => {
    // Not an assertion about a threshold — a printed summary. If prose is 4% out
    // and CJK is 14%, the band technically holds and the report saying ±15% for
    // both is still misleading. This is what makes that visible.
    const byType = new Map();
    for (const sample of truth.samples) {
      const text = readFileSync(join(corpusDir, sample.file), 'utf8');
      const error = Math.abs(estimateTokens(text) - sample.actualTokens) / sample.actualTokens;
      byType.set(sample.type, Math.max(byType.get(sample.type) ?? 0, error));
    }

    const worst = [...byType.entries()].sort((a, b) => b[1] - a[1]);
    console.log(`      measured against ${truth.model} on ${truth.measuredAt}:`);
    for (const [type, error] of worst) {
      console.log(`        ${type.padEnd(14)} ${(error * 100).toFixed(1)}%`);
    }

    assert.ok(worst.length > 0, 'nothing was measured');
  });
});
