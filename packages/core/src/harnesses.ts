/**
 * Static integration discovery, safe to import in a browser.
 *
 * A harness identifies where work runs, not who billed for it. An importer
 * describes a supported local format; it does not discover installed tools,
 * inspect sessions, or intercept their model calls.
 */
export interface HarnessCapability {
  readonly id: string;
  readonly name: string;
  readonly nativeImport: {
    readonly command: 'from-claude-code' | 'from-codex';
    readonly format: 'claude-code-transcript-jsonl' | 'codex-session-jsonl';
  } | null;
  readonly normalizedUsage: { readonly command: 'bill'; readonly format: 'trazum-usage-jsonl' };
  readonly billingMode: 'unknown';
  readonly automaticInterception: false;
}

export interface HarnessCapabilities {
  readonly schemaVersion: 1;
  /** Trazum entry points, not automatically installed integrations for each harness. */
  readonly accessChannels: readonly ('cli' | 'mcp' | 'http')[];
  readonly taskQuality: 'not-measured';
  readonly harnesses: readonly HarnessCapability[];
}

const normalizedUsage = Object.freeze({ command: 'bill', format: 'trazum-usage-jsonl' } as const);
const harness = (
  id: string,
  name: string,
  nativeImport: HarnessCapability['nativeImport'],
): HarnessCapability => Object.freeze({
  id, name, nativeImport: nativeImport === null ? null : Object.freeze(nativeImport),
  normalizedUsage, billingMode: 'unknown', automaticInterception: false,
});

export const HARNESS_CAPABILITIES: HarnessCapabilities = Object.freeze({
  schemaVersion: 1,
  accessChannels: Object.freeze(['cli', 'mcp', 'http'] as const),
  taskQuality: 'not-measured',
  harnesses: Object.freeze([
    harness('claude-code', 'Claude Code', { command: 'from-claude-code', format: 'claude-code-transcript-jsonl' }),
    harness('codex', 'Codex', { command: 'from-codex', format: 'codex-session-jsonl' }),
    harness('cursor', 'Cursor', null),
    harness('mcp-client', 'Generic MCP client', null),
  ]),
});

/** Exact stable IDs only; unknown clients never inherit another harness's importer. */
export function getHarnessCapability(id: string): HarnessCapability | null {
  return HARNESS_CAPABILITIES.harnesses.find((entry) => entry.id === id) ?? null;
}
