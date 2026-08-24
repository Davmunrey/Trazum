import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BUNDLED_CATALOGUE, gatewayDecision, usageFromResponse } from '../dist/index.js';

/**
 * The decision a proxy makes while somebody is waiting for an answer.
 *
 * Two rules carry this whole module and every case below tests one of them:
 * **it refuses and never substitutes**, and **failure is a decision the
 * operator made in advance**. The third — nothing about the payload is
 * recorded — is tested by the shape of the input: there is nowhere to put a
 * prompt in a `GatewayCall`, which is the point.
 *
 * Hand figures: Claude Opus 5 at $5/MTok input makes 200k input tokens $1.00.
 */

const ON = new Date('2026-08-16T00:00:00Z');

const call = (over = {}) => ({
  provider: 'anthropic',
  model: 'claude-opus-5',
  inputTokens: 200_000,
  maxOutputTokens: 0,
  label: null,
  ...over,
});

const standing = (over = {}) => ({
  limitUsd: 100,
  consumedUsd: 10,
  provenance: 'measured',
  asOfMs: ON.getTime(),
  ...over,
});

const decide = (c, s, policy = { onCannotTell: 'fail-closed' }) =>
  gatewayDecision(c, s, { catalogue: BUNDLED_CATALOGUE, policy, on: ON });

describe('gatewayDecision — it forwards what fits', () => {
  it('forwards a call inside the budget, carrying nothing the caller did not send', () => {
    /**
     * The most important assertion in this file. `forward` has exactly four
     * fields and none of them is a request: no rewritten model, no trimmed
     * prompt, no header to add. A field for any of those is how substitution
     * arrives one refactor later wearing a reasonable name. `policy` joined
     * in the 1.66 arc and is a judgement, not a request — it can refuse a
     * call, never rewrite one.
     */
    const decision = decide(call(), standing());
    assert.equal(decision.kind, 'forward');
    assert.deepEqual(Object.keys(decision).sort(), ['estimatedUsd', 'kind', 'policy', 'unjudged']);
    assert.ok(Math.abs(decision.estimatedUsd - 1) < 1e-9);
    assert.equal(decision.unjudged, null);
    assert.equal(decision.policy.reason, 'no-policy', 'no limits configured: judged as absent, not omitted');
  });

  it('prices the output ceiling the caller asked for, not one it invented', () => {
    // 200k in at $5 and 10k out at $25: $1.00 + $0.25.
    const decision = decide(call({ maxOutputTokens: 10_000 }), standing());
    assert.ok(Math.abs(decision.estimatedUsd - 1.25) < 1e-9, String(decision.estimatedUsd));
  });
});

describe('gatewayDecision — it refuses, and never substitutes', () => {
  it('refuses an exhausted budget on measurement alone', () => {
    const decision = decide(call(), standing({ consumedUsd: 120 }));
    assert.equal(decision.kind, 'refuse');
    assert.equal(decision.reason, 'budget-exhausted');
    // Nothing was estimated to reach this verdict, and the field says so.
    assert.equal(decision.restsOn, 'measured');
  });

  it('says which half a crossing rests on', () => {
    const decision = decide(call(), standing({ consumedUsd: 99.5 }));
    assert.equal(decision.reason, 'call-would-cross');
    assert.equal(decision.restsOn, 'measured+estimated');
  });

  it('never returns a modified request — the shape has nowhere to put one', () => {
    /**
     * Asserted structurally rather than by inspection: a refusal carries a
     * reason, the standing it rested on and alternatives, and no body.
     */
    const decision = decide(call(), standing({ consumedUsd: 120 }));
    const serialised = JSON.stringify(decision);
    assert.doesNotMatch(serialised, /"body"|"prompt"|"messages"|"rewritten"|"headers"/);
  });

  it('names the cheaper ways to make the same call', () => {
    // A refusal never arrives bare: a caller told only "no" has two moves,
    // send it anyway or fail, and both are worse than the call it wanted.
    const decision = decide(call(), standing({ consumedUsd: 120 }));
    assert.ok(decision.alternatives.length > 0);
    for (const alternative of decision.alternatives) {
      assert.ok(alternative.savingUsd > 0);
      assert.ok(alternative.assumes.length > 0, 'every alternative names what it assumes');
    }
    assert.ok(decision.alternatives.some((a) => a.kind === 'batch'));
  });

  it('never offers a model the call does not fit inside', () => {
    // 500k tokens: Haiku 4.5's window is 200k, so it is not a cheaper way to
    // make this call — it is a way not to make it.
    const decision = decide(
      call({ inputTokens: 500_000 }),
      standing({ consumedUsd: 500, limitUsd: 100 }),
    );
    assert.equal(
      decision.alternatives.some((a) => a.model?.id === 'claude-haiku-4-5'),
      false,
    );
  });

  it('offers batching as an alternative and never as something it can do', () => {
    /**
     * Moving a synchronous call onto a batch window changes *when* the answer
     * arrives, which is a change to what the caller asked for. It belongs on
     * the list of things a human might decide, and nowhere near a substitution.
     */
    const decision = decide(call(), standing({ consumedUsd: 120 }));
    const batch = decision.alternatives.find((a) => a.kind === 'batch');
    assert.ok(batch);
    assert.equal(batch.assumes[0].kind, 'batch-window');

    const substituting = gatewayDecision(call(), standing({ consumedUsd: 120 }), {
      catalogue: BUNDLED_CATALOGUE,
      on: ON,
      policy: { onCannotTell: 'fail-closed', substitute: { 'claude-opus-5': { to: 'claude-haiku-4-5', reason: 'x' } } },
    });
    assert.equal(substituting.kind, 'substitute');
    assert.equal(substituting.to.id, 'claude-haiku-4-5');
  });
});

describe('gatewayDecision — substitution is the operator\'s, in advance, and marked', () => {
  const withSubstitution = (over = {}) => ({
    onCannotTell: 'fail-closed',
    substitute: { 'claude-opus-5': { to: 'claude-haiku-4-5', reason: 'the quarter is over budget and this workload can take it' } },
    ...over,
  });

  it('is a different kind, never a forward with a changed model', () => {
    /**
     * The distinction that keeps every later report honest. A substituted call
     * that came back as `forward` would be indistinguishable downstream from
     * the call the caller actually made.
     */
    const decision = gatewayDecision(call(), standing({ consumedUsd: 120 }), {
      catalogue: BUNDLED_CATALOGUE,
      on: ON,
      policy: withSubstitution(),
    });
    assert.equal(decision.kind, 'substitute');
    assert.equal(decision.markedInStore, true);
    assert.match(decision.configuredReason, /over budget/);
  });

  it('never fires unless the operator configured it', () => {
    // Absent means refuse rather than swap — the only safe default for a
    // field whose whole risk is being switched on without anybody noticing.
    assert.equal(decide(call(), standing({ consumedUsd: 120 })).kind, 'refuse');
  });

  it('never fires because the gateway could not judge', () => {
    /**
     * Swapping a model because a *budget* could not be read would be answering
     * a different question for a reason with nothing to do with the request.
     * Configured substitution plus fail-closed is a refusal, not a swap.
     */
    const decision = gatewayDecision(call(), null, {
      catalogue: BUNDLED_CATALOGUE,
      on: ON,
      policy: withSubstitution(),
    });
    assert.equal(decision.kind, 'refuse');
    assert.equal(decision.reason, 'cannot-tell-and-closed');
  });

  it('refuses rather than swapping to a model nobody priced', () => {
    const decision = gatewayDecision(call(), standing({ consumedUsd: 120 }), {
      catalogue: BUNDLED_CATALOGUE,
      on: ON,
      policy: withSubstitution({ substitute: { 'claude-opus-5': { to: 'not-a-model', reason: 'x' } } }),
    });
    assert.equal(decision.kind, 'refuse');
  });
});

describe('gatewayDecision — failure is a decision made in advance', () => {
  for (const [name, s, c] of [
    ['no budget configured', null, 'no-budget'],
    ['an unpriced model', standing(), 'model-unpriced'],
  ]) {
    it(`fails closed on ${name}, naming the cause`, () => {
      const target = c === 'model-unpriced' ? call({ model: 'nobody-priced-this' }) : call();
      const decision = decide(target, s, { onCannotTell: 'fail-closed' });
      assert.equal(decision.kind, 'refuse');
      assert.equal(decision.reason, 'cannot-tell-and-closed');
      assert.equal(decision.cause, c);
      assert.match(decision.because, /fail closed/);
    });

    it(`fails open on ${name}, and says the call went through unjudged`, () => {
      /**
       * The important half of fail-open: the call is forwarded *and* the fact
       * that nothing judged it is carried, so a later report can tell "within
       * budget" from "nobody checked".
       */
      const target = c === 'model-unpriced' ? call({ model: 'nobody-priced-this' }) : call();
      const decision = decide(target, s, { onCannotTell: 'fail-open' });
      assert.equal(decision.kind, 'forward');
      assert.equal(decision.unjudged, c);
    });
  }

  it('has no default: the policy is a required field', () => {
    // Asserted at the type level in TypeScript and here as the fact that both
    // policies produce different answers to the same question — which is what
    // makes picking one silently the wrong thing to do.
    const open = decide(call(), null, { onCannotTell: 'fail-open' });
    const closed = decide(call(), null, { onCannotTell: 'fail-closed' });
    assert.notEqual(open.kind, closed.kind);
  });
});

describe('usageFromResponse', () => {
  it('reads what the provider reported, arriving with the answer', () => {
    const anthropic = usageFromResponse('anthropic', {
      usage: { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 500 },
    });
    assert.deepEqual(anthropic, {
      inputTokens: 1000,
      outputTokens: 200,
      cacheReadTokens: 500,
      cacheWriteTokens: 0,
    });
  });

  it('subtracts OpenAI\'s cached tokens from the fresh input, as the connector does', () => {
    // `prompt_tokens` includes the cached ones. Counting them twice puts the
    // period's total above the invoice, in the flattering direction.
    const openai = usageFromResponse('openai', {
      usage: { prompt_tokens: 3400, completion_tokens: 180, prompt_tokens_details: { cached_tokens: 3072 } },
    });
    assert.equal(openai.inputTokens, 328);
    assert.equal(openai.cacheReadTokens, 3072);
  });

  it('returns null rather than zero when the body carries no usage', () => {
    /**
     * A response whose usage could not be read is a call whose cost is
     * unknown. Zero would make the period's total quietly too low, which is
     * the direction this repository refuses everywhere it can occur.
     */
    for (const body of [null, 'a string', {}, { usage: null }, { usage: {} }, { usage: { other: 1 } }]) {
      assert.equal(usageFromResponse('anthropic', body), null, JSON.stringify(body));
    }
  });

  it('returns null for a provider it does not know how to read', () => {
    assert.equal(usageFromResponse('somebody-else', { usage: { input_tokens: 1 } }), null);
  });
});
