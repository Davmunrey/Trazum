import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { estimateTokens } from '../dist/index.js';
import { digestOf } from '../../../scripts/corpus-digest.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const corpusDir = join(here, 'corpus');
const fixturesDir = join(here, 'fixtures');
const truthPath = join(fixturesDir, 'token-ground-truth.json');

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
 *
 * **One band, one tokenizer, and the difference is load-bearing.** The script
 * can also measure against DeepSeek, which answers a question the roadmap has
 * open — Trazum prices seven providers with an estimator tuned for one, and
 * nobody has measured how far off the others are. It does *not* answer the
 * published claim. `±15%` is Claude-calibrated, so only the Anthropic fixture
 * asserts it; every other fixture is measured, reported, and asserted against
 * nothing it was never calibrated for. Reading a DeepSeek number as the
 * published band would be the same class of error as calling a release
 * published because a changelog heading exists.
 */

const PUBLISHED_BAND = 0.15;

const corpusFiles = readdirSync(corpusDir).filter((n) => n.endsWith('.txt')).sort();



const corpus = corpusFiles.map((name) => [name, readFileSync(join(corpusDir, name), 'utf8')]);
const truth = existsSync(truthPath) ? JSON.parse(readFileSync(truthPath, 'utf8')) : null;

describe('the freshness check can actually pass', () => {
  it('the script and this file compute one digest, not two that agree', () => {
    /**
     * They did not agree. The script joined the corpus with NUL separators and
     * this file joined it with spaces, so the digests could never match — and
     * the very first real measurement would have failed the freshness check
     * with *"the corpus changed since it was measured — re-run
     * scripts/measure-token-band.mjs"*, which produces the same failure however
     * many times somebody follows it.
     *
     * It went unnoticed because running the script costs an API key nobody had
     * spent: the one workflow that discharges this project's central claim had
     * never been executed end to end. The check guarding it was broken in the
     * way that only shows up the first time it matters.
     *
     * Fixed structurally rather than by making the two copies match, because
     * two copies matching is the state it was already in when it broke. There
     * is one implementation now, and this asserts that neither side has grown a
     * second.
     */
    const script = readFileSync(join(here, '..', '..', '..', 'scripts', 'measure-token-band.mjs'), 'utf8');
    const self = readFileSync(join(here, 'token-band.test.js'), 'utf8');

    // Built at runtime so the needle is not sitting in the haystack: written as
    // a literal, this assertion matches its own source and fails on the file it
    // is defending.
    const hashing = new RegExp(['create', 'Hash'].join(''));

    for (const [name, source] of [['the script', script], ['this file', self]]) {
      assert.match(source, /import \{ digestOf \}/, `${name} does not import the shared digest`);
      assert.doesNotMatch(
        source,
        hashing,
        `${name} hashes the corpus itself again — that is how the two drifted apart`,
      );
    }
  });
});

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

  it('is the tokenizer the band was calibrated on', () => {
    // The fixture that governs the published number has to be the Anthropic
    // one. If somebody points this file at a cross-family measurement, the
    // ±15% assertions below would be checking the estimator against a
    // tokenizer it was never tuned for, and failing for the right reason with
    // completely the wrong message.
    assert.equal(truth.provider ?? 'anthropic', 'anthropic');
    assert.notEqual(truth.governsPublishedBand, false);
  });

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

describe('the estimator against tokenizers it was never tuned for', () => {
  /**
   * The cross-family question, and it is genuinely open.
   *
   * 1.5.0 priced seven providers against an estimator calibrated on one. The
   * roadmap says what turns on the answer: *"within 5% across families and [a
   * real tokenizer dependency] is not [worth taking]; 40% out and it is."*
   * Nobody has run it, so nobody knows.
   *
   * These fixtures assert nothing about `±15%`, on purpose. That band is a
   * claim about Claude, and holding a DeepSeek measurement to it would be
   * asserting a promise nobody made. What is asserted is that the numbers
   * describe the corpus as it stands and cover all of it — the same two things
   * that stop any fixture quietly describing something else — and the error is
   * printed so the open question has a number attached to it.
   */
  /**
   * `existsSync` first, and the reason is embarrassing enough to write down.
   *
   * `fixtures/` does not exist on a clean checkout — `scripts/measure-token-band.mjs`
   * creates it, and nobody has run it. So this `readdirSync` threw ENOENT during
   * suite construction on every CI run, node's test runner printed the stack as a
   * diagnostic, reported `fail 0`, and **exited 0**.
   *
   * Which is precisely what the top of this file forbids: *"'0 failures' from a
   * check that measured nothing is the most misleading thing a suite can report."*
   * The skip below was written for a directory that exists and holds no
   * per-provider file; it never covered the directory being absent, which is the
   * normal state of this repository.
   */
  const others = existsSync(fixturesDir)
    ? readdirSync(fixturesDir)
        .filter((name) => /^token-ground-truth\..+\.json$/.test(name))
        .sort()
    : [];

  if (others.length === 0) {
    it('has not been measured for any other provider', {
      skip: 'run scripts/measure-token-band.mjs --provider deepseek',
    }, () => {});
    return;
  }

  for (const name of others) {
    const other = JSON.parse(readFileSync(join(fixturesDir, name), 'utf8'));

    describe(other.provider ?? name, () => {
      it('does not claim to govern the published band', () => {
        // The guard against the whole hazard: a cross-family fixture that says
        // it is the authority would let the assertions above run against the
        // wrong tokenizer.
        assert.equal(other.governsPublishedBand, false, `${name} claims the published band`);
        assert.notEqual(other.provider, 'anthropic');
      });

      it('was measured against the corpus as it stands now', () => {
        assert.equal(
          other.corpusDigest,
          digestOf(corpus),
          `${name} describes a corpus that has since changed — re-run the script`,
        );
      });

      it('measured every sample', () => {
        const measured = new Set(other.samples.map((sample) => sample.file));
        const missing = corpusFiles.filter((file) => !measured.has(file));
        assert.deepEqual(missing, [], `never measured: ${missing.join(', ')}`);
      });

      it('reports how far the estimator is from this family', () => {
        const byType = new Map();
        for (const sample of other.samples) {
          const text = readFileSync(join(corpusDir, sample.file), 'utf8');
          const error = Math.abs(estimateTokens(text) - sample.actualTokens) / sample.actualTokens;
          byType.set(sample.type, Math.max(byType.get(sample.type) ?? 0, error));
        }

        const worst = [...byType.entries()].sort((a, b) => b[1] - a[1]);
        console.log(`      ${other.model} (${other.provider}) on ${other.measuredAt}:`);
        for (const [type, error] of worst) {
          console.log(`        ${type.padEnd(14)} ${(error * 100).toFixed(1)}%`);
        }
        console.log(
          `        worst ${(worst[0][1] * 100).toFixed(1)}% — the roadmap's threshold for ` +
            'taking a real tokenizer dependency is 5% good, 40% bad',
        );

        assert.ok(worst.length > 0, 'nothing was measured');
      });
    });
  }
});
