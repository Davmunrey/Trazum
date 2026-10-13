import { analyzeTask, taskError, taskId, taskKeys, taskText } from './task-analysis.js';
import { MAX_INPUT_CHARS } from './limits.js';
import { BUNDLED_CATALOGUE } from './pricing.js';
import { TASK_GAPS, TASK_LIMITATIONS } from './task-types.js';
import type { TaskComparison, TaskReport } from './task-types.js';

export { analyzeTask };
export type { TaskCategory, TaskComparison, TaskFinding, TaskFormat, TaskInput, TaskOutcome, TaskPolicyId, TaskReport } from './task-types.js';

export interface TaskPolicy { id: 'repeat-review-v1'; instructions: string }

export const TASK_POLICY_INSTRUCTIONS = [
  'Before repeating a read or search with identical arguments, check whether the earlier result is still available and relevant.',
  'Reuse an earlier result only when you can establish that the underlying state has not changed. Otherwise read or search again.',
  'Before retrying an identical failed shell command, inspect the recorded failure and change the cause or explain why retrying is justified.',
  'Keep deliberate verification, fresh-state checks, required tests and safety checks. Never suppress failures or claim an outcome without evidence.',
  'This policy does not authorize running commands, changing permissions or omitting required work.',
].join('\n');

const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const checksum = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{16}$/u.test(value);
function exact(value: unknown, fields: readonly string[]): asserts value is Record<string, unknown> {
  taskKeys(value, fields);
  if (Object.keys(value).length !== fields.length) taskError();
}
function stringList(value: unknown, max: number): value is string[] {
  return Array.isArray(value) && value.length <= max && value.every((item) => typeof item === 'string') && new Set(value).size === value.length;
}

/** Validate every persisted field; reports remain caller-supplied observations, not signed evidence. */
function validateReport(value: unknown): TaskReport {
  exact(value, ['version', 'kind', 'task', 'usage', 'sources', 'coverage', 'tools', 'limitations']);
  if (value.version !== 1 || value.kind !== 'trazum-task') taskError();
  const task = value.task;
  exact(task, ['id', 'type', 'criterion', 'policyId', 'outcome', 'assessor']);
  if (!taskId(task.id) || !taskId(task.type) || !taskText(task.criterion, 500) ||
      typeof task.policyId !== 'string' || !['baseline', 'repeat-review-v1'].includes(task.policyId) ||
      typeof task.outcome !== 'string' || !['accepted', 'rejected', 'unknown'].includes(task.outcome) ||
      (task.assessor !== null && !taskText(task.assessor, 100)) ||
      (task.outcome !== 'unknown' && task.assessor === null)) taskError();
  const usage = value.usage;
  exact(usage, ['records', 'inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'totalTokens', 'apiEquivalentUsd', 'unpricedRecords', 'pricing']);
  exact(usage.pricing, ['source', 'lastReviewed', 'basis']);
  if (usage.pricing.source !== 'bundled' || usage.pricing.basis !== 'api-equivalent' ||
      typeof usage.pricing.lastReviewed !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(usage.pricing.lastReviewed) ||
      !Number.isFinite(Date.parse(usage.pricing.lastReviewed)) ||
      new Date(usage.pricing.lastReviewed).toISOString().slice(0, 10) !== usage.pricing.lastReviewed) taskError();
  for (const key of ['records', 'inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'totalTokens', 'unpricedRecords']) if (!count(usage[key])) taskError();
  if (usage.totalTokens !== (usage.inputTokens as number) + (usage.outputTokens as number) + (usage.cacheReadTokens as number) + (usage.cacheWriteTokens as number) ||
      (usage.unpricedRecords as number) > (usage.records as number) ||
      (usage.apiEquivalentUsd !== null && (typeof usage.apiEquivalentUsd !== 'number' || !Number.isFinite(usage.apiEquivalentUsd) || usage.apiEquivalentUsd < 0)) ||
      ((usage.records === 0 || usage.unpricedRecords !== 0) && usage.apiEquivalentUsd !== null) ||
      (usage.records === 0 && usage.totalTokens !== 0)) taskError();
  if (!Array.isArray(value.sources) || value.sources.length < 1 || value.sources.length > 16) taskError();
  const fingerprints = new Set<string>();
  const sessions = new Set<string>();
  const formats = new Set<string>();
  const requiredGaps = new Set<string>();
  let sourceIndex = 0;
  for (const source of value.sources) {
    exact(source, ['index', 'format', 'fingerprint', 'sessionKeys', 'sessionCount', 'diagnostics', 'completeness']);
    if (source.index !== ++sourceIndex || typeof source.format !== 'string' || !['claude-code', 'codex'].includes(source.format) || !checksum(source.fingerprint) ||
        !count(source.sessionCount) || !stringList(source.sessionKeys, 10_000) || !source.sessionKeys.every(checksum) || source.sessionKeys.length !== source.sessionCount ||
        source.completeness !== 'not-established' || fingerprints.has(source.fingerprint)) taskError();
    fingerprints.add(source.fingerprint);
    formats.add(source.format as string);
    for (const key of source.sessionKeys) { if (sessions.has(key)) taskError(); sessions.add(key); }
    if (source.sessionCount === 0) requiredGaps.add('missing-session');
    const diagnostics = source.diagnostics;
    const names = source.format === 'claude-code'
      ? ['collapsed', 'noRequestId', 'otherLines', 'unparseable', 'assistantWithoutUsage', 'streamed', 'disagreements', 'synthetic', 'resume']
      : ['duplicates', 'unparseable', 'missingModel', 'unsupported', 'otherLines'];
    exact(diagnostics, names);
    for (const key of names) {
      if (key === 'resume') {
        exact(diagnostics.resume, ['line', 'records']);
        if (!count(diagnostics.resume.line) || !count(diagnostics.resume.records)) taskError();
      } else if (!count(diagnostics[key])) taskError();
    }
    if (diagnostics.unparseable) requiredGaps.add('malformed-lines');
    if (diagnostics.assistantWithoutUsage || diagnostics.unsupported || diagnostics.missingModel) requiredGaps.add('incomplete-usage');
    if (diagnostics.disagreements) requiredGaps.add('usage-disagreement');
    if (diagnostics.noRequestId) requiredGaps.add('missing-request-id');
  }
  const coverage = value.coverage;
  exact(coverage, ['harnesses', 'models', 'gaps']);
  if (!stringList(coverage.harnesses, 2) || !stringList(coverage.models, BUNDLED_CATALOGUE.models.length) ||
      !coverage.models.every((id) => BUNDLED_CATALOGUE.models.some((model) => model.id === id)) ||
      !stringList(coverage.gaps, TASK_GAPS.length) || !coverage.gaps.every((gap) => (TASK_GAPS as readonly string[]).includes(gap)) ||
      coverage.harnesses.slice().sort().join(',') !== [...formats].sort().join(',')) taskError();
  if (usage.records === 0) requiredGaps.add('missing-usage');
  if (usage.unpricedRecords !== 0) { requiredGaps.add('unpriced-model'); requiredGaps.add('unrecognized-model'); }
  if ((usage.records as number) > (usage.unpricedRecords as number) && coverage.models.length === 0) taskError();
  const tools = value.tools;
  exact(tools, ['calls', 'duplicateCalls', 'missingResults', 'unsupported', 'findings']);
  for (const key of ['calls', 'duplicateCalls', 'missingResults', 'unsupported']) if (!count(tools[key])) taskError();
  if ((tools.missingResults as number) > (tools.calls as number) || !Array.isArray(tools.findings) || tools.findings.length > 100) taskError();
  if (tools.missingResults || tools.unsupported) requiredGaps.add('incomplete-tools');
  let findingsCalls = 0;
  for (const finding of tools.findings) {
    exact(finding, ['kind', 'category', 'count', 'occurrences']);
    if (typeof finding.kind !== 'string' || !['repeated-result', 'repeated-failure'].includes(finding.kind) ||
        typeof finding.category !== 'string' || !['read', 'search', 'shell'].includes(finding.category) ||
        !count(finding.count) || finding.count < 2 || !Array.isArray(finding.occurrences) || finding.occurrences.length < 2 ||
        finding.occurrences.length !== Math.min(finding.count, 20)) taskError();
    findingsCalls += finding.count;
    if (finding.count > 20) requiredGaps.add('findings-truncated');
    let previousLine = 0;
    let sourceIndexForFinding: number | null = null;
    for (const occurrence of finding.occurrences) {
      exact(occurrence, ['source', 'line', 'resultLine']);
      if (!count(occurrence.source) || occurrence.source < 1 || occurrence.source > value.sources.length ||
          !count(occurrence.line) || occurrence.line < 1 || occurrence.line < previousLine || !count(occurrence.resultLine) || occurrence.resultLine <= occurrence.line) taskError();
      if (sourceIndexForFinding !== null && sourceIndexForFinding !== occurrence.source) taskError();
      sourceIndexForFinding = occurrence.source;
      previousLine = occurrence.line;
    }
  }
  if (findingsCalls > (tools.calls as number) - (tools.missingResults as number)) taskError();
  const gaps = coverage.gaps as string[];
  if ([...requiredGaps].some((gap) => !gaps.includes(gap))) taskError();
  if (!Array.isArray(value.limitations) || JSON.stringify(value.limitations) !== JSON.stringify(TASK_LIMITATIONS)) taskError();
  return value as unknown as TaskReport;
}

export function parseTaskReport(text: string): TaskReport {
  if (typeof text !== 'string' || text.length > MAX_INPUT_CHARS) taskError();
  let value: unknown;
  try { value = JSON.parse(text); } catch { taskError(); }
  return validateReport(value);
}

function validated(value: TaskReport): TaskReport {
  let text: string;
  try { text = JSON.stringify(value); } catch { taskError(); }
  return parseTaskReport(text);
}

export function taskPolicy(report: TaskReport): TaskPolicy {
  const checked = validated(report);
  if (!checked.tools.findings.some((finding) => finding.category === 'read' || finding.category === 'search' || finding.kind === 'repeated-failure')) {
    throw new Error('No actionable repeated read, search or explicit failure evidence was found.');
  }
  return { id: 'repeat-review-v1', instructions: TASK_POLICY_INSTRUCTIONS };
}

/** Compare declared matched tasks; never infer causality, quality or monetary savings. */
export function compareTasks(before: TaskReport, after: TaskReport): TaskComparison {
  const a = validated(before);
  const b = validated(after);
  const result: TaskComparison = { version: 1, kind: 'trazum-task-comparison', verdict: 'inconclusive', reasons: [], tokenChange: null, limitations: [...TASK_LIMITATIONS] };
  if (a.task.type !== b.task.type) result.reasons.push('task-type-mismatch');
  if (a.task.criterion !== b.task.criterion) result.reasons.push('criterion-mismatch');
  if (a.task.policyId !== 'baseline' || b.task.policyId !== 'repeat-review-v1') result.reasons.push('policy-pair-mismatch');
  if (a.coverage.harnesses.slice().sort().join(',') !== b.coverage.harnesses.slice().sort().join(',')) result.reasons.push('harness-coverage-mismatch');
  if (a.coverage.models.slice().sort().join(',') !== b.coverage.models.slice().sort().join(',')) result.reasons.push('model-coverage-mismatch');
  const fingerprints = new Set(a.sources.map((source) => source.fingerprint));
  const sessions = new Set(a.sources.flatMap((source) => source.sessionKeys));
  if (b.sources.some((source) => fingerprints.has(source.fingerprint) || source.sessionKeys.some((key) => sessions.has(key)))) result.reasons.push('source-reuse');
  if (a.coverage.gaps.length || b.coverage.gaps.length) result.reasons.push('incomplete-evidence');
  if (result.reasons.length) return result;
  if (a.task.outcome === 'accepted' && b.task.outcome === 'rejected') {
    result.verdict = 'quality-regressed'; result.reasons.push('declared-acceptance-regressed'); return result;
  }
  if (a.task.outcome !== 'accepted' || b.task.outcome !== 'accepted') { result.reasons.push('accepted-outcomes-required'); return result; }
  if (a.usage.records === 0 || b.usage.records === 0 || a.usage.totalTokens === 0) { result.reasons.push('nonzero-baseline-required'); return result; }
  const delta = b.usage.totalTokens - a.usage.totalTokens;
  result.tokenChange = { before: a.usage.totalTokens, after: b.usage.totalTokens, delta, percent: delta / a.usage.totalTokens * 100 };
  result.verdict = delta < 0 ? 'lower-usage' : delta > 0 ? 'higher-usage' : 'similar-usage';
  result.reasons.push('paired-observation-not-causal');
  return result;
}
