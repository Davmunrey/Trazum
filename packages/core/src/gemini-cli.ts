/**
 * Gemini CLI session files, from explicit caller-supplied text.
 *
 * Read against the recorder's own source rather than a sample: google-gemini/
 * gemini-cli, `packages/core/src/services/chatRecordingService.ts` and
 * `chatRecordingTypes.ts` (Apache-2.0). Sessions live under
 * `~/.gemini/tmp/<project>/chats/` as `session-*.jsonl`, one JSON record per
 * line; older versions wrote one `session-*.json` document per chat, which the
 * CLI converts on resume and which is read here too. No prompt, reply,
 * thought, tool argument, tool result or path is copied: only the model, the
 * moment, the session and the token counts.
 *
 * How the recorder writes, and what follows for a bill:
 *
 * - **A message is appended whole every time it changes.** Tokens arrive after
 *   the reply, so the same message id appears twice or more, and the last one
 *   stands. Counting every line would bill one reply several times.
 * - **Tokens attach once per reply.** `recordMessageTokens` sets them only on a
 *   `gemini` message that has none, so one id carries one response's usage.
 * - **History edits do not undo spend.** `$rewindTo`, `$patch.removeIds` and a
 *   rewritten file change what the conversation shows, not what was called; a
 *   reply that was billed stays billed.
 * - **`$set.messages`** is a deprecated full-history checkpoint: its messages
 *   are read through the same id rule, so a checkpoint never counts twice.
 */
export interface GeminiCliRecord {
  model: string;
  ts?: string;
  session?: string;
  label?: string;
  usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens: number };
}

export interface GeminiCliConversion {
  records: GeminiCliRecord[];
  /** Lines that repeat a message already read: the recorder's own rewrites, not calls. */
  repeats: number;
  unparseable: number;
  /** Replies whose token counts were present and impossible: refused, never zeroed. */
  unsupported: number;
  missingModel: number;
  /**
   * Replies from a recorder that kept no reasoning or tool-use count, whose
   * total exceeded the parts it did keep. The remainder is priced as output,
   * the dearer side, rather than dropped; counted so the bill can say so.
   */
  remainderAsOutput: number;
}

const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const count = (value: unknown): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;

/** A signature, not a filename: the session header, or a reply with its token summary. */
export function looksLikeGeminiCliSession(text: string): boolean {
  const trimmed = text.trimStart();
  if (trimmed.startsWith('{')) {
    // A legacy single-document session, which the recorder pretty-printed:
    // the whole text parses as one object. JSONL fails fast at its second line.
    try {
      const doc: unknown = JSON.parse(trimmed);
      if (object(doc) && typeof doc.sessionId === 'string' && typeof doc.projectHash === 'string' &&
        Array.isArray(doc.messages)) return true;
    } catch { /* fall through to the line rule */ }
  }
  for (const line of text.split('\n').slice(0, 50)) {
    if (line.trim() === '') continue;
    try {
      const row: unknown = JSON.parse(line);
      if (!object(row)) continue;
      if (typeof row.sessionId === 'string' && typeof row.projectHash === 'string') return true;
      if (row.type === 'gemini' && typeof row.id === 'string' && object(row.tokens)) return true;
    } catch { /* Malformed lines are reported by conversion, never executed. */ }
  }
  return false;
}

interface Reply {
  model: unknown;
  timestamp: unknown;
  tokens: Record<string, unknown>;
}

/**
 * One usage record per reply that carried token counts.
 *
 * Gemini's `input` is `promptTokenCount`, which **includes** the cached tokens,
 * so the cached part is taken out of it; `thoughts` (reasoning, billed as
 * output) and `tool` (tool results fed back to the model, billed as input) sit
 * outside the first two counts, and `total` is the sum of all four.
 */
export function geminiCliRecords(text: string, options: { label?: string } = {}): GeminiCliConversion {
  const result: GeminiCliConversion = {
    records: [], repeats: 0, unparseable: 0, unsupported: 0, missingModel: 0, remainderAsOutput: 0,
  };
  let session: string | null = null;
  // Insertion order is first appearance; the value is the last version seen.
  const replies = new Map<string, Reply>();
  const sessionOf = new Map<string, string | null>();
  const seen = new Set<string>();

  const take = (message: unknown): void => {
    if (!object(message) || typeof message.id !== 'string' || message.type !== 'gemini') return;
    const key = `${session ?? ''}\n${message.id}`;
    if (seen.has(key)) result.repeats++;
    seen.add(key);
    if (!object(message.tokens)) return;
    replies.set(key, { model: message.model, timestamp: message.timestamp, tokens: message.tokens });
    if (!sessionOf.has(key)) sessionOf.set(key, session);
  };

  const trimmed = text.trimStart();
  let legacy: Record<string, unknown> | null = null;
  if (trimmed.startsWith('{')) {
    try {
      const doc: unknown = JSON.parse(trimmed);
      if (object(doc) && Array.isArray(doc.messages) && typeof doc.sessionId === 'string') legacy = doc;
    } catch { /* not a single document: read it as lines */ }
  }
  if (legacy !== null) {
    session = legacy.sessionId as string;
    for (const message of legacy.messages as unknown[]) take(message);
  } else {
    for (const line of text.split('\n')) {
      if (line.trim() === '') continue;
      let row: unknown;
      try { row = JSON.parse(line); } catch { result.unparseable++; continue; }
      if (!object(row)) { result.unparseable++; continue; }
      if (typeof row.sessionId === 'string' && row.sessionId !== '') session = row.sessionId;
      if (object(row.$set) && Array.isArray(row.$set.messages)) {
        for (const message of row.$set.messages as unknown[]) take(message);
        continue;
      }
      take(row);
    }
  }

  for (const [key, reply] of replies) {
    const t = reply.tokens;
    const input = count(t.input);
    const output = count(t.output);
    const cached = t.cached === undefined ? 0 : count(t.cached);
    const thoughts = t.thoughts === undefined || t.thoughts === null ? null : count(t.thoughts);
    const tool = t.tool === undefined || t.tool === null ? null : count(t.tool);
    const total = t.total === undefined ? 0 : count(t.total);
    if (input === null || output === null || cached === null || total === null ||
        (t.thoughts !== undefined && t.thoughts !== null && thoughts === null) ||
        (t.tool !== undefined && t.tool !== null && tool === null) ||
        cached > input) {
      result.unsupported++;
      continue;
    }
    const known = input + output + (thoughts ?? 0) + (tool ?? 0);
    // A total below its own parts is a record that contradicts itself.
    if (total > 0 && total < known) { result.unsupported++; continue; }
    let extraOutput = 0;
    if (total > known) {
      // Parts the recorder kept add up short of the total it also kept. With
      // both breakdowns present that is a contradiction; without them the
      // remainder is reasoning or tool input that went unrecorded, and output
      // is the dearer reading.
      if (thoughts !== null && tool !== null) { result.unsupported++; continue; }
      extraOutput = total - known;
      result.remainderAsOutput++;
    }
    if (input + output + (thoughts ?? 0) + (tool ?? 0) + extraOutput === 0) continue;
    if (typeof reply.model !== 'string' || reply.model.trim() === '') { result.missingModel++; continue; }
    const ts = typeof reply.timestamp === 'string' && Number.isFinite(Date.parse(reply.timestamp))
      ? reply.timestamp
      : undefined;
    const owner = sessionOf.get(key) ?? null;
    result.records.push({
      model: reply.model,
      ...(ts === undefined ? {} : { ts }),
      ...(owner === null ? {} : { session: owner }),
      ...(options.label === undefined ? {} : { label: options.label }),
      usage: {
        input_tokens: input - cached + (tool ?? 0),
        output_tokens: output + (thoughts ?? 0) + extraOutput,
        cache_read_input_tokens: cached,
      },
    });
  }
  return result;
}
