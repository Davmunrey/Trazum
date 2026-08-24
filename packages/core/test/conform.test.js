import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BUNDLED_CATALOGUE,
  billLevers,
  buildPlan,
  conform,
  profileUsage,
} from '../dist/index.js';

/**
 * The conformance check, which exists so somebody else's emitter can find out
 * whether it works *before* half the findings quietly never appear.
 *
 * Two questions kept apart, and the second is the useful one. "Is this a valid
 * usage log" is a yes or no. "What can a valid log of this shape not tell you"
 * has nothing to do with validity — a log with no `session` is perfectly valid
 * and simply cannot support conversation growth — and it is the answer an
 * emitter actually needs.
 */

const ON = new Date('2026-08-16T00:00:00Z');

const line = (over = {}) =>
  JSON.stringify({
    model: 'claude-opus-5',
    usage: { input_tokens: 1000, output_tokens: 100 },
    ...over,
  });

describe('conform — a usage log', () => {
  it('accepts the minimum: a model and some tokens', () => {
    const report = conform(`${line()}\n`);
    assert.equal(report.contract, 'usage-log');
    assert.equal(report.conforms, true);
    assert.equal(report.records, 1);
  });

  it('accepts a flat record as readily as a nested one', () => {
    // An OTel exporter reshaping spans has no reason to nest, and the reader
    // has accepted both since it shipped. A checker stricter than the reader
    // sends somebody to fix something that already works.
    const report = conform(`${JSON.stringify({ model: 'claude-opus-5', input_tokens: 10, output_tokens: 1 })}\n`);
    assert.equal(report.conforms, true);
  });

  it('names the line and the reason, never just "invalid"', () => {
    const report = conform(`${line()}\nnot json\n${JSON.stringify({ usage: { input_tokens: 1 } })}\n`);
    assert.equal(report.conforms, false);
    const [bad, noModel] = report.problems;
    assert.equal(bad.at, 'line 2');
    assert.equal(bad.kind, 'unreadable');
    assert.equal(noModel.at, 'line 3');
    assert.equal(noModel.kind, 'missing');
    assert.match(noModel.detail, /model/);
  });

  it('names a record with no token counts at all', () => {
    // Two lines, so this is unambiguously a log: a lone object with a model
    // and no tokens is not a usage record and not a document either, and the
    // tie-break above would correctly decline to guess.
    const report = conform(`${line()}\n${JSON.stringify({ model: 'claude-opus-5' })}\n`);
    assert.equal(report.conforms, false);
    assert.equal(report.problems[0].at, 'line 2');
    assert.match(report.problems[0].detail, /token counts are required/);
  });

  it('lists what a valid log still cannot answer, with what would unlock it', () => {
    /**
     * The half of this that matters. A log with a model and tokens conforms
     * completely and supports about a third of the product; an emitter that
     * only learns "valid" ships it and never finds out why the cache verdict
     * never appears.
     */
    const report = conform(`${line()}\n`);
    assert.equal(report.conforms, true);
    assert.ok(report.unavailable.length >= 4);
    for (const entry of report.unavailable) {
      assert.ok(entry.finding.length > 0);
      assert.ok(entry.because.length > 0);
      assert.ok(entry.unlockedBy.length > 0, 'a gap is never named without the fix');
    }
    assert.ok(report.unavailable.some((u) => /cache/.test(u.finding)));
    assert.ok(report.unavailable.some((u) => /conversation/.test(u.finding)));
  });

  it('stops listing a gap once any record fills it', () => {
    const rich = line({
      label: 'classify',
      timestamp: '2026-08-01T00:00:00Z',
      session: 'c1',
      stop_reason: 'end_turn',
      usage: {
        input_tokens: 1000,
        output_tokens: 100,
        cache_read_input_tokens: 500,
        cache_creation_input_tokens: 0,
      },
    });
    const report = conform(`${rich}\n`);
    assert.equal(report.conforms, true);
    assert.deepEqual(report.unavailable, [], 'a fully-populated record buys every finding');
  });
});

describe('conform — the documents', () => {
  const documented = (text) => conform(text);

  it('reads back a profile this repository just wrote', () => {
    /**
     * The round trip is the contract. A checker that rejects the output of the
     * tool it describes is worse than no checker.
     *
     * `schemaVersion` is stamped by the CLI rather than by `profileUsage`,
     * which is worth knowing: the *document* is what `profile --json` emits,
     * and the core's report object is a value one layer below it. An emitter
     * copying the core's shape and omitting the stamp would produce something
     * this check correctly rejects.
     */
    const report = profileUsage(`${line()}\n`, { catalogue: BUNDLED_CATALOGUE, on: ON });
    const checked = documented(JSON.stringify({ schemaVersion: 1, ...report }));
    assert.equal(checked.contract, 'profile');
    assert.deepEqual(checked.problems, []);
    assert.equal(checked.conforms, true);
  });

  it('reads back a plan this repository just wrote', () => {
    const report = profileUsage(`${line({ label: 'classify' })}\n`, {
      catalogue: BUNDLED_CATALOGUE,
      on: ON,
    });
    const plan = buildPlan(report, billLevers(report, { catalogue: BUNDLED_CATALOGUE, on: ON }), '2026-06-24');
    // `buildPlan` stamps its own schemaVersion — unlike the profile, the plan
    // is a document the core itself writes, because it is meant to be saved.
    const checked = documented(JSON.stringify(plan));
    assert.equal(checked.contract, 'plan');
    assert.equal(checked.conforms, true);
  });

  it('identifies each contract by its most distinctive field', () => {
    /**
     * By distinctiveness, not by trying each and keeping the fewest
     * complaints — that would report a broken plan as a slightly-more-broken
     * profile and send somebody to fix the wrong document.
     */
    const cases = [
      [{ schemaVersion: 1, byLabelAndModel: [] }, 'profile'],
      [{ schemaVersion: 1, periods: [], runs: [] }, 'history'],
      [{ schemaVersion: 1, actions: [], arrived: 0 }, 'verification'],
      [{ schemaVersion: 1, actions: [] }, 'plan'],
      [{ schemaVersion: 1, verdict: 'within', restsOn: 'measured' }, 'cost-answer'],
      [{ schemaVersion: 1, provider: 'anthropic', unavailable: [] }, 'connected'],
      // The seven named in the 1.65 arc, and the two orderings that matter:
      // a fleet is a list of profiles and detects before the profile check,
      // and a spend-guard verdict contains a cost answer and detects first.
      [{ schemaVersion: 1, bySource: [], rollup: {} }, 'fleet'],
      [{ schemaVersion: 1, verdict: 'no', cost: {}, alternatives: [], because: 'x' }, 'spend-guard'],
      [{ schemaVersion: 1, config: {}, justified: [], declined: [] }, 'first-run'],
      [{ schemaVersion: 1, beats: [], nowMs: 1, stale: false }, 'pulse'],
      [{ schemaVersion: 1, rules: [], floor: 0, tokensBefore: 1, tokensSaved: 0 }, 'rule-yield'],
      [{ schemaVersion: 1, error: {}, reason: 'budget-exhausted', alternatives: [] }, 'gateway-refusal'],
      [{ schemaVersion: 1, workloads: [], node: 'v22', cpus: 4 }, 'bench'],
      // The 1.67 arc's document: its own `source` string is the signature.
      [
        { schemaVersion: 1, source: 'usage-log', month: {}, positions: [], unmeasured: [], cannotSay: [], unpricedRecords: 0 },
        'position',
      ],
    ];
    for (const [doc, expected] of cases) {
      assert.equal(conform(JSON.stringify(doc)).contract, expected, expected);
    }
  });

  it('holds each of the seven newly named contracts to its required fields', () => {
    /**
     * Each accepted whole, then gutted one required field at a time — a rule
     * proved by the document it rejects, not by the one it accepts. The
     * fixtures are the documented minimum, which is the promise: checking a
     * document requires nothing but the document.
     */
    const minimal = {
      fleet: { schemaVersion: 1, bySource: [], rollup: {} },
      'spend-guard': { schemaVersion: 1, verdict: 'no', cost: {}, alternatives: [], because: 'x' },
      'first-run': { schemaVersion: 1, config: {}, justified: [], declined: [] },
      pulse: { schemaVersion: 1, beats: [], nowMs: 1, stale: false },
      'rule-yield': { schemaVersion: 1, rules: [], floor: 0, tokensBefore: 1, tokensSaved: 0 },
      'gateway-refusal': { schemaVersion: 1, error: {}, reason: 'budget-exhausted', alternatives: [] },
      bench: { schemaVersion: 1, workloads: [], node: 'v22', cpus: 4 },
      position: {
        schemaVersion: 1,
        source: 'usage-log',
        month: {},
        positions: [],
        unmeasured: [],
        cannotSay: [],
        unpricedRecords: 0,
      },
    };
    for (const [name, doc] of Object.entries(minimal)) {
      const whole = conform(JSON.stringify(doc), { contract: name });
      assert.equal(whole.conforms, true, `${name}: the documented minimum does not conform`);
      for (const field of Object.keys(doc)) {
        if (field === 'schemaVersion') continue;
        const gutted = { ...doc };
        delete gutted[field];
        const checked = conform(JSON.stringify(gutted), { contract: name });
        assert.equal(checked.conforms, false, `${name} without ${field} still conforms`);
        assert.ok(
          checked.problems.some((problem) => problem.at === field),
          `${name} without ${field}: no problem names the field`,
        );
      }
    }
  });

  it('refuses an unrecognised document with what each contract looks like', () => {
    // A refusal never arrives bare. "Invalid" sends somebody to read the
    // source; a list of distinguishing fields sends them to their own file.
    const report = conform(JSON.stringify({ schemaVersion: 1, hello: 'world' }));
    assert.equal(report.contract, null);
    assert.equal(report.conforms, false);
    assert.match(report.because, /byLabelAndModel/);
    assert.match(report.because, /actions/);
  });

  it('requires a schema version, and says why it matters', () => {
    const report = conform(JSON.stringify({ actions: [], projectedSavingUsd: 0, measuredStakeUsd: 0, totalUsd: 0 }));
    assert.equal(report.contract, 'plan');
    const problem = report.problems.find((p) => p.at === 'schemaVersion');
    assert.equal(problem.kind, 'missing');
    assert.match(problem.detail, /branches on it/);
  });

  it('names a wrong type with the type it found', () => {
    const report = conform(JSON.stringify({ schemaVersion: 1, actions: [], projectedSavingUsd: '12.00' }));
    const problem = report.problems.find((p) => p.at === 'projectedSavingUsd');
    assert.equal(problem.kind, 'wrong-type');
    assert.match(problem.detail, /found string/);
  });

  it('calls out a zero standing in for absence as its own kind of problem', () => {
    /**
     * The mistake that produces a wrong report rather than a rejected one,
     * and it is always in the flattering direction: a `span` of 0 reads as a
     * log covering the epoch rather than a log with no clock.
     */
    const report = conform(
      JSON.stringify({
        schemaVersion: 1,
        total: {},
        byLabel: [],
        byModel: [],
        byLabelAndModel: [],
        unpricedModels: [],
        skippedLines: [],
        span: 0,
      }),
    );
    const problem = report.problems.find((p) => p.at === 'span');
    assert.equal(problem.kind, 'absence-as-zero');
  });

  it('does not reject a document for fields it has never heard of', () => {
    // Documents here gain fields without a version bump. A checker that
    // rejects tomorrow's field is a checker nobody upgrades.
    const report = conform(
      JSON.stringify({
        schemaVersion: 1,
        actions: [],
        projectedSavingUsd: 0,
        measuredStakeUsd: 0,
        totalUsd: 0,
        somethingFromNextYear: { deeply: ['nested'] },
      }),
    );
    assert.equal(report.conforms, true);
  });

  it('says the input is empty rather than guessing at a contract', () => {
    const report = conform('   \n  ');
    assert.equal(report.contract, null);
    assert.match(report.because, /empty/);
  });

  it('checks against a named contract when an emitter under test asks', () => {
    // A single-record log is one JSON object per line, which is also a valid
    // JSON document — so an emitter testing a one-line log has to be able to
    // say which it meant.
    const report = conform(line(), { contract: 'usage-log' });
    assert.equal(report.contract, 'usage-log');
    assert.equal(report.records, 1);
  });
});
