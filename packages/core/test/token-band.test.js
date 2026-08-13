import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { ESTIMATE_ERROR_BAND_PCT, estimateTokens } from '../dist/index.js';
import { digestOf, digestOfOne } from '../../../scripts/corpus-digest.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
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

describe('the published band has one source', () => {
  /**
   * The band lived as a literal in twenty-three files, and the only machine-readable
   * copy was `PUBLISHED_BAND` in this test — so when the measurement showed the
   * real band was 22.1%, changing it meant a hand sweep across READMEs, three
   * locale catalogues, the MCP tool descriptions, the web app and the demo SVG.
   * Exactly the drift the derived guards in `publish.test.js` exist to prevent,
   * on the number every dollar figure in the product descends from.
   *
   * `CHANGELOG.md` is excluded: it records what the band *was* at each release,
   * and rewriting history to match the present is the opposite of a changelog.
   */
  const skip = new Set(['CHANGELOG.md']);

  it('no file states a band the code does not publish', () => {
    const listed = spawnSync('git', ['grep', '-l', '-E', '±[0-9]+%'], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    const files = listed.stdout.split('\n').filter((f) => f && !skip.has(f));
    assert.ok(files.length > 5, 'git grep found almost nothing — has the notation changed?');

    const wrong = [];
    for (const file of files) {
      const text = readFileSync(join(repoRoot, file), 'utf8');
      for (const match of text.matchAll(/±(\d+)%/g)) {
        if (Number(match[1]) !== ESTIMATE_ERROR_BAND_PCT) wrong.push(`${file}: ±${match[1]}%`);
      }
    }

    assert.deepEqual(
      wrong,
      [],
      `these publish a band other than ±${ESTIMATE_ERROR_BAND_PCT}%: ${wrong.join(', ')}`,
    );
  });
});
