export type TaskFormat = 'claude-code' | 'codex';
export type TaskOutcome = 'accepted' | 'rejected' | 'unknown';
export type TaskPolicyId = 'baseline' | 'repeat-review-v1';
export type TaskCategory = 'read' | 'search' | 'shell' | 'other';

export interface TaskInput {
  taskId: string;
  taskType: string;
  criterion: string;
  policyId?: TaskPolicyId;
  outcome?: TaskOutcome;
  assessor?: string;
  sources: Array<{ format: TaskFormat; text: string }>;
}

export interface TaskFinding {
  kind: 'repeated-result' | 'repeated-failure';
  category: TaskCategory;
  count: number;
  occurrences: Array<{ source: number; line: number; resultLine: number }>;
}

export interface TaskReport {
  version: 1;
  kind: 'trazum-task';
  task: {
    id: string;
    type: string;
    criterion: string;
    policyId: TaskPolicyId;
    outcome: TaskOutcome;
    assessor: string | null;
  };
  usage: {
    records: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    totalTokens: number;
    apiEquivalentUsd: number | null;
    unpricedRecords: number;
    pricing: { source: 'bundled'; lastReviewed: string; basis: 'api-equivalent' };
  };
  sources: Array<{
    index: number;
    format: TaskFormat;
    /** Non-cryptographic reuse checks. These do not authenticate reports. */
    fingerprint: string;
    sessionKeys: string[];
    sessionCount: number;
    diagnostics: Record<string, number | { line: number; records: number }>;
    completeness: 'not-established';
  }>;
  coverage: { harnesses: TaskFormat[]; models: string[]; gaps: string[] };
  tools: {
    calls: number;
    duplicateCalls: number;
    missingResults: number;
    unsupported: number;
    findings: TaskFinding[];
  };
  limitations: string[];
}

export interface TaskComparison {
  version: 1;
  kind: 'trazum-task-comparison';
  verdict: 'lower-usage' | 'higher-usage' | 'similar-usage' | 'quality-regressed' | 'inconclusive';
  reasons: string[];
  tokenChange: { before: number; after: number; delta: number; percent: number | null } | null;
  limitations: string[];
}

export const TASK_LIMITATIONS = [
  'Source completeness is not established. Only supplied records are measured.',
  'API-equivalent valuation is not an invoice, subscription charge or quota measurement.',
  'Identical tool calls and recorded results can be deliberate verification; repetition does not prove waste or unchanged external state.',
  'Outcomes, criteria and policy application are caller declarations, not independently verified quality or execution evidence.',
  'A paired observation is not a causal experiment. No monetary savings are inferred.',
  'Reuse fingerprints do not authenticate reports or guarantee anonymization.',
] as const;

export const TASK_GAPS = [
  'missing-session', 'missing-usage', 'malformed-lines', 'incomplete-usage',
  'usage-disagreement', 'missing-request-id', 'unpriced-model', 'unrecognized-model',
  'missing-timestamp', 'assumed-cache-ttl', 'incomplete-tools', 'findings-truncated',
] as const;
