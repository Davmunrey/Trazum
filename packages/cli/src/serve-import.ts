import { claudeCodeRecords, codexRecords } from '@trazum/core';

/** Bound the complete serialized answer, including JSON escaping and repeated labels. */
export const MAX_IMPORT_RESPONSE_BYTES = 1_000_000;

interface ImportPayload {
  format: 'claude-code' | 'codex';
  text: string;
  label?: string;
}

export function validateImportPayload(value: unknown): asserts value is ImportPayload {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('The body must be a JSON object.');
  }
  const payload = value as Record<string, unknown>;
  if (Object.keys(payload).some((key) => !['format', 'text', 'label'].includes(key))) {
    throw new Error('Unknown properties are not accepted for usage imports.');
  }
  if (payload.format !== 'claude-code' && payload.format !== 'codex') {
    throw new Error('format must be claude-code or codex.');
  }
  if (typeof payload.text !== 'string' || payload.text.trim() === '') {
    throw new Error('text must be non-empty transcript contents, not a file path.');
  }
  if (payload.label !== undefined && (typeof payload.label !== 'string' ||
      payload.label.trim() === '' || payload.label.length > 200)) {
    throw new Error('label must be non-empty text of at most 200 characters.');
  }
}

/** Explicit text only: no filesystem, measurement lookup or provider access. */
export function importUsage(payload: ImportPayload) {
  const options = payload.label === undefined ? {} : { label: payload.label };
  const conversion = payload.format === 'codex'
    ? codexRecords(payload.text, options) : claudeCodeRecords(payload.text, options);
  const { records, ...diagnostics } = conversion;
  const result = {
    schemaVersion: 1 as const,
    format: payload.format,
    log: records.map((record) => JSON.stringify(record)).join('\n'),
    records: records.length,
    diagnostics,
    evidence: { billingMode: 'unknown', valuation: 'api-equivalent', completeness: 'not-established' },
    limitations: [
      'Conversion diagnostics describe the supplied text only; missing source events and missing files cannot be detected.',
      'Usage priced downstream is API-equivalent, not a subscription invoice or proof of realized savings.',
      'No deduplication state is shared between calls. Do not concatenate overlapping imports.',
      'Session identifiers are retained. Prompt, tool, cwd and path content is not copied; labels are caller supplied.',
      'Empty output means no convertible records, not zero usage or zero cost. Preserve these diagnostics alongside downstream reports.',
    ],
  };
  if (Buffer.byteLength(JSON.stringify(result), 'utf8') > MAX_IMPORT_RESPONSE_BYTES) {
    throw new Error(`Normalized import response exceeds ${MAX_IMPORT_RESPONSE_BYTES} UTF-8 bytes; use a smaller complete source or a shorter label.`);
  }
  return result;
}
