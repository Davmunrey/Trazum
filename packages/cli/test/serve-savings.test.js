import assert from 'node:assert/strict';
import { it } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SPAWN_ENV } from './env.mjs';
import { BUNDLED_CATALOGUE, catalogueFromOverlay } from '@trazum/core';
import { buildServer, listen, MAX_BODY_BYTES } from '../dist/serve.js';
import { SERVE_OPENAPI } from '../dist/serve-schema.js';
import { TOOLS } from '../../mcp/dist/tools.js';

const record = (extra = {}) => ({ model: 'claude-opus-5', label: 'synthetic-work', usage: { input_tokens: 400_000, output_tokens: 1_000 }, ...extra });
const logOf = (...rows) => rows.map((row) => JSON.stringify(row)).join('\n');
const log = logOf(record());
const mcp = (name, args) => JSON.parse(TOOLS.find((tool) => tool.name === name).run(args));
async function setup(t, catalogue = BUNDLED_CATALOGUE) {
  const server = buildServer({ catalogue, position: () => { throw new Error('savings must not read measured budget'); }, measured: () => { throw new Error('savings must not read scoped measurements'); } });
  const address = await listen(server, { port: 0 });
  t.after(() => { server.closeAllConnections(); server.close(); });
  return async (path, payload, raw = false, method = 'POST') => {
    const response = await fetch(`http://${address}${path}`, { method, ...(method === 'GET' ? {} : { body: raw ? payload : JSON.stringify(payload) }) });
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('access-control-allow-origin'), null);
    return { status: response.status, body: await response.json() };
  };
}

// Fail on unsupported assertion keywords instead of silently skipping contract checks.
function matches(value, schema) {
  const allowed = ['$ref', 'type', 'properties', 'required', 'additionalProperties', 'enum', 'const', 'minimum', 'anyOf', 'oneOf', 'items', 'minLength', 'maxLength', 'description'];
  for (const key of Object.keys(schema)) assert.ok(allowed.includes(key), `unsupported schema assertion ${key}`);
  if (schema.$ref) return matches(value, SERVE_OPENAPI.components.schemas[schema.$ref.split('/').at(-1)]);
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const actual = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
    if (!(types.includes(actual) || (types.includes('integer') && Number.isInteger(value)))) return false;
    if (actual === 'number' && !Number.isFinite(value)) return false;
  }
  if ('const' in schema && value !== schema.const) return false;
  if (schema.enum && !schema.enum.includes(value)) return false;
  if (schema.minimum !== undefined && value < schema.minimum) return false;
  if (schema.minLength !== undefined && value.length < schema.minLength) return false;
  if (schema.maxLength !== undefined && value.length > schema.maxLength) return false;
  if (schema.anyOf && !schema.anyOf.some((entry) => matches(value, entry))) return false;
  if (schema.oneOf && schema.oneOf.filter((entry) => matches(value, entry)).length !== 1) return false;
  if (schema.required && schema.required.some((key) => !Object.hasOwn(value, key))) return false;
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, entry] of Object.entries(value)) {
      const property = schema.properties?.[key];
      if (property && !matches(entry, property)) return false;
      if (!property && schema.additionalProperties === false) return false;
      if (!property && typeof schema.additionalProperties === 'object' && !matches(entry, schema.additionalProperties)) return false;
    }
  }
  if (Array.isArray(value) && schema.items && !value.every((entry) => matches(entry, schema.items))) return false;
  return true;
}

it('HTTP plans and verifies with MCP parity and published response schemas', async (t) => {
  const post = await setup(t);
  const planned = await post('/savings/plan', { log });
  assert.equal(planned.status, 200);
  assert.deepEqual(planned.body, mcp('plan_savings', { log }));
  assert.ok(matches(planned.body, SERVE_OPENAPI.components.schemas.SavingsPlanAnswer));
  const plan = JSON.stringify(planned.body.plan);
  const outcomes = new Set();
  const target = planned.body.plan.actions.find((action) => action.detail.routeTo)?.detail.routeTo.id;
  assert.ok(target);
  for (const newer of [log, logOf(record({ label: 'another-workload' })), logOf(record({ model: target }))]) {
    const verified = await post('/savings/verify', { log: newer, plan });
    assert.equal(verified.status, 200);
    for (const action of verified.body.verification.actions) outcomes.add(action.outcome);
    assert.deepEqual(verified.body, mcp('verify_savings', { log: newer, plan }));
    assert.ok(matches(verified.body, SERVE_OPENAPI.components.schemas.SavingsVerifyAnswer));
  }
  assert.deepEqual([...outcomes].sort(), ['arrived', 'cannot-tell', 'not-arrived']);
  const vanished = (await post('/savings/verify', { log: logOf(record({ label: 'another-workload' })), plan })).body;
  assert.equal(vanished.verification.arrived, 0);
  assert.ok(vanished.verification.cannotTell > 0);
  const path = SERVE_OPENAPI.paths['/savings/verify'].post;
  assert.equal(path.requestBody.required, true);
  assert.equal(SERVE_OPENAPI.components.schemas.SavingsVerifyRequest.additionalProperties, false);
  assert.equal((await post('/savings/plan', null, false, 'GET')).status, 404);
  assert.equal((await post('/savings/verify', {}, false, 'OPTIONS')).status, 404);
});

it('preserves incomplete and unpriced evidence without echoing private log content', async (t) => {
  const post = await setup(t);
  const mixed = `${logOf(record({ prompt: 'synthetic-secret', session: 'synthetic-session-private' }))}\nnot-json\n${logOf(record({ model: 'synthetic-unpriced' }))}`;
  const result = await post('/savings/plan', { log: mixed });
  assert.equal(result.status, 200);
  assert.equal(result.body.evidence.complete, false);
  assert.equal(result.body.evidence.unpricedCalls, 1);
  assert.deepEqual(result.body.evidence.skippedLines, [2]);
  assert.ok(!JSON.stringify(result.body).includes('synthetic-secret'));
  assert.ok(!JSON.stringify(result.body).includes('synthetic-session-private'));
  const unknown = await post('/savings/plan', { log: logOf(record({ model: 'synthetic-unpriced' })) });
  assert.equal(unknown.body.plan.actions.length, 0);
  assert.equal(unknown.body.evidence.complete, false);
  assert.equal(unknown.body.evidence.pricedCalls, 0);
});

it('uses only the configured catalogue and discloses custom rates', async (t) => {
  const pricing_overlay = JSON.stringify({ lastReviewed: '2026-10-12', models: { 'claude-opus-5': { inputPerMTok: 2, outputPerMTok: 4 } } });
  const post = await setup(t, catalogueFromOverlay(pricing_overlay, 'synthetic-pricing'));
  const result = await post('/savings/plan', { log });
  assert.equal(result.body.evidence.pricingOverlay, true);
  assert.equal(result.body.evidence.pricedUsd, 0.804);
  assert.deepEqual(result.body, mcp('plan_savings', { log, pricing_overlay }));
  assert.equal((await post('/savings/plan', { log, pricing_overlay })).status, 400);
});

it('rejects malformed, absent and path-like inputs, and survives requests at the byte boundary', async (t) => {
  const post = await setup(t);
  for (const payload of [null, [], 1, {}, { log: '' }, { log: '  ' }, { log: 1 }, { log: './usage.jsonl' }, { log, typo: true }]) {
    const result = await post('/savings/plan', payload);
    assert.equal(result.status, 400, JSON.stringify(payload));
    assert.equal(result.body.error, 'bad-request');
  }
  for (const raw of ['not-json', '', 'null', '{"log":']) assert.equal((await post('/savings/plan', raw, true)).status, 400);
  const base = JSON.stringify({ log });
  const exact = base + ' '.repeat(MAX_BODY_BYTES - Buffer.byteLength(base));
  assert.equal((await post('/savings/plan', exact, true)).status, 200);
  assert.equal((await post('/savings/plan', exact + ' ', true)).status, 400);
  const unicode = JSON.stringify({ log: '€'.repeat(350_000) });
  assert.ok(unicode.length < MAX_BODY_BYTES && Buffer.byteLength(unicode) > MAX_BODY_BYTES);
  assert.equal((await post('/savings/plan', unicode, true)).status, 400);
  assert.equal((await post('/health', null, false, 'GET')).status, 200);
});

it('defensively validates nested saved plans before verification', async (t) => {
  const post = await setup(t);
  const valid = mcp('plan_savings', { log }).plan;
  const mutations = [
    (p) => { p.privateMetadata = 'synthetic-private'; }, (p) => { p.actions[0].detail.extra = true; },
    (p) => { p.actions[0].detail.baseline.extra = true; },
    (p) => { p.projectedSavingUsd = -1; }, (p) => { p.measuredStakeUsd = null; },
    (p) => { p.totalUsd = '2'; }, (p) => { p.span = { fromMs: 2, toMs: 1 }; },
    (p) => { p.createdAt = 'never'; }, (p) => { p.pricingLastReviewed = ''; },
    (p) => { p.actions[0].detail = null; }, (p) => { p.actions[0].assumes = [null]; },
    (p) => { p.actions[0].check = {}; }, (p) => { p.actions[0].savingUsd = null; },
    (p) => { p.actions[0].stakeUsd = 2; }, (p) => { p.actions[0].detail.routeTo = {}; },
    (p) => { p.actions[0].detail.baseline.calls = -1; }, (p) => { p.actions[0].detail.measured = { usd: null }; },
  ];
  for (const mutate of mutations) {
    const plan = structuredClone(valid); mutate(plan);
    assert.equal((await post('/savings/verify', { log, plan: JSON.stringify(plan) })).status, 400);
  }
  for (const plan of ['', './plan.json', '{}', 'null', '[]', '{"schemaVersion":2,"actions":[]}']) {
    assert.equal((await post('/savings/verify', { log, plan })).status, 400);
  }
  assert.equal((await post('/savings/verify', { log, plan: valid })).status, 400);
  assert.equal((await post('/savings/verify', { log: 'not-json', plan: JSON.stringify(valid) })).status, 400);
  assert.equal((await post('/savings/verify', { log, plan: JSON.stringify(valid), unknown: true })).status, 400);
  assert.equal((await post('/savings/verify', { log, plan: JSON.stringify(valid) })).status, 200);
});


it('round-trips real CLI plan documents through HTTP verification and HTTP plans through CLI', async (t) => {
  const post = await setup(t);
  const dir = mkdtempSync(join(tmpdir(), 'trazum-http-plan-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, 'usage.jsonl'), log);
  const cli = (...args) => {
    const result = spawnSync(process.execPath, [new URL('../dist/index.js', import.meta.url).pathname, ...args], {
      cwd: dir, encoding: 'utf8', env: SPAWN_ENV, timeout: 30000,
    });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  };
  const cliPlan = cli('plan', 'usage.jsonl', '--json');
  assert.ok(cliPlan.createdAt);
  const fromCli = await post('/savings/verify', { plan: JSON.stringify(cliPlan), log });
  assert.equal(fromCli.status, 200);
  assert.equal(fromCli.body.verification.planCreatedAt, cliPlan.createdAt);
  assert.ok(matches(fromCli.body, SERVE_OPENAPI.components.schemas.SavingsVerifyAnswer));
  const fromHttp = await post('/savings/plan', { log });
  writeFileSync(join(dir, 'plan.json'), JSON.stringify(fromHttp.body.plan));
  const cliVerified = cli('verify', 'plan.json', '--against', 'usage.jsonl', '--json');
  const httpVerified = await post('/savings/verify', { plan: JSON.stringify(fromHttp.body.plan), log });
  assert.deepEqual(httpVerified.body.verification, cliVerified);
});
