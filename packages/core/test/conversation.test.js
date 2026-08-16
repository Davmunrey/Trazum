import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BUNDLED_CATALOGUE, conversationGrowth, profileUsage } from '../dist/index.js';

/**
 * What re-sending the conversation costs.
 *
 * A chat or agent workload sends the whole conversation back on every turn, so the
 * input grows with the turn count — and on an agent bill that growth is routinely
 * the largest single line. Nothing else in this package can see it: a prompt file
 * shows the system prompt and not the history, and a total shows the sum and not
 * the shape.
 */

const profile = (records) =>
  profileUsage(records.map((r) => JSON.stringify(r)).join('\n'), {
    catalogue: BUNDLED_CATALOGUE,
    on: new Date('2026-08-16T00:00:00Z'),
  });

/** `sessions` conversations of `turns` turns, growing by `step` tokens a turn. */
const conversation = (sessions, turns, { base = 600, step = 400, over = {} } = {}) =>
  Array.from({ length: sessions }, (_, s) =>
    Array.from({ length: turns }, (_, t) => ({
      model: 'claude-opus-5',
      label: 'agent',
      session: `conversation-${s}`,
      usage: { input_tokens: base + t * step, output_tokens: 200 },
      ...over,
    })),
  ).flat();

describe('measuring conversation growth', () => {
  it('prices the growth exactly, against every turn costing what the first did', () => {
    /**
     * 200 conversations of 12 turns, opening at 600 input tokens and adding 400 a
     * turn. Each conversation sends 12·600 + 400·(0+…+11) = 33,600 tokens, so the
     * workload sends 6,720,000 — $33.60 at Opus 5's $5/MTok.
     *
     * Flat, every turn at its own opening price: 600 · 12 · 200 = 1,440,000 tokens,
     * $7.20. The growth is $26.40, and on this bill that is 57.9% — a figure no
     * other part of this package could produce.
     */
    const [growth] = profile(conversation(200, 12)).conversations;

    assert.equal(growth.label, 'agent');
    assert.equal(growth.sessions, 200);
    assert.equal(growth.longestSession, 12);
    assert.equal(growth.minTurnTokens, 600);
    assert.equal(growth.maxTurnTokens, 5000);
    assert.ok(Math.abs(growth.inputUsd - 33.6) < 1e-9, `spent ${growth.inputUsd}`);
    assert.ok(Math.abs(growth.flatUsd - 7.2) < 1e-9, `flat ${growth.flatUsd}`);
    assert.ok(Math.abs(growth.growthUsd - 26.4) < 1e-9, `growth ${growth.growthUsd}`);
  });

  it('never reports more growth than the workload spent on input', () => {
    // The bound behind the whole module: the flat figure is a subset of the real
    // one, so the difference cannot exceed it. A ceiling above the bill would be
    // arithmetic nobody could act on.
    for (const turns of [3, 5, 12, 40]) {
      const [growth] = profile(conversation(20, turns)).conversations;
      assert.ok(growth.growthUsd < growth.inputUsd, `${turns} turns: ${growth.growthUsd} of ${growth.inputUsd}`);
      assert.ok(growth.flatUsd > 0);
    }
  });

  it('measures the same workload identically whatever order the log is in', () => {
    /**
     * The fault this exists to pin. Growth was anchored on the first record seen
     * per session, which is a fact about the log's ordering and not about the
     * conversation: the identical workload exported newest-first — an ordinary
     * shape for a warehouse export — computed a negative growth and the section
     * silently vanished. The largest line on an agent bill, gone because
     * somebody's log was sorted the other way.
     *
     * Anchoring on the cheapest turn is order-independent and equal on any
     * genuinely growing conversation, and the figure stays an exact ceiling: no
     * truncation strategy can pay less than the cheapest turn per turn.
     */
    const records = conversation(50, 8);
    const forward = profile(records).conversations;
    const backward = profile([...records].reverse()).conversations;
    const shuffled = profile(
      [...records].sort((a, b) => (a.session < b.session ? 1 : a.session > b.session ? -1 : 0)),
    ).conversations;

    assert.ok(forward.length === 1, 'the forward log did not measure');
    // Equal up to floating-point associativity: the sums accumulate in a
    // different order, so the last bits of a double can differ. Anything larger
    // than an ulp-scale difference is a real order dependence.
    const near = (a, b, what) =>
      assert.ok(Math.abs(a - b) < 1e-9, `${what}: ${a} vs ${b}`);
    for (const other of [backward, shuffled]) {
      assert.equal(other.length, 1);
      const [f, o] = [forward[0], other[0]];
      assert.equal(o.sessions, f.sessions);
      assert.equal(o.calls, f.calls);
      assert.equal(o.longestSession, f.longestSession);
      near(o.inputUsd, f.inputUsd, 'inputUsd');
      near(o.flatUsd, f.flatUsd, 'flatUsd');
      near(o.growthUsd, f.growthUsd, 'growthUsd');
      near(o.minTurnTokens, f.minTurnTokens, 'minTurnTokens');
      near(o.maxTurnTokens, f.maxTurnTokens, 'maxTurnTokens');
    }
  });

  it('ignores conversations too short to have grown', () => {
    /**
     * Two turns is one step of growth and is as likely to be a retry. Averaging
     * those in drags the measured shape towards flat, which understates the real
     * thing — the direction that flatters.
     */
    const short = profile(conversation(500, 2));
    assert.deepEqual(short.conversations, []);
    assert.equal(short.hasSessions, true, 'the sessions were there, they were just short');
  });

  it('keeps a workload that does not grow out of the report', () => {
    // Every turn the same size is a stateless workload that happens to carry a
    // session. There is no growth, and inventing a row for it would be noise.
    const flat = profile(conversation(50, 10, { step: 0 }));
    assert.deepEqual(flat.conversations, []);
  });

  it('treats a shrinking log and its growing mirror identically, claiming no order', () => {
    /**
     * This replaces a test that demanded the impossible. It required a shrinking
     * conversation — 20,000 tokens down to 10,000 — never be reported as growth,
     * and under the first-seen anchoring that held. But that anchoring also made
     * the measurement depend on the log's ordering, and the same growing workload
     * exported newest-first vanished from the report entirely.
     *
     * Once the anchor is the cheapest turn — the only order-independent choice —
     * a shrinking conversation is *literally indistinguishable* from its growing
     * mirror: same turns, same sizes, order unknown. The tool cannot claim to
     * know which one happened, so the honest behaviour is to report both the
     * same and to word the report without temporal claims — smallest turn and
     * largest turn, never first and last. The ceiling stays true either way: no
     * truncation strategy can pay less than the cheapest turn per turn.
     */
    const shape = (tokens) =>
      tokens.map((inputTokens) => ({
        model: 'claude-opus-5',
        inputTokens,
        cacheReadTokens: 0,
        cacheWrite5mTokens: 0,
        cacheWrite1hTokens: 0,
        writeTtlKnown: true,
        outputTokens: 200,
        label: 'agent',
        session: 'one',
      }));
    const options = {
      catalogue: BUNDLED_CATALOGUE,
      on: new Date('2026-08-16T00:00:00Z'),
      minShare: 0,
    };
    const sizes = [20_000, 18_000, 16_000, 14_000, 12_000, 10_000];
    const shrinking = conversationGrowth(shape(sizes), 100, options);
    const growing = conversationGrowth(shape([...sizes].reverse()), 100, options);

    // Equal up to floating-point associativity, as in the ordering test above.
    assert.equal(shrinking.length, 1);
    assert.equal(growing.length, 1);
    for (const key of ['sessions', 'calls', 'longestSession', 'minTurnTokens', 'maxTurnTokens']) {
      assert.equal(shrinking[0][key], growing[0][key], key);
    }
    for (const key of ['inputUsd', 'flatUsd', 'growthUsd', 'shareOfBill']) {
      assert.ok(
        Math.abs(shrinking[0][key] - growing[0][key]) < 1e-9,
        `${key}: ${shrinking[0][key]} vs ${growing[0][key]}`,
      );
    }
    assert.equal(shrinking[0].minTurnTokens, 10_000);
    assert.equal(shrinking[0].maxTurnTokens, 20_000);
  });

  it('separates "nothing recorded" from "nothing to report"', () => {
    /**
     * The two answers a reader would act on differently. A log with no session
     * cannot be asked the question at all, and reporting silence there would read
     * as a clean bill of health on the line most likely to be the biggest.
     */
    const none = profile([
      { model: 'claude-opus-5', label: 'agent', usage: { input_tokens: 5000, output_tokens: 200 } },
    ]);
    assert.equal(none.hasSessions, false);
    assert.deepEqual(none.conversations, []);
  });

  it('takes conversation_id as well as session', () => {
    // Both are what people already have — `session` in a hand-rolled log,
    // `conversation_id` in most chat schemas. A field nobody sets measures nothing.
    const report = profile(
      Array.from({ length: 10 }, (_, t) => ({
        model: 'claude-opus-5',
        label: 'agent',
        conversation_id: 'abc',
        usage: { input_tokens: 600 + t * 400, output_tokens: 200 },
      })),
    );
    assert.equal(report.hasSessions, true);
    assert.equal(report.conversations.length, 1);
  });

  it('does not merge calls that carry no session into one long conversation', () => {
    /**
     * Lumping them together would report a turn count that is really a call count,
     * and a growth figure derived from it would be arithmetic performed on a
     * fiction — the biggest number on the report, invented.
     */
    const mixed = profile([
      ...conversation(5, 6),
      // Deliberately small: the point is whether they are counted as turns, and
      // a sessionless bill large enough to swamp the share would prove nothing.
      ...Array.from({ length: 400 }, () => ({
        model: 'claude-opus-5',
        label: 'agent',
        usage: { input_tokens: 100, output_tokens: 20 },
      })),
    ]);
    const [growth] = mixed.conversations;
    assert.equal(growth.sessions, 5);
    assert.equal(growth.calls, 30, 'sessionless calls were counted as turns');
  });

  it('prices nothing against a model it could not price', () => {
    const report = profile(
      Array.from({ length: 10 }, (_, t) => ({
        model: 'some-finetune-nobody-published',
        label: 'agent',
        session: 'abc',
        usage: { input_tokens: 600 + t * 400, output_tokens: 200 },
      })),
    );
    assert.deepEqual(report.conversations, []);
  });
});

describe('what the session key is allowed to do', () => {
  it('appears in no field of the report', () => {
    /**
     * The guarantee this whole area rests on. A session key is somebody's
     * conversation and in a real log is often an account id, a ticket number or an
     * email address. It groups calls and counts turns; nothing derived from it
     * carries it.
     *
     * Asserted over the serialised report rather than field by field, because a
     * field added later would slip past a list of names.
     */
    const secret = 'user-4471-billing-dispute@example.com';
    const report = profile(
      Array.from({ length: 8 }, (_, t) => ({
        model: 'claude-opus-5',
        label: 'agent',
        session: secret,
        usage: { input_tokens: 600 + t * 400, output_tokens: 200 },
      })),
    );

    assert.equal(report.conversations.length, 1, 'nothing was measured, so nothing is proved');
    assert.ok(
      !JSON.stringify(report).includes(secret),
      'the session key reached the report',
    );
    assert.ok(!JSON.stringify(report).includes('4471'), 'part of the session key survived');
  });
});
