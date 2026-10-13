import { claudeCodeRecords } from './claude-code.js';
import { codexRecords } from './codex.js';
import { MAX_INPUT_CHARS } from './limits.js';
import { BUNDLED_CATALOGUE } from './pricing.js';
import { parseUsageLine, profileUsage } from './usage.js';
import { TASK_LIMITATIONS } from './task-types.js';
import type { TaskCategory, TaskFinding, TaskFormat, TaskInput, TaskReport } from './task-types.js';

export const taskObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function taskError(): never { throw new Error('Invalid task data. See the task workflow schema and limits.'); }

export function taskKeys(value: unknown, allowed: readonly string[]): asserts value is Record<string, unknown> {
  if (!taskObject(value) || Object.keys(value).some((key) => !allowed.includes(key))) taskError();
}

export const taskText = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.trim() !== '' && value.length <= max && !/[\u0000-\u001f\u007f]/u.test(value);
export const taskId = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u.test(value);

function validateInput(value: unknown): TaskInput {
  taskKeys(value, ['taskId', 'taskType', 'criterion', 'policyId', 'outcome', 'assessor', 'sources']);
  if (!taskId(value.taskId) || !taskId(value.taskType) || !taskText(value.criterion, 500) ||
      (value.policyId !== undefined && value.policyId !== 'baseline' && value.policyId !== 'repeat-review-v1') ||
      (value.outcome !== undefined && (typeof value.outcome !== 'string' || !['accepted', 'rejected', 'unknown'].includes(value.outcome))) ||
      (value.assessor !== undefined && !taskText(value.assessor, 100)) ||
      ((value.outcome === 'accepted' || value.outcome === 'rejected') && !taskText(value.assessor, 100)) ||
      !Array.isArray(value.sources) || value.sources.length < 1 || value.sources.length > 16) taskError();
  let size = 0;
  for (const source of value.sources) {
    taskKeys(source, ['format', 'text']);
    if ((source.format !== 'claude-code' && source.format !== 'codex') || typeof source.text !== 'string' || !source.text.trim()) taskError();
    size += source.text.length;
    if (size > MAX_INPUT_CHARS) taskError();
  }
  return value as unknown as TaskInput;
}

/** Only used to refuse possible reuse. A collision withholds a verdict. */
function fingerprint(text: string): string {
  let a = 0x811c9dc5;
  let b = 0x9e3779b9;
  for (let i = 0; i < text.length; i++) {
    a = Math.imul(a ^ text.charCodeAt(i), 0x01000193);
    b = Math.imul(b ^ text.charCodeAt(i), 0x85ebca6b);
  }
  return `${(a >>> 0).toString(16).padStart(8, '0')}${(b >>> 0).toString(16).padStart(8, '0')}`;
}

function canonical(value: unknown, depth = 0): string {
  if (depth > 40) taskError();
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonical(item, depth + 1)).join(',')}]`;
  if (taskObject(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key], depth + 1)}`).join(',')}}`;
  taskError();
}

function category(name: string): TaskCategory {
  if (['Read', 'read_file', 'read_text_file'].includes(name)) return 'read';
  if (['Grep', 'Glob', 'grep', 'search', 'search_files', 'list_files'].includes(name)) return 'search';
  if (['Bash', 'exec_command', 'shell_command', 'shell'].includes(name)) return 'shell';
  return 'other';
}

type Call = { key: string; name: string; namespace: string | null; category: TaskCategory; line: number; resultLine?: number; result?: string; failed?: boolean; conflict: boolean };
type ParsedSource = {
  sessions: Set<string>;
  missingSession: boolean;
  calls: Map<string, Call>;
  duplicates: number;
  unsupported: number;
};

function inspectTools(text: string, format: TaskFormat): ParsedSource {
  const state: ParsedSource = { sessions: new Set(), missingSession: false, calls: new Map(), duplicates: 0, unsupported: 0 };
  let codexSession: string | null = null;
  const requests = new Map<string, string>();
  const results = new Map<string, { result: string; failed: boolean; line: number; conflict: boolean; name?: string; namespace?: string }>();
  const sessionFor = (row: Record<string, unknown>): string | null => {
    const session = format === 'codex' ? codexSession : typeof row.sessionId === 'string' && row.sessionId.trim() ? row.sessionId : null;
    if (session !== null) state.sessions.add(session);
    return session;
  };
  const addCall = (session: string | null, id: unknown, name: unknown, args: unknown, line: number, namespace: string | null = null) => {
    if (session === null) { state.missingSession = true; state.unsupported++; return; }
    if (typeof id !== 'string' || !id || typeof name !== 'string' || !name) { state.unsupported++; return; }
    let signature: string;
    try { signature = canonical([session, namespace, name, args]); } catch { state.unsupported++; return; }
    const callKey = canonical([session, id]);
    const existing = state.calls.get(callKey);
    if (existing) {
      state.duplicates++;
      if (existing.key !== signature) { existing.conflict = true; state.unsupported++; }
    } else state.calls.set(callKey, { key: signature, name, namespace, category: category(name), line, conflict: false });
  };
  const addResult = (session: string | null, id: unknown, output: unknown, failed: boolean, line: number, name?: string, namespace?: string) => {
    if (session === null) { state.missingSession = true; state.unsupported++; return; }
    if (typeof id !== 'string' || !id || output === undefined) { state.unsupported++; return; }
    let serialized: string;
    try { serialized = canonical(output); } catch { state.unsupported++; return; }
    const key = canonical([session, id]);
    const existing = results.get(key);
    if (existing && (existing.result !== serialized || existing.failed !== failed || existing.name !== name || existing.namespace !== namespace)) {
      existing.conflict = true;
      state.unsupported++;
    } else if (!existing) results.set(key, { result: serialized, failed, line, conflict: false, name, namespace });
  };
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i]!.trim()) continue;
    let row: unknown;
    try { row = JSON.parse(lines[i]!); } catch { continue; }
    if (!taskObject(row)) continue;
    if (format === 'codex') {
      if (!taskObject(row.payload)) continue;
      const payload = row.payload;
      if (row.type === 'session_meta') {
        codexSession = typeof payload.id === 'string' && payload.id.trim() ? payload.id : null;
        if (codexSession !== null) state.sessions.add(codexSession);
        else state.missingSession = true;
      }
      if (row.type === 'event_msg' && payload.type === 'token_count' && codexSession === null) state.missingSession = true;
      if (row.type !== 'response_item') continue;
      if (payload.type === 'function_call') {
        if ((payload.namespace !== undefined && payload.namespace !== null && typeof payload.namespace !== 'string') ||
            (payload.encrypted_function_args !== undefined && payload.encrypted_function_args !== null)) { state.unsupported++; continue; }
        let args: unknown;
        try { if (typeof payload.arguments !== 'string') throw new Error(); args = JSON.parse(payload.arguments); }
        catch { state.unsupported++; continue; }
        addCall(codexSession, payload.call_id, payload.name, args, i + 1, typeof payload.namespace === 'string' ? payload.namespace : null);
      } else if (payload.type === 'function_call_output') {
        // Codex records textual output. Prose mentioning a failure is not an exit status.
        if (typeof payload.output !== 'string' ||
            (payload.namespace !== undefined && payload.namespace !== null && typeof payload.namespace !== 'string') ||
            (payload.name !== undefined && payload.name !== null && typeof payload.name !== 'string')) { state.unsupported++; continue; }
        addResult(codexSession, payload.call_id, payload.output, false, i + 1,
          typeof payload.name === 'string' ? payload.name : undefined,
          typeof payload.namespace === 'string' ? payload.namespace : undefined);
      } else if (typeof payload.type === 'string' && /_call(?:_output)?$/u.test(payload.type)) {
        state.unsupported++;
      }
    } else {
      const session = sessionFor(row);
      if (row.type !== 'assistant' && row.type !== 'user') continue;
      if (session === null) state.missingSession = true;
      if (row.type === 'assistant' && typeof row.requestId === 'string' && session !== null) {
        const previous = requests.get(row.requestId);
        if (previous !== undefined && previous !== session) throw new Error('Ambiguous Claude request identifiers across sessions. Supply separate session sources.');
        requests.set(row.requestId, session);
      }
      if (!taskObject(row.message) || !Array.isArray(row.message.content)) continue;
      for (const block of row.message.content) {
        if (!taskObject(block)) continue;
        if (row.type === 'assistant' && block.type === 'tool_use') addCall(session, block.id, block.name, block.input, i + 1);
        if (row.type === 'user' && block.type === 'tool_result') {
          if (block.is_error !== undefined && typeof block.is_error !== 'boolean') { state.unsupported++; continue; }
          addResult(session, block.tool_use_id, block.content, block.is_error === true, i + 1);
        }
      }
    }
  }
  for (const [key, call] of state.calls) {
    const result = results.get(key);
    if (result && ((result.name !== undefined && result.name !== call.name) || (result.namespace !== undefined && result.namespace !== call.namespace))) {
      state.unsupported++;
      continue;
    }
    if (result && result.line > call.line && !result.conflict && !call.conflict) {
      call.result = result.result;
      call.resultLine = result.line;
      call.failed = result.failed;
    }
  }
  for (const key of results.keys()) if (!state.calls.has(key)) state.unsupported++;
  return state;
}

/** Analyze caller-supplied native transcripts in memory. No content is executed. */
export function analyzeTask(input: unknown): TaskReport {
  const value = validateInput(input);
  const report: TaskReport = {
    version: 1, kind: 'trazum-task',
    task: { id: value.taskId, type: value.taskType, criterion: value.criterion, policyId: value.policyId ?? 'baseline', outcome: value.outcome ?? 'unknown', assessor: value.assessor ?? null },
    usage: {
      records: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 0, apiEquivalentUsd: null, unpricedRecords: 0,
      pricing: { source: 'bundled', lastReviewed: BUNDLED_CATALOGUE.lastReviewed, basis: 'api-equivalent' },
    },
    sources: [], coverage: { harnesses: [], models: [], gaps: [] },
    tools: { calls: 0, duplicateCalls: 0, missingResults: 0, unsupported: 0, findings: [] },
    limitations: [...TASK_LIMITATIONS],
  };
  const seenSessions = new Set<string>();
  const seenSources = new Set<string>();
  const missingByFormat = new Set<TaskFormat>();
  const presentByFormat = new Set<TaskFormat>();
  const models = new Set<string>();
  const gaps = new Set<string>();
  const usageLines: string[] = [];
  for (let i = 0; i < value.sources.length; i++) {
    const { format, text } = value.sources[i]!;
    const inspected = inspectTools(text, format);
    const sourceKey = fingerprint(`${format}:${text}`);
    if (seenSources.has(sourceKey)) throw new Error('Duplicate task sources are not supported. Supply each session once.');
    seenSources.add(sourceKey);
    if (inspected.sessions.size === 0) inspected.missingSession = true;
    if ((inspected.missingSession && presentByFormat.has(format)) || missingByFormat.has(format)) {
      throw new Error('Multiple sources from the same harness require explicit, disjoint sessions.');
    }
    presentByFormat.add(format);
    if (inspected.missingSession) { missingByFormat.add(format); gaps.add('missing-session'); }
    const sessionKeys = [...inspected.sessions].map((session) => fingerprint(`${format}:${session}`)).sort();
    for (const key of sessionKeys) {
      if (seenSessions.has(key)) throw new Error('Overlapping task sessions are not supported. Supply each session once.');
      seenSessions.add(key);
    }
    const conversion = format === 'claude-code' ? claudeCodeRecords(text) : codexRecords(text);
    const { records, ...diagnostics } = conversion;
    report.sources.push({ index: i + 1, format, fingerprint: sourceKey, sessionKeys, sessionCount: sessionKeys.length, diagnostics, completeness: 'not-established' });
    if (conversion.unparseable) gaps.add('malformed-lines');
    if ('unsupported' in conversion && (conversion.unsupported || conversion.missingModel)) gaps.add('incomplete-usage');
    if ('assistantWithoutUsage' in conversion) {
      if (conversion.assistantWithoutUsage) gaps.add('incomplete-usage');
      if (conversion.disagreements) gaps.add('usage-disagreement');
      if (conversion.noRequestId) gaps.add('missing-request-id');
    }
    if (!records.length) gaps.add('missing-usage');
    for (const record of records) {
      const line = JSON.stringify(record);
      const parsed = parseUsageLine(line);
      if (!parsed || ![parsed.inputTokens, parsed.outputTokens, parsed.cacheReadTokens, parsed.cacheWrite5mTokens, parsed.cacheWrite1hTokens].every((amount) => Number.isSafeInteger(amount) && amount >= 0)) {
        gaps.add('incomplete-usage'); continue;
      }
      const model = BUNDLED_CATALOGUE.byId.get(parsed.model);
      if (model) models.add(model.id);
      else { gaps.add('unrecognized-model'); gaps.add('unpriced-model'); }
      if (parsed.ts === null) gaps.add('missing-timestamp');
      usageLines.push(line);
    }
    report.tools.calls += inspected.calls.size;
    report.tools.duplicateCalls += inspected.duplicates;
    report.tools.unsupported += inspected.unsupported;
    const groups = new Map<string, Call[]>();
    for (const call of inspected.calls.values()) {
      if (call.result === undefined) { report.tools.missingResults++; continue; }
      const key = canonical([call.key, call.result, call.failed]);
      const group = groups.get(key) ?? [];
      group.push(call); groups.set(key, group);
    }
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      const first = group[0]!;
      // Arbitrary tool names are never copied or assigned an optimization policy.
      if (first.category === 'other') continue;
      if (report.tools.findings.length >= 100) { gaps.add('findings-truncated'); continue; }
      const finding: TaskFinding = {
        kind: first.failed ? 'repeated-failure' : 'repeated-result', category: first.category,
        count: group.length,
        occurrences: group.slice(0, 20).map((call) => ({ source: i + 1, line: call.line, resultLine: call.resultLine! })),
      };
      if (group.length > 20) gaps.add('findings-truncated');
      report.tools.findings.push(finding);
    }
  }
  const profile = profileUsage(usageLines.join('\n'), { catalogue: BUNDLED_CATALOGUE });
  for (const name of ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens'] as const) {
    report.usage[name] = profile.total[name] + profile.unpriced[name];
    if (!Number.isSafeInteger(report.usage[name])) throw new Error('Task usage exceeds safe numeric limits.');
  }
  report.usage.totalTokens = report.usage.inputTokens + report.usage.outputTokens + report.usage.cacheReadTokens + report.usage.cacheWriteTokens;
  if (!Number.isSafeInteger(report.usage.totalTokens)) throw new Error('Task usage exceeds safe numeric limits.');
  report.usage.records = profile.total.calls + profile.unpriced.calls;
  if (report.usage.records === 0) gaps.add('missing-usage');
  report.usage.unpricedRecords = profile.unpriced.calls;
  if (profile.total.assumedWriteTtlCalls) gaps.add('assumed-cache-ttl');
  if (profile.skippedLines.length) gaps.add('incomplete-usage');
  if (report.tools.missingResults || report.tools.unsupported) gaps.add('incomplete-tools');
  if (report.usage.records && !report.usage.unpricedRecords && !gaps.has('assumed-cache-ttl')) report.usage.apiEquivalentUsd = profile.total.totalUsd;
  report.coverage = { harnesses: [...presentByFormat].sort(), models: [...models].sort(), gaps: [...gaps].sort() };
  return report;
}
