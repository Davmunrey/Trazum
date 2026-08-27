import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import {
  BANDS,
  ESTIMATE_ERROR_BAND_PCT,
  MEASURED_FOREIGN_ERROR_PCT,
  bandFor,
  bucketFor,
  estimateTokens,
  foreignTokenizer,
  measuredForeignError,
} from '../dist/index.js';
import { digestOf, digestOfOne } from '../../../scripts/corpus-digest.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const corpusDir = join(here, 'corpus');
const fixturesDir = join(here, 'fixtures');
const truthPath = join(fixturesDir, 'token-ground-truth.json');

/**
 * The accuracy claim, checked.
 *
 * `±10%` is printed on every report, appears in both READMEs, in the estimator's
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
 * published claim. `±10%` is Claude-calibrated, so only the Anthropic fixture
 * asserts it; every other fixture is measured, reported, and asserted against
 * nothing it was never calibrated for. Reading a DeepSeek number as the
 * published band would be the same class of error as calling a release
 * published because a changelog heading exists.
 */

/**
 * Imported, not repeated. This was `0.15` here while twenty-three other files
 * said the old band in prose, and the number the code publishes is now the only copy.
 */
const PUBLISHED_BAND = ESTIMATE_ERROR_BAND_PCT / 100;

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
      // Any of the shared helpers counts. Pinned to the exact `{ digestOf }`
      // spelling, this failed the moment `digestOfOne` was imported alongside it —
      // a guard that breaks when you use more of the thing it is protecting.
      assert.match(
        source,
        /import \{[^}]*\bdigestOf(One)?\b[^}]*\} from '.*corpus-digest\.mjs'/,
        `${name} does not import the shared digest`,
      );
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
      // measured. This is the assertion that stops "±10%" quietly hardening from
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

  /**
   * Per sample, not per corpus.
   *
   * The whole-corpus digest could not tell an *edited* file from an *added* one,
   * and answered both with "re-run the script" — right for an edit, wrong for an
   * addition, because it retires eight measurements that each cost an API call to
   * admit one new sample. That made the corpus effectively frozen: growing it was
   * gated on a key nobody wanted to spend.
   *
   * Split, the two cases get the treatment each deserves. A file that changed
   * since it was measured **fails**: its measurement now describes different text,
   * which is the dangerous case, because it passes while being wrong. A file with
   * no measurement **skips out loud** and is named, because a gap in coverage is
   * something to report rather than a reason to distrust what has been measured.
   */
  const measuredByFile = new Map((truth.samples ?? []).map((s) => [s.file, s]));

  it('every measurement still describes the file it measured', () => {
    const stale = [];
    for (const [file, sample] of measuredByFile) {
      const text = readFileSync(join(corpusDir, file), 'utf8');
      // A measurement written before per-sample digests existed carries none.
      // Fall back to the corpus digest so an old fixture is still checked rather
      // than waved through.
      const fresh = sample.digest
        ? sample.digest === digestOfOne(file, text)
        : truth.corpusDigest === digestOf(corpus);
      if (!fresh) stale.push(file);
    }
    assert.deepEqual(
      stale,
      [],
      `these changed since they were measured — re-run scripts/measure-token-band.mjs: ${stale.join(', ')}`,
    );
  });

  it('reports which samples have no measurement yet', () => {
    // Named, never silent. A corpus sample with no ground truth is a text type
    // whose accuracy nobody has established, and this suite exists precisely to
    // stop that being invisible.
    const unmeasured = corpusFiles.filter((n) => !measuredByFile.has(n));
    if (unmeasured.length > 0) {
      console.log(
        `\n  ${unmeasured.length} corpus sample(s) not yet measured, so no band is asserted for ` +
          `them: ${unmeasured.join(', ')}\n  Run ANTHROPIC_API_KEY=... npm run measure:tokens ` +
          '— the counting endpoint is free.\n',
      );
    }
    // Deliberately not an assertion. The corpus is allowed to grow ahead of the
    // measurements; what is not allowed is doing it quietly.
    assert.ok(corpusFiles.length >= truth.samples.length);
  });

  /**
   * The promise, in the only form that survived contact with the corpus.
   *
   * This used to hold every sample to one published `±10%`, and the message it
   * failed with named the fork it could not decide: *"either the estimator
   * needs work for this text type, or the reports need to stop printing one
   * band for all text."* Seven ordinary samples in the thin classes settled it.
   * The estimator is 4.6% out on prose and 32.5% out on a CSV ledger, and no
   * amount of constant-tuning closes that: searching the digit constant moves
   * one numeric sample inside the band and the other to 23.3% out.
   *
   * So the promise is no longer a number. It is: **whatever band Trazum prints
   * about a text, that text's measured error is inside it.** `bandFor` decides
   * what gets printed, so this is a check on the pair rather than on either
   * half, and it cannot be satisfied by widening one bucket — a sample sorted
   * into a friendlier one is given a smaller band and fails here.
   */
  for (const sample of truth?.samples ?? []) {
    it(`is inside the band it is given: ${sample.file} (${sample.type})`, () => {
      const text = readFileSync(join(corpusDir, sample.file), 'utf8');
      const estimated = estimateTokens(text);
      const error = (Math.abs(estimated - sample.actualTokens) / sample.actualTokens) * 100;
      const band = bandFor(text);

      assert.ok(
        error <= band,
        `${sample.file}: estimated ${estimated}, actual ${sample.actualTokens} — ` +
          `${error.toFixed(1)}% error, and bandFor put it in the "${bucketFor(text)}" bucket ` +
          `whose band is ±${band}%. Either the estimator got worse for this text, or the ` +
          'bucket is wrong for it, or the bucket\'s band no longer covers what it holds.',
      );
    });
  }

  it('gives no bucket a band narrower than the worst sample in it', () => {
    /**
     * The other direction, and the one that stops the bands from being a table
     * somebody edited. Each band has to be at least the worst measured error
     * among the samples that land in that bucket, so lowering a figure to make
     * the product look better fails here rather than in somebody's terminal.
     *
     * At least, not exactly: a band may be rounded up, and `numeric` is, from
     * 32.5 to 33. Requiring equality would make every re-measurement a source
     * edit, and a band that is wider than measured is the safe direction.
     */
    const worst = new Map();
    for (const sample of truth.samples) {
      const text = readFileSync(join(corpusDir, sample.file), 'utf8');
      const error = (Math.abs(estimateTokens(text) - sample.actualTokens) / sample.actualTokens) * 100;
      const bucket = bucketFor(text);
      worst.set(bucket, Math.max(worst.get(bucket) ?? 0, error));
    }
    const narrow = [...worst]
      .filter(([bucket, error]) => BANDS[bucket] < error)
      .map(([bucket, error]) => `${bucket}: band ±${BANDS[bucket]}% against a measured ${error.toFixed(1)}%`);
    assert.deepEqual(narrow, [], `these bands claim more accuracy than was measured: ${narrow.join('; ')}`);
  });

  it('covers every bucket with at least one measurement', () => {
    // A band nothing measured is a number somebody chose. Naming the gap is
    // what keeps a bucket from being added with a figure and no evidence.
    const measured = new Set(
      truth.samples.map((sample) => bucketFor(readFileSync(join(corpusDir, sample.file), 'utf8'))),
    );
    const empty = Object.keys(BANDS).filter((bucket) => !measured.has(bucket));
    assert.deepEqual(empty, [], `these bands rest on no sample at all: ${empty.join(', ')}`);
  });

  it('gives the narrowest band only to scripts it was measured on', () => {
    /**
     * The bug this was written for, planted one block at a time.
     *
     * `CJK` was five ranges typed as literal characters, and the last pair
     * meant to say *"compatibility ideographs, U+F900 to U+FAFF"*. Its opening
     * character was U+8C48 — the ordinary unified ideograph that shares the
     * glyph — so the range ran from U+8C48 to U+FAFF and took in the Yi
     * syllables, the private-use area and both surrogate halves along the way.
     * A page of astral emoji came out `cjk` and was handed ±4%: the narrowest
     * band in the file, about text nothing has ever measured.
     *
     * It survived every assertion above because no corpus sample lives in any
     * of those blocks, which is exactly what a planted character is for.
     * CodeQL found it; this keeps it found.
     */
    const outsideCjk = {
      'Yi syllables': '\u{A000}\u{A001}\u{A002}\u{A003}',
      'the private-use area': '\u{E000}\u{E001}\u{E002}\u{E003}',
      'astral emoji': '\u{1F600}\u{1F601}\u{1F602}\u{1F603}',
      'Hangul Jamo Extended-B': '\u{D7B0}\u{D7B1}\u{D7B2}\u{D7B3}',
    };
    for (const [what, text] of Object.entries(outsideCjk)) {
      assert.notEqual(
        bucketFor(text),
        'cjk',
        `${what} was sorted cjk and handed ±${BANDS.cjk}%, a band measured on none of it`,
      );
    }

    // And the silent half: a guard that rejects everything passes the four
    // above and breaks the feature. Each script the band was actually
    // measured on still sorts cjk.
    for (const [what, text] of Object.entries({
      hiragana: 'ひらがなのぶんしょう',
      katakana: 'カタカナノブンショウ',
      han: '这是一段中文文本内容',
      hangul: '한국어로쓴문장입니다',
      'compatibility ideographs': '\u{F900}\u{F901}\u{F902}\u{F903}',
    })) {
      assert.equal(bucketFor(text), 'cjk', `${what} stopped being read as CJK`);
    }
  });

  it('is the tokenizer the band was calibrated on', () => {
    // The fixture that governs the published number has to be the Anthropic
    // one. If somebody points this file at a cross-family measurement, the
    // ±10% assertions below would be checking the estimator against a
    // tokenizer it was never tuned for, and failing for the right reason with
    // completely the wrong message.
    assert.equal(truth.provider ?? 'anthropic', 'anthropic');
    assert.notEqual(truth.governsPublishedBand, false);
  });

  it('does not lose accuracy it has already achieved', () => {
    /**
     * A regression gate, **not a claim** — and the difference is the whole point
     * of it existing separately from `PUBLISHED_BAND`.
     *
     * The published band is what a user may rely on, and it is deliberately looser
     * than the measurements: 10 against a worst case of 6.4, because six text types
     * cannot bound a seventh. That looseness has a cost. A change that quietly took
     * CJK from 1.5% back to 3.6% would pass every assertion in this file, because
     * both are comfortably inside ten.
     *
     * That is exactly what happened when these floors were written: setting
     * `HAN_TOKENS_PER_CHAR` back to a round 1 doubles the CJK error and nothing
     * failed. So each type carries the accuracy it has actually reached, rounded
     * out to leave room for honest noise.
     *
     * **These are ratchets and they are allowed to tighten, never to slacken.** If
     * a change improves a type, lower its floor in the same commit — a floor left
     * at the old value is a licence to give the improvement back later. If a change
     * genuinely trades one type against another, raise the floor deliberately and
     * say why in the changelog, which is a different act from not noticing.
     *
     * Same idea as `trazum baseline` applied to this repository's own numbers:
     * publish a ceiling, gate on drift away from what you had.
     */
    /*
      Re-derived when the corpus stopped being one sample per class.

      The old floors were cjk 3%, code 8%, numeric 7%, few-shot 4% — measured on
      a corpus with a single file in each of those classes, and that file was
      the one the estimator's constants had been fitted to. They were floors
      under a fit, not under an accuracy.

      Resetting a regression floor because the code got worse is exactly what a
      floor exists to stop, so it is worth being precise that the code did not.
      `code-heavy` went from 6.4% to **0.4%** under the same change that raised
      this class's worst to 24.9%: the 24.9 is `code-sql`, which nothing had
      ever measured. Every figure below is the worst sample of its class on the
      corpus as it now stands, so from here the gate does what it was written
      to do.
    */
    const FLOORS = {
      cjk: 0.04,
      'prose-latin': 0.06,
      code: 0.26,
      numeric: 0.33,
      punctuation: 0.12,
      'few-shot': 0.05,
    };

    const byType = new Map();
    for (const sample of truth.samples) {
      const text = readFileSync(join(corpusDir, sample.file), 'utf8');
      const error = Math.abs(estimateTokens(text) - sample.actualTokens) / sample.actualTokens;
      byType.set(sample.type, Math.max(byType.get(sample.type) ?? 0, error));
    }

    // Every measured type needs a floor, derived rather than assumed: a type added
    // to the corpus without one would be ungated and nobody would find out.
    const ungated = [...byType.keys()].filter((type) => FLOORS[type] === undefined);
    assert.deepEqual(
      ungated,
      [],
      `these types are measured but not gated against regression: ${ungated.join(', ')}`,
    );

    const lost = [];
    for (const [type, error] of byType) {
      if (error > FLOORS[type]) {
        lost.push(`${type} ${(error * 100).toFixed(1)}% (floor ${(FLOORS[type] * 100).toFixed(0)}%)`);
      }
    }

    assert.deepEqual(
      lost,
      [],
      `accuracy already achieved has been given back: ${lost.join(', ')}. ` +
        'The published band still holds, which is why this gate exists separately.',
    );
  });

  it('reports the worst type, so the band is a finding rather than a hope', () => {
    // Not an assertion about a threshold — a printed summary. If prose is 4% out
    // and CJK is 14%, the band technically holds and the report saying ±10% for
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
   * These fixtures assert nothing about `±10%`, on purpose. That band is a
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

  /**
   * Which families the harness can measure, read from the harness.
   *
   * The skip below used to name `deepseek` because that was the only other
   * provider the day it was written. Two more arrived at 1.53 and the sentence
   * would have gone on naming one of them — a message bounded by what happened
   * to exist when it was typed rather than by its subject, which is this
   * project's most repeated mistake and the reason nothing here is a list.
   */
  const measurable = [
    ...new Set(
      [...readFileSync(join(repoRoot, 'scripts/measure-token-band.mjs'), 'utf8').matchAll(
        /^  (\w+): \{$/gm,
      )].map((m) => m[1]),
    ),
  ].filter((name) => name !== 'anthropic');

  it('knows which families could be measured at all', () => {
    assert.ok(
      measurable.length >= 3,
      `only ${measurable.length} non-Anthropic families found in the harness`,
    );
  });

  const unmeasured = measurable.filter(
    (name) => !others.includes(`token-ground-truth.${name}.json`),
  );

  /**
   * Named, one by one, rather than reported as a single absence.
   *
   * "Nothing else has been measured" is true and tells a reader on GPT nothing
   * about their own figures. Each family gets its own skipped test carrying the
   * exact command, so `--test-reporter spec` prints the list of open questions
   * instead of one sentence that could mean any of them.
   */
  for (const name of unmeasured) {
    it(`${name}: not measured — the estimator's error on this family is unknown`, {
      skip: `run: node scripts/measure-token-band.mjs --provider ${name}`,
    }, () => {});
  }

  if (others.length === 0) return;

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

      it('is the figure the report prints about this family, to one decimal', () => {
        /**
         * The number that reaches a reader, held against the fixture it came
         * from.
         *
         * `MEASURED_FOREIGN_ERROR_PCT` ships and these fixtures do not, so the
         * value is written in `band.ts` by hand — which is exactly the shape
         * that drifts. Adding a sample can move the worst error, and nothing
         * would have said so: the report would go on printing a figure that
         * was true of a corpus this repository no longer has.
         *
         * A family with no entry is not a failure. It is the unmeasured case
         * the report has a sentence for, and the two tests below hold that
         * distinction from both sides.
         */
        const provider = other.provider ?? name;
        const claimed = MEASURED_FOREIGN_ERROR_PCT[provider];
        if (claimed === undefined) return;

        let worst = 0;
        for (const sample of other.samples) {
          const text = readFileSync(join(corpusDir, sample.file), 'utf8');
          const error = Math.abs(estimateTokens(text) - sample.actualTokens) / sample.actualTokens;
          worst = Math.max(worst, error * 100);
        }

        assert.equal(
          Number(worst.toFixed(1)),
          claimed,
          `band.ts says the estimator is ${claimed}% out on ${provider}; the fixture says ` +
            `${worst.toFixed(1)}% — re-read it off the measurement rather than editing this`,
        );
      });
    });
  }

  it('claims a measured error only for families that have been measured', () => {
    /**
     * The direction the fixture check above cannot cover: an entry for a
     * provider with no fixture at all would pass every test in this file by
     * never being reached, and the report would print a figure with nothing
     * behind it.
     */
    const measured = new Set(
      others.map((name) => JSON.parse(readFileSync(join(fixturesDir, name), 'utf8')).provider),
    );
    const unbacked = Object.keys(MEASURED_FOREIGN_ERROR_PCT).filter((p) => !measured.has(p));
    assert.deepEqual(unbacked, [], 'band.ts states an error for a family nobody has measured');
  });

  it('answers null for an unmeasured family rather than the nearest number', () => {
    // The flattering reading of missing information, refused once more.
    assert.equal(measuredForeignError('openai'), null);
    assert.equal(measuredForeignError('anthropic'), null);
    assert.equal(measuredForeignError(null), null);
    assert.equal(measuredForeignError(foreignTokenizer('anthropic')), null);
  });
});

describe('the published band has one source', () => {
  /**
   * The band lived as a literal in twenty-three files, and the only machine-readable
   * copy was `PUBLISHED_BAND` in this test — so when the measurement showed the
   * real band was 22.1%, changing it meant a hand sweep across READMEs, three
   * locale catalogues, the MCP tool descriptions, the web app and the demo SVG.
   * Exactly the drift the derived guards in `publish.test.js` exist to prevent,
   * on the number every dollar figure in the product descends from.
   *
   * Three files are excluded, and they are the three that record what the band
   * *was* rather than what it is: the changelog, the release notes and the
   * roadmap's `Released` section. Rewriting those to match the present is the
   * opposite of what they are for — "the band is still ±10%" in the 1.9.0 notes is
   * a true statement about 1.9.0, and making it say 10 would be falsifying a
   * record to satisfy a test.
   *
   * Everything else is a live claim and has to agree: READMEs, three locale
   * catalogues, the MCP tool descriptions, the web app, the demo SVG.
   */
  const skip = new Set(['CHANGELOG.md', 'RELEASES.md', 'ROADMAP.md']);

  /**
   * A delivered plan is a record too, and it says so itself.
   *
   * `docs/plan-1.36-1.40.md` opens with *"This file is kept as it was written,
   * before the code, rather than rewritten in hindsight. It is history now, not
   * a forecast."* Rewriting its ±10% to today's figure would falsify a record to
   * satisfy a test, which is the same objection the three files above are
   * excluded for.
   *
   * Read off the document rather than listed here, so a plan written next year
   * is covered by making the same declaration and a live page cannot join the
   * skip set by being added to an array.
   */
  const declaresItselfHistory = (text) =>
    /kept as it was written|history now, not a forecast/i.test(text.slice(0, 2000));

  /**
   * A comment narrates; a string, a heading or a table cell claims.
   *
   * This guard was written when there was one band, and then every figure
   * anywhere was the same claim. With a band per text type that stopped being
   * true: `advisories.ts` explains what happened under the old band, and
   * `band.ts` opens by describing the number it replaced. Rewriting those to
   * the current figure would make each comment false about its own history,
   * which is the same objection the delivered plan is skipped for.
   *
   * So source files are scanned with their comments removed and prose files
   * whole. Markdown and SVG have no comments to strip, and every figure in
   * them reaches a reader, which is exactly what a published band is.
   *
   * Deliberately crude, and safe in the direction that matters: the stripper
   * can only ever remove text, so a claim it fails to recognise as code stays
   * in and is checked. It cannot smuggle one out.
   */
  const CODE = /[.](ts|tsx|js|mjs|cjs)$/;
  const withoutComments = (text) =>
    text.replace(/[/][*][\s\S]*?[*][/]/g, ' ').replace(/(^|[^:])[/][/].*$/gm, '$1');

  it('no file states a band the code does not publish', () => {
    const listed = spawnSync('git', ['grep', '-l', '-E', '±[0-9]+%'], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    const files = listed.stdout.split('\n').filter((f) => f && !skip.has(f));
    assert.ok(files.length > 5, 'git grep found almost nothing — has the notation changed?');

    const wrong = [];
    const published = new Set([ESTIMATE_ERROR_BAND_PCT, ...Object.values(BANDS)]);
    for (const file of files) {
      const raw = readFileSync(join(repoRoot, file), 'utf8');
      if (declaresItselfHistory(raw)) continue;
      const text = CODE.test(file) ? withoutComments(raw) : raw;
      for (const match of text.matchAll(/±(\d+)%/g)) {
        if (!published.has(Number(match[1]))) wrong.push(`${file}: ±${match[1]}%`);
      }
    }

    assert.deepEqual(
      wrong,
      [],
      'these publish a band the code does not: every ±N% in a live file has to be ' +
        `one the code publishes — ${[...published].sort((a, b) => a - b).map((n) => `±${n}%`).join(', ')} — ` +
        `and these are not: ${wrong.join(', ')}`,
    );
  });
});
