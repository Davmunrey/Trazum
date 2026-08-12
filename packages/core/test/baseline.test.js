import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BASELINE_VERSION,
  BaselineError,
  breaches,
  compareToBaseline,
  formatBaseline,
  moneyIsComparable,
  parseBaseline,
} from '../dist/index.js';

/**
 * The cost baseline.
 *
 * This file decides whether somebody's build passes, so the tests that matter
 * most here are the ones about failing: a malformed baseline must be loud, a new
 * prompt must count, and shrinking must never be a breach.
 */

const SCENARIO = {
  model: 'claude-opus-5',
  callsPerMonth: 10_000,
  avgOutputTokens: 500,
  cacheHitRate: 0.9,
  batchEligible: false,
};

const baselineOf = (files, overrides = {}) => ({
  version: BASELINE_VERSION,
  recorded: '2026-08-12',
  scenario: SCENARIO,
  pricingReviewed: '2026-06-24',
  totals: {
    tokens: Object.values(files).reduce((a, b) => a + b, 0),
    monthlyUsd: 1043.22,
    ...(overrides.totals ?? {}),
  },
  files,
  ...overrides,
});

describe('baseline: reading and writing', () => {
  it('round-trips through format and parse', () => {
    const document = baselineOf({ 'prompts/a.txt': 238, 'prompts/b.md': 402 });
    assert.deepEqual(parseBaseline(formatBaseline(document)), document);
  });

  it('writes the same bytes for the same repository, whatever order it was given', () => {
    // A baseline is committed. One that reshuffles itself on every write turns
    // every pull request into an unreviewable diff, and an unreviewable diff is
    // one nobody reads.
    const one = formatBaseline(baselineOf({ 'b.txt': 2, 'a.txt': 1, 'c.txt': 3 }));
    const two = formatBaseline(baselineOf({ 'c.txt': 3, 'a.txt': 1, 'b.txt': 2 }));
    assert.equal(one, two);
    assert.match(one, /\n$/, 'no trailing newline — every diff will show the last line as changed');
    assert.ok(one.indexOf('"a.txt"') < one.indexOf('"b.txt"'), 'paths are not sorted');
  });

  it('refuses a version it does not read, and names the way out', () => {
    const raw = formatBaseline(baselineOf({ 'a.txt': 1 })).replace(
      `"version": ${BASELINE_VERSION}`,
      '"version": 99',
    );
    assert.throws(
      () => parseBaseline(raw, 'trazum.baseline.json'),
      (error) => {
        assert.ok(error instanceof BaselineError);
        assert.match(error.message, /version 99/);
        assert.match(error.message, /trazum baseline/, 'does not say how to fix it');
        return true;
      },
    );
  });

  it('refuses a total that disagrees with the per-file counts', () => {
    /**
     * The one corruption that looks completely normal: the file parses, the gate
     * runs, and the comparison is against a number nobody measured. A
     * hand-edited total is the most likely way it happens.
     */
    const document = baselineOf(
      { 'a.txt': 100, 'b.txt': 100 },
      { totals: { tokens: 150, monthlyUsd: 1 } },
    );
    assert.throws(
      () => parseBaseline(formatBaseline(document)),
      /is 150 but the per-file counts sum to 200/,
    );
  });

  it('refuses a path that escapes the project', () => {
    for (const path of ['/etc/passwd', '../outside.txt', 'C:\\prompts\\a.txt']) {
      const raw = JSON.stringify({
        ...baselineOf({}),
        files: { [path]: 10 },
        totals: { tokens: 10, monthlyUsd: 0 },
      });
      assert.throws(() => parseBaseline(raw), /must be relative to the project/, path);
    }
  });

  it('refuses counts that are not whole tokens', () => {
    for (const bad of [1.5, -1, '10', null]) {
      const raw = JSON.stringify({
        ...baselineOf({}),
        files: { 'a.txt': bad },
        totals: { tokens: 0, monthlyUsd: 0 },
      });
      assert.throws(() => parseBaseline(raw), /whole number/, JSON.stringify(bad));
    }
  });

  it('refuses a scenario it cannot trust', () => {
    const withScenario = (scenario) => JSON.stringify({ ...baselineOf({ 'a.txt': 5 }), scenario });

    assert.throws(
      () => parseBaseline(withScenario({ ...SCENARIO, cacheHitRate: 1.5 })),
      /fraction between 0 and 1/,
    );
    assert.throws(
      () => parseBaseline(withScenario({ ...SCENARIO, batchEligible: 'yes' })),
      /must be true or false/,
    );
    assert.throws(() => parseBaseline(withScenario({ ...SCENARIO, model: '' })), /non-empty string/);
  });

  it('refuses text that is not a baseline at all', () => {
    assert.throws(() => parseBaseline('not json'), /not valid JSON/);
    assert.throws(() => parseBaseline('[]'), /top level must be an object/);
    assert.throws(() => parseBaseline('{"version":1}'), /"totals" must be an object/);
  });

  it('names the file in every failure', () => {
    // A baseline error in a monorepo is useless without knowing which file it
    // came from.
    assert.throws(
      () => parseBaseline('nope', 'packages/x/trazum.baseline.json'),
      (error) => {
        assert.match(error.message, /^packages\/x\/trazum\.baseline\.json: /);
        return true;
      },
    );
  });
});

describe('baseline: what changed', () => {
  const before = baselineOf({ 'grew.txt': 100, 'shrank.txt': 100, 'same.txt': 100, 'gone.txt': 50 });

  const comparison = compareToBaseline(before, {
    'grew.txt': 140,
    'shrank.txt': 60,
    'same.txt': 100,
    'new.txt': 30,
  });

  it('sorts each file into exactly one bucket', () => {
    assert.deepEqual(
      comparison.grown.map((c) => c.path),
      ['grew.txt'],
    );
    assert.deepEqual(
      comparison.shrunk.map((c) => c.path),
      ['shrank.txt'],
    );
    assert.deepEqual(
      comparison.added.map((c) => c.path),
      ['new.txt'],
    );
    assert.deepEqual(
      comparison.removed.map((c) => c.path),
      ['gone.txt'],
    );
  });

  it('signs the delta so positive is the direction that costs money', () => {
    assert.equal(comparison.grown[0].delta, 40);
    assert.equal(comparison.shrunk[0].delta, -40);
    assert.equal(comparison.removed[0].delta, -50);
    assert.equal(comparison.added[0].delta, 30);
  });

  it('counts a file that is new, which is the hole a naive comparison leaves', () => {
    /**
     * Comparing only the paths present in both documents would let a
     * five-thousand-token prompt through every threshold, because it is in
     * neither the grown list nor the baseline total. The whole gate turns on this
     * one behaviour.
     */
    const naive = compareToBaseline(baselineOf({ 'a.txt': 100 }), {
      'a.txt': 100,
      'huge.txt': 5000,
    });
    assert.equal(naive.grown.length, 0, 'nothing grew, correctly');
    assert.equal(naive.delta, 5000, 'and yet the repository is 5000 tokens more expensive');
    assert.deepEqual(
      breaches(naive, { maxGrowthTokens: 0 }).map((b) => b.kind),
      ['tokens'],
    );
  });

  it('totals the tree it was given, not the baseline it came from', () => {
    assert.equal(comparison.tokensBefore, 350);
    assert.equal(comparison.tokensAfter, 330);
    assert.equal(comparison.delta, -20);
  });

  it('does not divide by an empty baseline', () => {
    const fromNothing = compareToBaseline(baselineOf({}), { 'a.txt': 500 });
    assert.equal(fromNothing.deltaPct, 0);
    assert.ok(Number.isFinite(fromNothing.deltaPct));
    // The absolute threshold still catches it, which is why both exist.
    assert.deepEqual(
      breaches(fromNothing, { maxGrowthTokens: 0 }).map((b) => b.kind),
      ['tokens'],
    );
  });

  it('reports a stable order, so two runs of CI print the same report', () => {
    const one = compareToBaseline(before, { 'z.txt': 1, 'a.txt': 1 });
    const two = compareToBaseline(before, { 'a.txt': 1, 'z.txt': 1 });
    assert.deepEqual(
      one.added.map((c) => c.path),
      two.added.map((c) => c.path),
    );
    assert.deepEqual(
      one.added.map((c) => c.path),
      ['a.txt', 'z.txt'],
    );
  });
});

describe('baseline: the gate', () => {
  const grownBy = (delta) =>
    compareToBaseline(baselineOf({ 'a.txt': 1000 }), { 'a.txt': 1000 + delta });

  it('passes when growth is inside both thresholds', () => {
    assert.deepEqual(breaches(grownBy(20), { maxGrowthTokens: 50, maxGrowthPct: 5 }), []);
  });

  it('fails on the absolute limit', () => {
    assert.deepEqual(breaches(grownBy(60), { maxGrowthTokens: 50 }), [
      { kind: 'tokens', limit: 50, actual: 60 },
    ]);
  });

  it('fails on the percentage limit', () => {
    const found = breaches(grownBy(80), { maxGrowthPct: 5 });
    assert.equal(found.length, 1);
    assert.equal(found[0].kind, 'pct');
    assert.equal(found[0].limit, 5);
    assert.ok(Math.abs(found[0].actual - 8) < 1e-9);
  });

  it('reports both when both are crossed, so the output names the real limit', () => {
    assert.deepEqual(
      breaches(grownBy(200), { maxGrowthTokens: 50, maxGrowthPct: 5 }).map((b) => b.kind),
      ['tokens', 'pct'],
    );
  });

  it('holds each threshold independently', () => {
    // A percentage alone lets a small repository absorb a large addition; an
    // absolute number alone means a large repository never trips. Either being
    // able to fire on its own is the reason both are offered.
    assert.deepEqual(
      breaches(grownBy(60), { maxGrowthPct: 50 }).map((b) => b.kind),
      [],
    );
    assert.deepEqual(
      breaches(grownBy(60), { maxGrowthTokens: 1000 }).map((b) => b.kind),
      [],
    );
  });

  it('never fails a repository that got cheaper', () => {
    // There is no such thing as a prompt that got too cheap. Zero tolerance is
    // the strictest a threshold goes, and shrinking still passes it.
    assert.deepEqual(breaches(grownBy(-1), { maxGrowthTokens: 0, maxGrowthPct: 0 }), []);
    assert.deepEqual(breaches(grownBy(0), { maxGrowthTokens: 0, maxGrowthPct: 0 }), []);
  });

  it('still refuses to fail a shrunk repository against a nonsense threshold', () => {
    /**
     * This is the only test the early `delta <= 0` return can fail, and it was
     * written because a mutation removing that line passed everything else.
     *
     * With a threshold of zero or more the line is unreachable — `-1 > 0` is
     * already false — so every other case here proves nothing about it. But
     * `breaches` is exported from a published package, and a caller who passes a
     * negative limit would otherwise be told that a repository which got
     * *cheaper* had breached its budget. The guard holds the invariant at the API
     * boundary rather than trusting every caller to be the config parser.
     */
    assert.deepEqual(breaches(grownBy(-1), { maxGrowthTokens: -100 }), []);
    assert.deepEqual(breaches(grownBy(-1), { maxGrowthPct: -100 }), []);
  });

  it('fails a single token when the policy is zero tolerance', () => {
    assert.deepEqual(breaches(grownBy(1), { maxGrowthTokens: 0 }), [
      { kind: 'tokens', limit: 0, actual: 1 },
    ]);
  });
});

describe('baseline: whether the money is comparable', () => {
  const document = baselineOf({ 'a.txt': 100 });

  it('says yes when nothing moved', () => {
    assert.deepEqual(moneyIsComparable(document, SCENARIO, '2026-06-24'), {
      comparable: true,
      scenarioChanged: false,
      pricingChanged: false,
    });
  });

  it('notices a repriced catalogue', () => {
    const answer = moneyIsComparable(document, SCENARIO, '2026-09-01');
    assert.equal(answer.comparable, false);
    assert.equal(answer.pricingChanged, true);
    assert.equal(answer.scenarioChanged, false);
  });

  it('notices every field of the scenario, not just the model', () => {
    /**
     * Each of these changes the monthly figure without a single prompt moving.
     * Missing one means a dollar delta gets reported as a saving when it is an
     * artefact of the scenario being edited.
     */
    const variants = {
      model: { ...SCENARIO, model: 'claude-haiku-4-5' },
      callsPerMonth: { ...SCENARIO, callsPerMonth: 20_000 },
      avgOutputTokens: { ...SCENARIO, avgOutputTokens: 800 },
      cacheHitRate: { ...SCENARIO, cacheHitRate: 0.5 },
      batchEligible: { ...SCENARIO, batchEligible: true },
    };
    for (const [field, scenario] of Object.entries(variants)) {
      const answer = moneyIsComparable(document, scenario, '2026-06-24');
      assert.equal(answer.scenarioChanged, true, `${field} was not noticed`);
      assert.equal(answer.comparable, false, field);
    }
  });

  it('does not let tokens depend on any of it', () => {
    // The reason the gate is written in tokens: the comparison is identical
    // whatever the scenario or the price list say.
    const current = { 'a.txt': 150 };
    const first = compareToBaseline(document, current);
    const second = compareToBaseline(
      { ...document, scenario: { ...SCENARIO, callsPerMonth: 1 }, pricingReviewed: '2030-01-01' },
      current,
    );
    assert.deepEqual(first, second);
  });
});
