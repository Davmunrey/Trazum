import assert from 'node:assert/strict';
import { it } from 'node:test';
import { BUNDLED_CATALOGUE } from '@trazum/core';
import { buildServer, listen, MAX_BODY_BYTES } from '../dist/serve.js';
import { MAX_IMPORT_RESPONSE_BYTES } from '../dist/serve-import.js';
import { SERVE_OPENAPI } from '../dist/serve-schema.js';
import { TOOLS } from '../../mcp/dist/tools.js';

const lines = (...rows) => rows.map(JSON.stringify).join('\n');
const claude = (extra = {}) => ({ type: 'assistant', requestId: 'synthetic-request', sessionId: 'synthetic-session',
  timestamp: '2026-10-01T00:00:00Z',
  cwd: '/synthetic-private-path', label: 'synthetic-private-label',
  message: { model: 'claude-opus-5', content: [{ text: 'synthetic-private-prompt' }],
    usage: { input_tokens: 400_000, output_tokens: 1_000 } }, ...extra });
const counts = (input) => ({ input_tokens: input, cached_input_tokens: input / 5,
  output_tokens: input / 10, reasoning_output_tokens: input / 20, total_tokens: input + input / 10 });
const snapshot = (total, last) => ({ type: 'event_msg', payload: { type: 'token_count',
  info: { total_token_usage: counts(total), last_token_usage: counts(last) } } });
const codex = lines({ type: 'session_meta', payload: { id: 'synthetic-session', cwd: '/synthetic-private-path' } },
  { type: 'turn_context', payload: { model: 'gpt-5.4', instructions: 'synthetic-private-prompt' } },
  snapshot(100, 100), snapshot(200, 100), snapshot(100, 100), snapshot(200, 100));
const mcp = (payload) => JSON.parse(TOOLS.find((tool) => tool.name === 'import_usage').run(payload));

async function setup(t) {
  const unexpectedMeasurement = () => { throw new Error('import must not read measured spending'); };
  const server = buildServer({ catalogue: BUNDLED_CATALOGUE, position: unexpectedMeasurement, measured: unexpectedMeasurement });
  const address = await listen(server, { port: 0 });
  t.after(() => { server.closeAllConnections(); server.close(); });
  return async (payload, { path = '/usage/import', method = 'POST', raw = false } = {}) => {
    const response = await fetch(`http://${address}${path}`, { method,
      ...(method === 'GET' || method === 'OPTIONS' ? {} : { body: raw ? payload : JSON.stringify(payload) }) });
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('access-control-allow-origin'), null);
    const text = await response.text();
    if (path === '/usage/import' && response.status === 200) assert.ok(Buffer.byteLength(text) <= MAX_IMPORT_RESPONSE_BYTES);
    return { status: response.status, body: JSON.parse(text) };
  };
}

// Interpret the published schema subset independently of the request/response handlers.
function matches(value, schema) {
  const supported = ['type', 'properties', 'required', 'additionalProperties', 'const', 'enum', 'minimum', 'minLength', 'maxLength', 'oneOf', 'items', 'description'];
  for (const key of Object.keys(schema)) assert.ok(supported.includes(key), `unsupported schema keyword ${key}`);
  if (schema.oneOf && schema.oneOf.filter((entry) => matches(value, entry)).length !== 1) return false;
  const actual = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  if (schema.type && actual !== schema.type && !(schema.type === 'integer' && Number.isInteger(value))) return false;
  if (actual === 'number' && !Number.isFinite(value)) return false;
  if ('const' in schema && value !== schema.const) return false;
  if (schema.enum && !schema.enum.includes(value)) return false;
  if (schema.minimum !== undefined && value < schema.minimum) return false;
  if (schema.minLength !== undefined && value.length < schema.minLength) return false;
  if (schema.maxLength !== undefined && value.length > schema.maxLength) return false;
  if (schema.required && schema.required.some((key) => !Object.hasOwn(value, key))) return false;
  if (schema.properties && actual === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (!Object.hasOwn(schema.properties, key)) { if (schema.additionalProperties === false) return false; }
      else if (!matches(item, schema.properties[key])) return false;
    }
  }
  if (schema.items && !value.every((item) => matches(item, schema.items))) return false;
  return true;
}

it('imports both native formats with MCP parity, bounded responses and accurate OpenAPI schemas', async (t) => {
  const post = await setup(t);
  for (const [format, text] of [['claude-code', lines(claude(), claude()) + '\nmalformed'], ['codex', codex + '\nmalformed']]) {
    const payload = { format, text, label: 'synthetic-work' };
    const { status, body } = await post(payload);
    assert.equal(status, 200);
    assert.deepEqual(body, mcp(payload));
    assert.ok(matches(payload, SERVE_OPENAPI.components.schemas.UsageImportRequest));
    assert.ok(matches(body, SERVE_OPENAPI.components.schemas.UsageImportAnswer));
    assert.equal(matches({ ...body, format: format === 'codex' ? 'claude-code' : 'codex' }, SERVE_OPENAPI.components.schemas.UsageImportAnswer), false);
    assert.equal(body.diagnostics.unparseable, 1);
    assert.ok(body.records > 0);
    assert.equal(body.evidence.completeness, 'not-established');
    assert.doesNotMatch(JSON.stringify(body), /synthetic-private/);
    assert.equal(JSON.parse(body.log.split('\n')[0]).session, 'synthetic-session');
    if (format === 'claude-code') assert.equal(body.diagnostics.collapsed, 1);
    else {
      assert.equal(body.records, 2);
      assert.equal(JSON.parse(body.log.split('\n')[0]).usage.input_tokens, 80);
      assert.equal(JSON.parse(body.log.split('\n')[0]).usage.cache_read_input_tokens, 20);
      assert.equal(JSON.parse(body.log.split('\n')[0]).usage.output_tokens, 10);
    }
    assert.deepEqual((await post(payload)).body, body, 'calls do not share conversion state');
  }
  const route = SERVE_OPENAPI.paths['/usage/import'].post;
  assert.equal(route.requestBody.required, true);
  assert.equal(route.responses['200'].content['application/json'].schema.$ref, '#/components/schemas/UsageImportAnswer');
  for (const method of ['GET', 'OPTIONS']) assert.equal((await post({}, { method })).status, 404);
});

it('rejects malformed requests, unknown fields and implicit source selection without echoing input', async (t) => {
  const post = await setup(t);
  for (const payload of [null, [], 1, {}, { text: '{}' }, { format: 'unknown', text: '{}' },
    ...['', ' ', null, 1].map((text) => ({ format: 'codex', text })),
    ...['', ' ', null, 1, 'x'.repeat(201)].map((label) => ({ format: 'codex', text: '{}', label })),
    { format: 'codex', text: '{}', path: '/synthetic-private-path' },
    { format: 'codex', text: '{}', labelByCwd: true }, { format: 'codex', text: '{}', pricing_overlay: '{}' },
  ]) {
    const result = await post(payload);
    assert.equal(result.status, 400);
    assert.equal(result.body.error, 'bad-request');
    assert.doesNotMatch(result.body.detail, /synthetic-private/);
  }
  const malformed = await post('{"synthetic-private', { raw: true });
  assert.equal(malformed.status, 400);
  assert.equal(malformed.body.detail, 'The body must be JSON.');
  assert.equal((await post({}, { path: '/health', method: 'GET' })).status, 200);
});

it('retains empty and incomplete imports as evidence gaps, not a zero-cost bill', async (t) => {
  const post = await setup(t);
  for (const text of ['malformed', '{}', lines(snapshot(100, 100)),
    lines({ type: 'turn_context', payload: { model: 'gpt-5.4' } }, { type: 'event_msg', payload: { type: 'token_count', info: {} } })]) {
    const { body, status } = await post({ format: 'codex', text });
    assert.equal(status, 200);
    assert.equal(body.records, 0);
    assert.equal(body.log, '');
    assert.equal(body.evidence.billingMode, 'unknown');
    assert.equal(body.evidence.completeness, 'not-established');
    assert.ok(Object.values(body.diagnostics).some((count) => count > 0));
    assert.equal((await post({ log: body.log }, { path: '/savings/plan' })).status, 400);
  }
  const unlabelled = (await post({ format: 'claude-code', text: lines(claude()) })).body;
  assert.equal(JSON.parse(unlabelled.log).label, undefined);
  assert.doesNotMatch(JSON.stringify(unlabelled), /synthetic-private/);
});

it('enforces the whole request UTF-8 byte boundary, including JSON escaping', async (t) => {
  const post = await setup(t);
  const json = JSON.stringify({ format: 'codex', text: '{"synthetic":"é"}' });
  const exact = json + ' '.repeat(MAX_BODY_BYTES - Buffer.byteLength(json));
  assert.ok(exact.length < MAX_BODY_BYTES);
  assert.equal((await post(exact, { raw: true })).status, 200);
  const oversized = await post(exact + ' ', { raw: true });
  assert.equal(oversized.status, 400);
  assert.match(oversized.body.detail, /at most 1000000 bytes/);
});

it('bounds expanded response bytes and JSON escaping rather than only the normalized log length', async (t) => {
  const post = await setup(t);
  for (const [size, label] of [[2000, 'é'.repeat(200)], [1300, '\\'.repeat(200)]]) {
    const text = Array.from({ length: size }, (_, index) => JSON.stringify({ type: 'assistant', requestId: `synthetic-${index}`,
      message: { model: 'claude-opus-5', usage: { input_tokens: 1, output_tokens: 1 } } })).join('\n');
    const payload = { format: 'claude-code', text, label };
    assert.ok(Buffer.byteLength(JSON.stringify(payload)) < MAX_BODY_BYTES);
    const normalized = mcp(payload);
    const encoded = JSON.stringify(normalized);
    assert.ok(Buffer.byteLength(encoded) > MAX_IMPORT_RESPONSE_BYTES);
    if (label.startsWith('é')) assert.ok(encoded.length < MAX_IMPORT_RESPONSE_BYTES);
    else assert.ok(Buffer.byteLength(normalized.log) < MAX_IMPORT_RESPONSE_BYTES);
    const result = await post(payload);
    assert.equal(result.status, 400);
    assert.match(result.body.detail, /Normalized import response exceeds 1000000 UTF-8 bytes/);
    assert.equal((await post({ format: 'codex', text: '{}' })).status, 200);
  }
});

it('runs native import, savings planning and later verification over HTTP', async (t) => {
  const post = await setup(t);
  const imported = await post({ format: 'claude-code', text: lines(claude()), label: 'synthetic-work' });
  const planned = await post({ log: imported.body.log }, { path: '/savings/plan' });
  assert.equal(planned.status, 200);
  const plan = JSON.stringify(planned.body.plan);
  const unchanged = await post({ log: imported.body.log, plan }, { path: '/savings/verify' });
  assert.equal(unchanged.status, 200);
  assert.equal(unchanged.body.verification.arrived, 0);
  const target = planned.body.plan.actions.find((action) => action.detail.routeTo)?.detail.routeTo.id;
  assert.ok(target);
  const source = claude();
  source.message.model = target;
  const later = await post({ format: 'claude-code', text: lines(source), label: 'synthetic-work' });
  const changed = await post({ log: later.body.log, plan }, { path: '/savings/verify' });
  assert.equal(changed.status, 200);
  assert.ok(changed.body.verification.arrived > 0);
});
