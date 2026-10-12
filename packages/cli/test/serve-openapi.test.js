import assert from 'node:assert/strict';
import { it } from 'node:test';
import { BUNDLED_CATALOGUE } from '@trazum/core';
import { buildServer, listen } from '../dist/serve.js';
import { SERVE_OPENAPI } from '../dist/serve-schema.js';

async function setup(t, overrides = {}) {
  const server = buildServer({ catalogue: BUNDLED_CATALOGUE, position: () => ({}), ...overrides });
  const address = await listen(server, { port: 0 });
  t.after(() => { server.closeAllConnections(); server.close(); });
  const url = `http://${address}`;
  return {
    get: (path) => fetch(`${url}${path}`),
    post: (body) => fetch(`${url}/cost`, { method: 'POST', headers: { 'content-type': 'application/json' }, body }),
  };
}

// Execute the schema subset this contract actually publishes. Unknown assertion keywords
// fail the test, so expanding the schema cannot quietly weaken response verification.
function matches(value, schema) {
  const allowed = new Set(['$ref', 'type', 'properties', 'required', 'additionalProperties', 'enum', 'const', 'minimum', 'anyOf', 'oneOf', 'items', 'minItems', 'maxItems', 'description', 'default']);
  for (const key of Object.keys(schema)) assert.ok(allowed.has(key), `unsupported assertion: ${key}`);
  if (schema.$ref) return matches(value, SERVE_OPENAPI.components.schemas[schema.$ref.split('/').at(-1)]);
  if (schema.type) {
    const actual = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
    if (!(Array.isArray(schema.type) ? schema.type : [schema.type]).includes(actual)) return false;
    if (actual === 'number' && !Number.isFinite(value)) return false;
  }
  if ('const' in schema && value !== schema.const) return false;
  if (schema.enum && !schema.enum.includes(value)) return false;
  if (schema.minimum !== undefined && value < schema.minimum) return false;
  if (schema.anyOf && !schema.anyOf.some((entry) => matches(value, entry))) return false;
  if (schema.oneOf && schema.oneOf.filter((entry) => matches(value, entry)).length !== 1) return false;
  if (schema.required && schema.required.some((key) => !Object.hasOwn(value, key))) return false;
  if (schema.properties && value !== null && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, entry] of Object.entries(schema.properties)) if (Object.hasOwn(value, key) && !matches(value[key], entry)) return false;
    if (schema.additionalProperties === false && Object.keys(value).some((key) => !Object.hasOwn(schema.properties, key))) return false;
  }
  if (Array.isArray(value)) {
    if (schema.items && !value.every((entry) => matches(entry, schema.items))) return false;
    if (schema.minItems !== undefined && value.length < schema.minItems) return false;
    if (schema.maxItems !== undefined && value.length > schema.maxItems) return false;
  }
  return true;
}

it('serves an OpenAPI 3.1 contract on loopback without opening CORS or extra methods', async (t) => {
  const api = await setup(t);
  const response = await api.get('/openapi.json');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('access-control-allow-origin'), null);
  assert.deepEqual(await response.json(), SERVE_OPENAPI);
  assert.equal(SERVE_OPENAPI.openapi, '3.1.0');
  assert.deepEqual(Object.keys(SERVE_OPENAPI.paths).sort(), ['/capabilities', '/cost', '/health', '/openapi.json', '/savings/plan', '/savings/verify']);
  assert.ok(matches(await (await api.get('/health')).json(), SERVE_OPENAPI.components.schemas.Health));
  const unsupported = await api.get('/cost');
  assert.equal(unsupported.status, 404);
  assert.ok(matches(await unsupported.json(), SERVE_OPENAPI.components.schemas.Error));
});

it('rejects malformed shapes and typed fields without killing the local server', async (t) => {
  const api = await setup(t);
  const invalid = [null, [], 4, true, 'prompt', { model: 1 }, { label: false }, { session: null },
    { basis: 'guess' }, { inputTokens: '500' }, { inputTokens: -1 }, { outputTokens: null }];
  for (const payload of invalid) {
    assert.equal(matches(payload, SERVE_OPENAPI.components.schemas.CostRequest), false);
    const response = await api.post(JSON.stringify(payload));
    assert.equal(response.status, 400, JSON.stringify(payload));
    assert.ok(matches(await response.json(), SERVE_OPENAPI.components.schemas.Error));
  }
  for (const body of ['not JSON', '{"inputTokens":1e400}', ' '.repeat(1_000_001)]) {
    assert.equal((await api.post(body)).status, 400);
  }
  assert.equal((await api.get('/health')).status, 200);
});

it('keeps optional fields, fractional counts, unknown fields and whitespace-body compatibility', async (t) => {
  const api = await setup(t);
  for (const payload of [{}, { model: 'claude-opus-5', inputTokens: 0.5 }, { ignored: true }, { label: '', session: '', basis: 'heuristic' }]) {
    assert.ok(matches(payload, SERVE_OPENAPI.components.schemas.CostRequest));
    const response = await api.post(JSON.stringify(payload));
    assert.equal(response.status, 200);
    assert.ok(matches(await response.json(), SERVE_OPENAPI.components.schemas.CostAnswer));
  }
  assert.equal((await api.post('  ')).status, 200);
});

it('emits schema-valid priced, unpriced and scoped policy answer unions', async (t) => {
  const cases = [
    [{}, {}, 'cannot-tell', 'no-budget-configured'],
    [{ limitUsd: 10 }, {}, 'cannot-tell', 'nothing-measured'],
    [{ limitUsd: 10, consumedUsd: 1 }, { model: 'unknown-synthetic-model' }, 'cannot-tell', 'model-unpriced'],
    [{ limitUsd: 10, consumedUsd: 1 }, { model: 'claude-opus-5', inputTokens: 10 }, 'within', null],
    [{ limitUsd: 0, consumedUsd: 1 }, { model: 'claude-opus-5', inputTokens: 10 }, 'over', null],
  ];
  for (const [position, call, verdict, reason] of cases) {
    const api = await setup(t, { position: () => position, limits: { dayUsd: 0.1, sessionUsd: 1, byLabel: { synthetic: 1 } }, measured: () => ({ dayUsd: 0.2, sessionUsd: null, labelUsd: null }) });
    const response = await api.post(JSON.stringify(call));
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.verdict, verdict);
    assert.equal(body.reason, reason);
    assert.ok(matches(body, SERVE_OPENAPI.components.schemas.CostAnswer), JSON.stringify(body));
    // Invalid combinations must fail the union rather than merely matching common fields.
    assert.equal(matches({ ...body, reason: 'invented-reason' }, SERVE_OPENAPI.components.schemas.CostAnswer), false);
    assert.equal(matches({ ...body, unexpected: true }, SERVE_OPENAPI.components.schemas.CostAnswer), false);
  }
});


it('publishes schema-valid static capabilities without guessing billing or native support', async (t) => {
  const api = await setup(t, { position: () => { throw new Error('discovery must not read spending'); } });
  const response = await api.get('/capabilities');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('access-control-allow-origin'), null);
  const body = await response.json();
  assert.ok(matches(body, SERVE_OPENAPI.components.schemas.HarnessCapabilities));
  assert.equal(body.harnesses.find((entry) => entry.id === 'codex').nativeImport.command, 'from-codex');
  assert.equal(body.harnesses.find((entry) => entry.id === 'cursor').nativeImport, null);
  assert.equal(body.harnesses.find((entry) => entry.id === 'mcp-client').nativeImport, null);
  assert.ok(body.harnesses.every((entry) => entry.billingMode === 'unknown' && !entry.automaticInterception));
  assert.equal(body.taskQuality, 'not-measured');
  assert.equal(matches({ ...body, taskQuality: 'measured' }, SERVE_OPENAPI.components.schemas.HarnessCapabilities), false);
  const incorrect = { ...body.harnesses[0], nativeImport: { command: 'from-codex', format: 'claude-code-transcript-jsonl' } };
  assert.equal(matches(incorrect, SERVE_OPENAPI.components.schemas.HarnessCapability), false);
});
