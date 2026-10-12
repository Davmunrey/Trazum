/**
 * Codex rollout JSONL, from explicit caller-supplied text. No prompt, path,
 * instruction, tool output or credential is copied. See docs/codex.md for the
 * pinned upstream protocol and the conservative snapshot reconciliation rules.
 */
export interface CodexRecord {
  model: string;
  ts?: string;
  session?: string;
  label?: string;
  usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens: number };
}

export interface CodexConversion {
  records: CodexRecord[];
  duplicates: number;
  unparseable: number;
  missingModel: number;
  /** Incomplete, synthetic, reset or uncorroborated usage snapshots; never zero-cost calls. */
  unsupported: number;
  otherLines: number;
}

const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const FIELDS = ['input_tokens', 'cached_input_tokens', 'output_tokens', 'reasoning_output_tokens', 'total_tokens', 'cache_write_input_tokens'] as const;
type Counts = Record<typeof FIELDS[number], number>;

function counts(value: unknown): Counts | null {
  if (!object(value)) return null;
  const result = {} as Counts;
  for (const field of FIELDS) {
    // Upstream marks only cache_write_input_tokens with serde(default).
    const amount = field === 'cache_write_input_tokens' && value[field] === undefined ? 0 : value[field];
    if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount < 0) return null;
    result[field] = amount;
  }
  if (result.cached_input_tokens > result.input_tokens ||
      result.reasoning_output_tokens > result.output_tokens ||
      result.total_tokens !== result.input_tokens + result.output_tokens) return null;
  return result;
}

/** A signature, not a filename or a guess based on prose inside the session. */
export function looksLikeCodexTranscript(text: string): boolean {
  for (const line of text.split('\n').slice(0, 100)) {
    if (line.trim() === '') continue;
    try {
      const row: unknown = JSON.parse(line);
      if (!object(row) || !object(row.payload)) continue;
      if (row.type === 'session_meta' && typeof row.payload.id === 'string') return true;
      if (row.type === 'turn_context' && typeof row.payload.model === 'string') return true;
      if (row.type === 'event_msg' && row.payload.type === 'token_count') return true;
    } catch { /* Malformed lines are reported by conversion, never executed. */ }
  }
  return false;
}

/**
 * Emit one usage record only when a cumulative increment corroborates the
 * last response's counters. Rate-limit refreshes repeat totals and contribute
 * nothing. A restored first snapshot cannot establish historical model/call
 * attribution, so it establishes a baseline and is explicitly left out.
 */
export function codexRecords(text: string, options: { label?: string } = {}): CodexConversion {
  const result: CodexConversion = { records: [], duplicates: 0, unparseable: 0, missingModel: 0, unsupported: 0, otherLines: 0 };
  type SessionState = { previous: Counts | null; highWater: Counts | null; seenUsage: boolean };
  const states = new Map<string | null, SessionState>();
  let state: SessionState = { previous: null, highWater: null, seenUsage: false };
  states.set(null, state);
  let model: string | null = null;
  let session: string | null = null;
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    let row: unknown;
    try { row = JSON.parse(line); } catch { result.unparseable++; continue; }
    if (!object(row) || !object(row.payload)) { result.otherLines++; continue; }
    const payload = row.payload;
    if (row.type === 'session_meta') {
      const next = typeof payload.id === 'string' && payload.id !== '' ? payload.id : null;
      if (next === null) { model = null; result.unsupported++; continue; }
      if (next !== session) {
        model = null;
        state = states.get(next) ?? { previous: null, highWater: null, seenUsage: false };
        states.set(next, state);
      }
      session = next;
      continue;
    }
    if (row.type === 'turn_context') {
      model = typeof payload.model === 'string' && payload.model.trim() !== '' ? payload.model : null;
      continue;
    }
    if (row.type !== 'event_msg' || payload.type !== 'token_count') { result.otherLines++; continue; }
    // Rate-limit-only notifications can have no token usage at all.
    if (payload.info === null) { result.otherLines++; continue; }
    if (!object(payload.info)) { result.unsupported++; state.previous = null; state.seenUsage = true; continue; }
    const total = counts(payload.info.total_token_usage);
    const last = counts(payload.info.last_token_usage);
    const first = !state.seenUsage;
    state.seenUsage = true;
    if (total === null) { result.unsupported++; state.previous = null; continue; }
    // A reset or replay cannot lower the baseline and bill the same totals again.
    if (state.highWater !== null && FIELDS.every((field) => total[field] === state.highWater![field])) {
      result.duplicates++;
      continue;
    }
    if (state.highWater !== null && FIELDS.some((field) => total[field] < state.highWater![field])) {
      result.unsupported++;
      continue;
    }
    state.highWater = total;
    const corroborated = last !== null && FIELDS.every((field) =>
      total[field] - (state.previous?.[field] ?? 0) === last[field]);
    const canAttribute = state.previous !== null || first;
    state.previous = total;
    if (!canAttribute || !corroborated || last === null || last.total_tokens === 0 || last.cache_write_input_tokens > 0) {
      result.unsupported++;
      continue;
    }
    if (model === null) { result.missingModel++; continue; }
    result.records.push({
      model,
      ...(typeof row.timestamp === 'string' && Number.isFinite(Date.parse(row.timestamp)) ? { ts: row.timestamp } : {}),
      ...(session === null ? {} : { session }),
      ...(options.label === undefined ? {} : { label: options.label }),
      usage: {
        // Both cached input and reasoning output are subsets, not extra tokens.
        input_tokens: last.input_tokens - last.cached_input_tokens,
        output_tokens: last.output_tokens,
        cache_read_input_tokens: last.cached_input_tokens,
      },
    });
  }
  return result;
}
