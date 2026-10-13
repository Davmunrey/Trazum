const object = (properties: Record<string, unknown>) => ({
  type: 'object', properties, required: Object.keys(properties), additionalProperties: false,
});
const count = { type: 'integer', minimum: 0 };
const counters = (names: string[]) => Object.fromEntries(names.map((name) => [name, count]));
const common = {
  schemaVersion: { const: 1 }, log: { type: 'string' }, records: count,
  evidence: object({ billingMode: { const: 'unknown' }, valuation: { const: 'api-equivalent' }, completeness: { const: 'not-established' } }),
  limitations: { type: 'array', items: { type: 'string' } },
};

export const IMPORT_SCHEMAS = {
  UsageImportRequest: {
    type: 'object', required: ['format', 'text'], additionalProperties: false,
    properties: {
      format: { type: 'string', enum: ['claude-code', 'codex'] },
      text: { type: 'string', minLength: 1, description: 'Non-blank transcript JSONL contents, never a path. No automatic format detection or shared deduplication state.' },
      label: { type: 'string', minLength: 1, maxLength: 200, description: 'Optional explicit, non-blank workload label; limited to 200 UTF-16 code units. Never inferred from source metadata.' },
    },
  },
  UsageImportAnswer: {
    description: 'Complete JSON response is limited to 1,000,000 UTF-8 bytes. Empty output does not establish zero usage. Preserve diagnostics alongside downstream reports.',
    oneOf: [
      object({ ...common, format: { const: 'codex' }, diagnostics: object(counters(['duplicates', 'unparseable', 'missingModel', 'unsupported', 'otherLines'])) }),
      object({ ...common, format: { const: 'claude-code' }, diagnostics: object({
        ...counters(['collapsed', 'noRequestId', 'otherLines', 'unparseable', 'assistantWithoutUsage', 'streamed', 'disagreements', 'synthetic']),
        resume: object({ line: count, records: count }),
      }) }),
    ],
  },
};
