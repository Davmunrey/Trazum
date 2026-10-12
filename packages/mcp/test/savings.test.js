import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BUNDLED_CATALOGUE, billLevers, buildPlan, profileUsage, verifyPlan } from '@trazum/core';
import { handle, InvalidArguments } from '../dist/rpc.js';
import { TOOLS, MAX_LOG_CHARS } from '../dist/tools.js';

const planTool = TOOLS.find((tool) => tool.name === 'plan_savings');
const verifyTool = TOOLS.find((tool) => tool.name === 'verify_savings');
const record = (overrides = {}) => ({
  model: 'claude-opus-5', label: 'synthetic-work',
  usage: { input_tokens: 400_000, output_tokens: 1_000 },
  ...overrides,
});
const logOf = (...records) => records.map((entry) => JSON.stringify(entry)).join('\n');
const log = logOf(record());
const planned = () => JSON.parse(planTool.run({ log }));
const checked = (plan, newer) => JSON.parse(verifyTool.run({ plan: JSON.stringify(plan), log: newer }));
const info = { name: 'synthetic-test', version: '1', instructions: '' };

// JSON text travels through the same tools/call response clients receive.
const rpc = (name, args) => handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, TOOLS, info);

describe('savings plans over MCP', () => {
  it('matches core planning, retaining assumptions and separate projected/measured totals', () => {
    const result = planned();
    const report = profileUsage(log, { catalogue: BUNDLED_CATALOGUE });
    const expected = buildPlan(report, billLevers(report, { catalogue: BUNDLED_CATALOGUE }), BUNDLED_CATALOGUE.lastReviewed);
    assert.deepEqual(result.plan, expected);
    assert.ok(result.plan.actions.length > 0);
    assert.ok(result.plan.projectedSavingUsd > 0);
    assert.equal(result.plan.measuredStakeUsd, 0);
    assert.ok(result.plan.actions[0].assumes.length > 0);
    assert.equal(result.evidence.pricedUsd, 2.025);
    assert.equal(result.evidence.complete, true);
    assert.match(result.limitations.join(' '), /not measured savings/);
  });

  it('names unreadable and unpriced evidence rather than including it as zero', () => {
    const result = JSON.parse(planTool.run({ log: `${log}\nnot-json\n${logOf(record({ model: 'synthetic-unpriced' }))}` }));
    assert.deepEqual(result.evidence.skippedLines, [2]);
    assert.deepEqual(result.evidence.unpricedModels, ['synthetic-unpriced']);
    assert.equal(result.evidence.unpricedCalls, 1);
    assert.equal(result.evidence.complete, false);
    const unknown = JSON.parse(planTool.run({ log: logOf(record({ model: 'synthetic-unpriced' })) }));
    assert.equal(unknown.plan.actions.length, 0);
    assert.equal(unknown.evidence.pricedCalls, 0);
    assert.equal(unknown.evidence.unpricedCalls, 1);
  });

  it('never echoes prompt contents or session identifiers from the log', () => {
    const result = planTool.run({ log: logOf(record({ prompt: 'synthetic-secret-prompt', session: 'synthetic-private-session' })) });
    assert.ok(!result.includes('synthetic-secret-prompt'));
    assert.ok(!result.includes('synthetic-private-session'));
  });

  it('prices caller models through an explicit overlay', () => {
    const pricing_overlay = JSON.stringify({ lastReviewed: '2026-10-12', models: {
      'synthetic-model': { displayName: 'Synthetic model', inputPerMTok: 2, outputPerMTok: 4, contextWindow: 500_000, cacheMinTokens: 1024, tier: 'sonnet', capability: 'mid', caching: 'automatic' },
    } });
    const result = JSON.parse(planTool.run({ log: logOf(record({ model: 'synthetic-model' })), pricing_overlay }));
    assert.equal(result.evidence.pricingOverlay, true);
    assert.equal(result.evidence.unpricedCalls, 0);
    assert.equal(result.evidence.pricedUsd, 0.804);
  });
});

describe('savings verification over MCP', () => {
  it('keeps arrived, not-arrived and cannot-tell distinct', () => {
    const { plan } = planned();
    const target = plan.actions[0].detail.routeTo.id;
    const arrived = checked(plan, logOf(record({ model: target })));
    assert.equal(arrived.verification.actions[0].outcome, 'arrived');
    assert.equal(arrived.verification.actions[0].observed.batchObservable, 0);
    assert.match(arrived.limitations.join(' '), /only verifies routing/);
    const unchanged = checked(plan, log);
    assert.equal(unchanged.verification.actions[0].outcome, 'not-arrived');
    assert.equal(unchanged.verification.gateFailures, 1);
    const vanished = checked(plan, logOf(record({ label: 'another-synthetic-workload' })));
    assert.equal(vanished.verification.actions[0].outcome, 'cannot-tell');
    assert.equal(vanished.verification.actions[0].reason, 'workload-vanished');
    assert.equal(vanished.verification.arrived, 0);
  });

  it('accepts a stamped CLI plan and matches core verification including price changes', () => {
    const plan = { ...planned().plan, createdAt: '2026-10-01T00:00:00Z', pricingLastReviewed: '2026-09-01' };
    const result = checked(plan, log);
    const expected = verifyPlan(plan, profileUsage(log, { catalogue: BUNDLED_CATALOGUE }), {
      currentPricingLastReviewed: BUNDLED_CATALOGUE.lastReviewed,
    });
    assert.deepEqual(result.verification, expected);
    assert.equal(result.verification.pricesChanged, true);
  });

  it('refuses malformed nested plans with a readable tool error', () => {
    const original = planned().plan;
    for (const mutate of [
      (p) => { delete p.actions[0].detail; },
      (p) => { delete p.actions[0].detail.routeTo; },
      (p) => { p.actions[0].detail.baseline.usd = -1; },
      (p) => { p.actions[0].savingUsd = 'invalid'; },
      (p) => { p.actions[0].assumes = null; },
      (p) => { p.totalUsd = -1; },
    ]) {
      const plan = structuredClone(original);
      mutate(plan);
      const response = rpc('verify_savings', { plan: JSON.stringify(plan), log });
      assert.equal(response.result.isError, true);
      assert.match(response.result.content[0].text, /plan/);
    }
  });
});

describe('savings input boundaries and protocol', () => {
  it('publishes closed schemas and refuses unknown arguments over JSON-RPC', () => {
    for (const tool of [planTool, verifyTool]) {
      assert.equal(tool.inputSchema.additionalProperties, false);
      const result = rpc(tool.name, { log, file_path: 'synthetic.jsonl' });
      assert.equal(result.result.isError, true);
      assert.match(result.result.content[0].text, /file_path/);
    }
    const result = rpc('plan_savings', { log });
    assert.equal(JSON.parse(result.result.content[0].text).plan.schemaVersion, 1);
  });

  it('bounds text and refuses empty, invalid and path-like inputs', () => {
    for (const value of ['', '  ', 1, {}, 'synthetic.jsonl', 'x'.repeat(MAX_LOG_CHARS + 1)]) {
      assert.throws(() => planTool.run({ log: value }), InvalidArguments);
    }
    assert.throws(() => verifyTool.run({ log, plan: '{}' }), InvalidArguments);
    assert.throws(() => verifyTool.run({ log, plan: 'x'.repeat(MAX_LOG_CHARS + 1) }), InvalidArguments);
    assert.throws(() => planTool.run({ log, pricing_overlay: '{}' }), InvalidArguments);
  });
});
