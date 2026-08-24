import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BUNDLED_CATALOGUE, judgeLimits } from '../dist/index.js';

/**
 * One policy, judged once — chapter two of the 1.66 arc.
 *
 * Every case here is one a door could get wrong on its own arithmetic, and
 * the shape of each assertion is the arc's thesis: the answer must carry the
 * limit, the measured spend and the window it covers — the denominator, not
 * just the number — so a refusal can be audited without re-running anything.
 */

const catalogue = BUNDLED_CATALOGUE;

/** A call priced well under a dollar: opus at small counts. */
const CALL = { model: 'claude-opus-5', inputTokens: 10_000, outputTokens: 1_000, session: 's1', label: 'chat' };

const judge = (policy, position, call = CALL) =>
  judgeLimits(policy, position, call, { catalogue });

const POSITION = {
  dayUsd: 1,
  dayWindow: { fromMs: 0, toMs: 86_400_000 },
  sessionUsd: 0.2,
  labelUsd: 0.5,
};

describe('judging the limits policy', () => {
  it('answers within when every ceiling holds, one judgement per ceiling, in policy order', () => {
    const answer = judge({ dayUsd: 25, sessionUsd: 1.5, byLabel: { chat: 5 } }, POSITION);
    assert.equal(answer.verdict, 'within');
    assert.equal(answer.reason, null);
    assert.deepEqual(
      answer.judgements.map((entry) => [entry.scope, entry.verdict]),
      [['day', 'within'], ['session', 'within'], ['label', 'within']],
    );
    // The three figures a refusal must be auditable from, present on every entry.
    for (const entry of answer.judgements) {
      assert.equal(typeof entry.limitUsd, 'number');
      assert.equal(typeof entry.measuredUsd, 'number');
      assert.equal(typeof entry.afterCallUsd, 'number');
      assert.equal(entry.restsOn, 'measured+estimated');
    }
    assert.deepEqual(answer.judgements[0].window, { fromMs: 0, toMs: 86_400_000 });
    assert.equal(answer.judgements[2].label, 'chat');
  });

  it('is over the moment one ceiling is over, and says whether the estimate was needed', () => {
    // Already crossed without the estimate: a measurement, and it says so.
    const measured = judge({ dayUsd: 25, sessionUsd: 1.5 }, { ...POSITION, dayUsd: 30 });
    assert.equal(measured.verdict, 'over');
    assert.equal(measured.judgements[0].restsOn, 'measured');
    // It takes the call to cross: only as good as the token count, and it says so.
    const crossed = judge({ sessionUsd: 0.2001 }, POSITION);
    assert.equal(crossed.verdict, 'over');
    assert.equal(crossed.judgements[0].restsOn, 'measured+estimated');
  });

  it('cannot tell when a configured scope was never measured — null is not zero', () => {
    const answer = judge({ dayUsd: 25 }, { ...POSITION, dayUsd: null });
    assert.equal(answer.verdict, 'cannot-tell');
    assert.equal(answer.judgements[0].reason, 'nothing-measured');
    assert.equal(answer.judgements[0].measuredUsd, null);
  });

  it('closes the unlabelled-call loophole: byLabel ceilings make a label-less call unjudgeable', () => {
    const answer = judge({ byLabel: { chat: 5, batch: 0.25 } }, POSITION, { ...CALL, label: undefined });
    assert.equal(answer.verdict, 'cannot-tell');
    const [entry] = answer.judgements;
    assert.equal(entry.scope, 'label');
    assert.equal(entry.reason, 'no-label-on-call');
    // The ceiling reported is the smallest — the one the call might be dodging.
    assert.equal(entry.limitUsd, 0.25);
  });

  it('closes the same loophole for sessions', () => {
    const answer = judge({ sessionUsd: 1.5 }, POSITION, { ...CALL, session: undefined });
    assert.equal(answer.verdict, 'cannot-tell');
    assert.equal(answer.judgements[0].reason, 'no-session-on-call');
  });

  it('judges a labelled call only against its own label, and invents no ceiling for an unlisted one', () => {
    const chat = judge({ byLabel: { chat: 5, batch: 0.25 } }, POSITION);
    assert.deepEqual(chat.judgements.map((entry) => entry.label), ['chat']);
    const unlisted = judge({ byLabel: { batch: 0.25 } }, POSITION, { ...CALL, label: 'summarise' });
    assert.deepEqual(unlisted.judgements, []);
    assert.equal(unlisted.verdict, 'cannot-tell');
    assert.equal(unlisted.reason, 'no-policy');
  });

  it('answers no-policy when no ceiling applies, never within', () => {
    for (const policy of [undefined, {}, { byLabel: {} }]) {
      const answer = judge(policy, POSITION);
      assert.equal(answer.verdict, 'cannot-tell');
      assert.equal(answer.reason, 'no-policy');
      assert.deepEqual(answer.judgements, []);
    }
  });

  it('ranks over above cannot-tell above within, because "within" must mean everything was judged', () => {
    const mixed = judge({ dayUsd: 25, sessionUsd: 1.5 }, { ...POSITION, dayUsd: null });
    assert.equal(mixed.verdict, 'cannot-tell');
    const overWins = judge({ dayUsd: 25, sessionUsd: 0.1 }, { ...POSITION, dayUsd: null });
    assert.equal(overWins.verdict, 'over');
  });

  it('a waived limit keeps its measurement and loses its refusal, until the waiver expires', () => {
    const policy = { sessionUsd: 0.2001 };
    const waivers = [{ gate: 'limits.sessionUsd', reason: 'August migration', until: '2099-01-01' }];
    const silenced = judgeLimits(policy, POSITION, CALL, { catalogue, waivers });
    // The measurement is the measurement: the judgement still says over.
    assert.equal(silenced.judgements[0].verdict, 'over');
    // The silence is attached, on the record, in every answer.
    assert.deepEqual(silenced.judgements[0].waived, { reason: 'August migration', until: '2099-01-01' });
    // And the policy does not refuse what somebody decided to live with.
    assert.equal(silenced.verdict, 'within');

    // The day the waiver expires, the ceiling refuses again — nobody has to remember.
    const expired = judgeLimits(policy, POSITION, CALL, {
      catalogue,
      waivers: [{ gate: 'limits.sessionUsd', reason: 'was August', until: '2001-01-01' }],
    });
    assert.equal(expired.verdict, 'over');
    assert.equal(expired.judgements[0].waived, null);

    // A waiver names one gate; naming a different one silences nothing.
    const wrongGate = judgeLimits(policy, POSITION, CALL, {
      catalogue,
      waivers: [{ gate: 'limits.dayUsd', reason: 'not this one', until: '2099-01-01' }],
    });
    assert.equal(wrongGate.verdict, 'over');

    // Per-label waivers name the label.
    const labelled = judgeLimits({ byLabel: { chat: 0.5001 } }, POSITION, CALL, {
      catalogue,
      waivers: [{ gate: 'limits.byLabel:chat', reason: 'chat spike, reviewed', until: '2099-01-01' }],
    });
    assert.equal(labelled.verdict, 'within');
    assert.equal(labelled.judgements[0].verdict, 'over');
  });

  it('inherits answerCost\'s refusals: an unpriced model cannot be judged, a negative count throws', () => {
    const unpriced = judge({ dayUsd: 25 }, POSITION, { ...CALL, model: 'no-such-model' });
    assert.equal(unpriced.verdict, 'cannot-tell');
    assert.equal(unpriced.judgements[0].reason, 'model-unpriced');
    assert.throws(
      () => judge({ dayUsd: 25 }, POSITION, { ...CALL, outputTokens: -500 }),
      /non-negative finite number/,
    );
  });
});
