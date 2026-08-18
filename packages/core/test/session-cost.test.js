import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BUNDLED_CATALOGUE, profileUsage } from '../dist/index.js';

/**
 * What one conversation costs.
 *
 * Hand arithmetic on Claude Opus 5 ($5/MTok input): a 200k-token turn is
 * $1.00, so a two-turn conversation of those is $2.00. Never a snapshot.
 */

const ON = new Date('2026-08-18T00:00:00Z');

/** One turn of `session`, costing exactly `usd` dollars. */
const turn = (session, usd, label = 'chat') =>
  JSON.stringify({
    model: 'claude-opus-5',
    label,
    session,
    usage: { input_tokens: usd * 200_000, output_tokens: 0 },
  });

const profile = (lines) =>
  profileUsage(lines.join('\n'), { catalogue: BUNDLED_CATALOGUE, on: ON });

describe('the cost of one conversation', () => {
  it('reports the median, the p95 and the maximum, exactly', () => {
    // Nine conversations at $1.00 and one at $50.00. The median is $1.00;
    // the mean would be $5.90 and would describe none of them.
    const lines = [];
    for (let i = 0; i < 9; i += 1) lines.push(turn(`s${i}`, 1));
    lines.push(turn('spike', 50));
    const [shape] = profile(lines).sessionCosts;
    assert.equal(shape.sessions, 10);
    assert.ok(Math.abs(shape.medianUsd - 1) < 1e-9, String(shape.medianUsd));
    // Nearest rank over ten values is the tenth: the spike itself.
    assert.ok(Math.abs(shape.p95Usd - 50) < 1e-9, String(shape.p95Usd));
    assert.ok(Math.abs(shape.maxUsd - 50) < 1e-9);
    assert.ok(Math.abs(shape.totalUsd - 59) < 1e-9, String(shape.totalUsd));
  });

  it('sums the turns of a conversation, and reports the median turn count', () => {
    const lines = [];
    for (let i = 0; i < 5; i += 1) {
      lines.push(turn(`s${i}`, 1));
      lines.push(turn(`s${i}`, 1));
    }
    const [shape] = profile(lines).sessionCosts;
    assert.equal(shape.sessions, 5);
    assert.equal(shape.calls, 10);
    assert.equal(shape.medianTurns, 2);
    // Each conversation is two $1.00 turns.
    assert.ok(Math.abs(shape.medianUsd - 2) < 1e-9);
  });

  it('is independent of the order of the log', () => {
    const forward = [];
    for (let i = 0; i < 6; i += 1) forward.push(turn(`s${i}`, i + 1));
    const backward = [...forward].reverse();
    assert.deepEqual(profile(forward).sessionCosts, profile(backward).sessionCosts);
  });

  it('refuses a median over too few conversations', () => {
    // Four conversations: a "median" here is one of the four and a p95 is the
    // maximum wearing a percentile's name.
    const lines = [];
    for (let i = 0; i < 4; i += 1) lines.push(turn(`s${i}`, 1));
    assert.deepEqual(profile(lines).sessionCosts, []);
  });

  it('says nothing when the log carries no session', () => {
    const lines = Array.from({ length: 10 }, () =>
      JSON.stringify({ model: 'claude-opus-5', usage: { input_tokens: 200_000, output_tokens: 0 } }),
    );
    assert.deepEqual(profile(lines).sessionCosts, []);
  });

  it('never carries the session key into the report', () => {
    const lines = [];
    for (let i = 0; i < 6; i += 1) lines.push(turn(`user-${i}@corp.example`, 1));
    const report = profile(lines);
    assert.equal(report.sessionCosts.length, 1);
    assert.ok(!JSON.stringify(report.sessionCosts).includes('@corp.example'));
  });

  it('splits by label and model, most money first', () => {
    const lines = [];
    for (let i = 0; i < 6; i += 1) {
      lines.push(turn(`a${i}`, 1, 'small'));
      lines.push(turn(`b${i}`, 4, 'big'));
    }
    const shapes = profile(lines).sessionCosts;
    assert.deepEqual(shapes.map((s) => s.label), ['big', 'small']);
    assert.ok(Math.abs(shapes[0].totalUsd - 24) < 1e-9);
  });
});
