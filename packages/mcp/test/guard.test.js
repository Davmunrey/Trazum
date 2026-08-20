import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { TOOLS } from '../dist/tools.js';

/**
 * The guard as an agent sees it. $1.00 = 200k input tokens on Claude Opus 5.
 */

const guard = TOOLS.find((tool) => tool.name === 'spend_guard');

describe('spend_guard over MCP', () => {
  it('is offered alongside the other tools', () => {
    assert.ok(guard, 'the server must expose spend_guard');
    assert.deepEqual(
      TOOLS.map((tool) => tool.name),
      ['optimize_prompt', 'check_prompt', 'list_models', 'profile_usage', 'spend_guard'],
    );
  });

  it('refuses with the cheaper way attached', () => {
    const answer = JSON.parse(
      guard.run({ model: 'claude-opus-5', inputTokens: 200_000, consumedUsd: 99.5, limitUsd: 100, batchEligible: true }),
    );
    assert.equal(answer.verdict, 'no');
    assert.ok(answer.alternatives.length > 0, 'a bare refusal teaches a caller to stop asking');
    const best = answer.alternatives[0];
    assert.equal(best.fits, true);
    assert.ok(best.savingUsd > 0);
    assert.ok(best.assumes.length > 0);
  });

  it('keeps the measured and estimated halves apart in what it hands an agent', () => {
    const answer = JSON.parse(
      guard.run({ model: 'claude-opus-5', inputTokens: 200_000, consumedUsd: 40, limitUsd: 100 }),
    );
    assert.equal(answer.cost.call.provenance, 'estimated');
    assert.equal(answer.cost.budget.provenance, 'measured');
    assert.equal(answer.cost.restsOn, 'measured+estimated');
  });

  it('will not say yes to what it cannot judge', () => {
    const answer = JSON.parse(guard.run({ model: 'claude-opus-5', inputTokens: 1000 }));
    assert.equal(answer.verdict, 'cannot-tell');
  });

  it('validates its arguments rather than pricing nonsense', () => {
    assert.throws(() => guard.run({ inputTokens: 10 }), /model/);
    assert.throws(() => guard.run({ model: 'claude-opus-5', inputTokens: -1 }), /inputTokens/);
  });

  it('documents that it spends nothing to answer', () => {
    assert.match(guard.description, /[Nn]othing is called and nothing is spent/);
  });

  it('is a contract: the doc and the answer promise each other every field', () => {
    const doc = readFileSync(new URL('../../../docs/json-output.md', import.meta.url).pathname, 'utf8');
    // Bounded to its own section. Every time a new contract is appended to
    // this file, an unbounded harvest starts enforcing the *next* shape's
    // fields on this one — which has now happened five times, so the bound is
    // written before the section that would break it.
    const start = doc.indexOf('## The spend-guard document');
    const end = doc.indexOf('## The first-run document');
    const section = doc.slice(start, end === -1 ? undefined : end);
    const promised = new Set([...section.matchAll(/^\| `([a-zA-Z]+)`/gm)].map((m) => m[1]));
    const emitted = Object.keys(
      JSON.parse(guard.run({ model: 'claude-opus-5', inputTokens: 1000, consumedUsd: 1, limitUsd: 10 })),
    );
    assert.deepEqual(emitted.filter((k) => !promised.has(k)), [], 'fields emitted with no line in the doc');
    assert.deepEqual([...promised].filter((k) => !emitted.includes(k)), [], 'fields promised and not emitted');
  });
});
