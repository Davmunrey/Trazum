import { SAVINGS_SCHEMAS } from './serve-savings-schema.js';
import { IMPORT_SCHEMAS } from './serve-import-schema.js';
/** Public contract for local, read-only cost and savings analysis. No provider calls occur here. */
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const nullable = (schema: object) => ({ anyOf: [schema, { type: 'null' }] });
const object = (properties: Record<string, unknown>) => ({
  type: 'object', properties, required: Object.keys(properties), additionalProperties: false,
});
const amount = { type: 'number', minimum: 0 };
const verdict = { enum: ['within', 'over', 'cannot-tell'] };
const restsOn = { enum: ['measured', 'measured+estimated', null] };

export const COST_REQUEST_SCHEMA = {
  type: 'object',
  description: 'All fields are optional. Missing counts default to zero. Unknown fields are ignored. An empty body is equivalent to {}.',
  additionalProperties: true,
  properties: {
    model: { type: 'string', description: 'Catalogue model identifier. Unknown models produce an unpriced call, not a substitute.' },
    inputTokens: { ...amount, description: 'Finite non-negative count; fractional counts remain accepted for compatibility.', default: 0 },
    outputTokens: { ...amount, description: 'Finite non-negative count; fractional counts remain accepted for compatibility.', default: 0 },
    basis: { type: 'string', enum: ['heuristic', 'token-count'], default: 'token-count' },
    label: { type: 'string', description: 'Optional policy scope. Empty string means absent.' },
    session: { type: 'string', description: 'Optional policy lookup key. Empty string means absent. Never echoed in the answer.' },
  },
} as const;

/** Same accepted fields as the published schema; invalid shapes never reach the core. */
export function validateCostPayload(value: unknown): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('The body must be a JSON object.');
  }
  const payload = value as Record<string, unknown>;
  for (const field of ['model', 'label', 'session'] as const) {
    if (payload[field] !== undefined && typeof payload[field] !== 'string') {
      throw new Error(`${field} must be a string.`);
    }
  }
  for (const field of ['inputTokens', 'outputTokens'] as const) {
    const count = payload[field];
    if (count !== undefined && (typeof count !== 'number' || !Number.isFinite(count) || count < 0)) {
      throw new Error(`${field} must be a non-negative finite number.`);
    }
  }
  if (payload.basis !== undefined && payload.basis !== 'heuristic' && payload.basis !== 'token-count') {
    throw new Error('basis must be heuristic or token-count.');
  }
}

const schemas = {
  ...SAVINGS_SCHEMAS,
  ...IMPORT_SCHEMAS,
  CostRequest: COST_REQUEST_SCHEMA,
  HarnessCapabilities: object({
    schemaVersion: { const: 1 },
    accessChannels: { type: 'array', items: { enum: ['cli', 'mcp', 'http'] }, description: 'Trazum entry points, not installed or automatically connected harness integrations.' },
    taskQuality: { const: 'not-measured' },
    harnesses: { type: 'array', items: ref('HarnessCapability') },
  }),
  HarnessCapability: object({
    id: { type: 'string' }, name: { type: 'string' },
    nativeImport: nullable({
      oneOf: [
        object({ command: { const: 'from-claude-code' }, format: { const: 'claude-code-transcript-jsonl' } }),
        object({ command: { const: 'from-codex' }, format: { const: 'codex-session-jsonl' } }),
      ],
    }),
    normalizedUsage: object({ command: { const: 'bill' }, format: { const: 'trazum-usage-jsonl' } }),
    billingMode: { const: 'unknown', description: 'The harness does not determine subscription, API billing, or actual invoice amounts.' },
    automaticInterception: { const: false, description: 'Gateway use is explicit; native hooks are not installed automatically.' },
  }),
  Health: object({ ok: { const: true }, schemaVersion: { const: 1 } }),
  Error: object({ error: { enum: ['bad-request', 'not-found'] }, detail: { type: 'string' } }),
  Window: object({ fromMs: { type: 'number' }, toMs: { type: 'number' } }),
  CallEstimate: object({
    model: { type: 'string' }, inputTokens: amount, outputTokens: amount, estimatedUsd: amount,
    provenance: { const: 'estimated' }, basis: { enum: ['heuristic', 'token-count'] },
  }),
  BudgetPosition: object({
    limitUsd: amount, consumedUsd: amount, remainingUsd: { type: 'number' },
    provenance: { const: 'measured' }, window: nullable(ref('Window')),
  }),
  AfterCall: object({ usd: amount, halves: object({ measuredUsd: amount, estimatedUsd: amount }) }),
  LimitJudgement: {
    ...object({
      scope: { enum: ['day', 'session', 'label'] }, label: { type: ['string', 'null'] },
      limitUsd: amount, verdict, restsOn,
      reason: { enum: ['nothing-measured', 'model-unpriced', 'no-label-on-call', 'no-session-on-call', null] },
      measuredUsd: nullable(amount), window: nullable(ref('Window')), afterCallUsd: nullable(amount),
      waived: nullable(object({ reason: { type: 'string' }, until: { type: 'string' } })),
    }),
    oneOf: [
      { properties: { verdict: { const: 'cannot-tell' }, restsOn: { type: 'null' }, reason: { type: 'string' }, afterCallUsd: { type: 'null' } } },
      { properties: { verdict: { enum: ['within', 'over'] }, restsOn: { enum: ['measured', 'measured+estimated'] }, reason: { type: 'null' }, afterCallUsd: amount } },
    ],
  },
  PolicyJudgement: {
    ...object({ schemaVersion: { const: 1 }, verdict, reason: { enum: ['no-policy', null] }, judgements: { type: 'array', items: ref('LimitJudgement') } }),
    oneOf: [
      { properties: { verdict: { const: 'cannot-tell' }, reason: { const: 'no-policy' }, judgements: { maxItems: 0 } } },
      { properties: { reason: { type: 'null' }, judgements: { minItems: 1 } } },
    ],
  },
  CostAnswer: {
    ...object({
      schemaVersion: { const: 1 }, call: nullable(ref('CallEstimate')), budget: nullable(ref('BudgetPosition')),
      verdict, restsOn, reason: { enum: ['no-budget-configured', 'nothing-measured', 'model-unpriced', null] },
      afterCall: nullable(ref('AfterCall')), policy: ref('PolicyJudgement'),
    }),
    oneOf: [
      { properties: { verdict: { const: 'cannot-tell' }, reason: { enum: ['no-budget-configured', 'nothing-measured'] }, budget: { type: 'null' }, restsOn: { type: 'null' }, afterCall: { type: 'null' } } },
      { properties: { verdict: { const: 'cannot-tell' }, reason: { const: 'model-unpriced' }, budget: ref('BudgetPosition'), call: { type: 'null' }, restsOn: { type: 'null' }, afterCall: { type: 'null' } } },
      { properties: { verdict: { enum: ['within', 'over'] }, reason: { type: 'null' }, budget: ref('BudgetPosition'), restsOn: { enum: ['measured', 'measured+estimated'] }, afterCall: ref('AfterCall') } },
    ],
  },
};

const response = (name: string, description: string) => ({ description, content: { 'application/json': { schema: ref(name) } } });

export const SERVE_OPENAPI = {
  openapi: '3.1.0',
  jsonSchemaDialect: 'https://json-schema.org/draft/2020-12/schema',
  info: { title: 'Trazum local cost and savings API', version: '1.0.0', description: 'Loopback-only read-only estimates, policy judgements and savings analysis. No authentication or CORS. Does not reserve budget, send model calls, or enforce an upstream decision. Measured positions are snapshots supplied by the CLI; inspect their windows.' },
  servers: [{ url: 'http://127.0.0.1:7317', description: 'Default TCP listener. Substitute the chosen --port, or use the Unix socket transport.' }],
  paths: {
    '/usage/import': { post: {
      operationId: 'importUsage', summary: 'Normalize explicit Claude Code or Codex transcript text',
      description: 'Read-only conversion with explicit source format. No files, provider calls or measured-budget lookup. Prompts, tool content and cwd are excluded; session identifiers remain. Whole request and complete response each have a 1,000,000-byte UTF-8 limit, including JSON escaping. Unknown properties and blank inputs are refused. Conversion success does not certify source completeness or subscription billing.',
      requestBody: { required: true, content: { 'application/json': { schema: ref('UsageImportRequest') } } },
      responses: { '200': response('UsageImportAnswer', 'Normalized JSONL and conversion diagnostics, including zero-record imports.'), '400': response('Error', 'Malformed request, unsupported format, or input/output exceeding its byte limit.') },
    } },
    '/capabilities': { get: { operationId: 'getCapabilities', summary: 'Discover native import formats and Trazum access channels', responses: { '200': response('HarnessCapabilities', 'Static metadata; no environment, filesystem, session or network discovery.') } } },
    '/health': { get: { operationId: 'getHealth', summary: 'Check the local process', responses: { '200': response('Health', 'Process is available.') } } },
    '/openapi.json': { get: { operationId: 'getOpenApi', summary: 'Read this OpenAPI document', responses: { '200': { description: 'OpenAPI 3.1 document.', content: { 'application/json': { schema: { type: 'object', required: ['openapi', 'info', 'paths', 'components'] } } } } } } },
    '/savings/plan': { post: {
      operationId: 'planSavings', summary: 'Rank savings actions from normalized usage',
      description: 'Read-only text inputs, priced using the server catalogue. No filesystem, provider or network calls. Unknown properties and empty text are refused. Whole-body limit: 1,000,000 UTF-8 bytes, including JSON escaping. Evidence gaps remain explicit; success does not certify realized savings or task quality.',
      requestBody: { required: true, content: { 'application/json': { schema: ref('SavingsPlanRequest') } } },
      responses: { '200': response('SavingsPlanAnswer', 'Savings analysis with evidence and limitations.'), '400': response('Error', 'Malformed, unreadable or oversized inputs.') },
    } },
    '/savings/verify': { post: {
      operationId: 'verifySavings', summary: 'Verify a saved plan against later normalized usage',
      description: 'Read-only text inputs, priced using the server catalogue. No filesystem, provider or network calls. Unknown properties and empty text are refused. Whole-body limit: 1,000,000 UTF-8 bytes, including JSON escaping. Evidence gaps remain explicit; success does not certify realized savings or task quality.',
      requestBody: { required: true, content: { 'application/json': { schema: ref('SavingsVerifyRequest') } } },
      responses: { '200': response('SavingsVerifyAnswer', 'Savings analysis with evidence and limitations.'), '400': response('Error', 'Malformed, unreadable or oversized inputs.') },
    } },
    '/cost': { post: {
      operationId: 'estimateCost', summary: 'Estimate a proposed call against measured budget and scoped policy',
      description: 'Body limit: 1,000,000 bytes; violations return 400. Missing or whitespace-only body is {}. Unknown properties are ignored. Content-Type is not enforced by the server; send application/json. All successful judgements, including over and cannot-tell, return 200. A judgement does not reserve or spend funds.',
      requestBody: { required: false, content: { 'application/json': { schema: ref('CostRequest') } } },
      responses: { '200': response('CostAnswer', 'A judgement, not permission to invoke a provider.'), '400': response('Error', 'Invalid JSON, invalid field types or values, or body over the byte limit.') },
    } },
  },
  components: { schemas },
  'x-unmatched-routes': { status: 404, schema: ref('Error'), description: 'All other path and method combinations, including OPTIONS, return 404. No CORS headers are emitted.' },
} as const;
