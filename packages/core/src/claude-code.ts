/**
 * Claude Code transcripts, read as a usage log — the 1.69 arc's one move.
 *
 * Claude Code writes a transcript for every session, and each assistant
 * line carries the API's own `usage` object: the counts, and the
 * `cache_creation` TTL split that settles whether caching paid off. This
 * module turns that transcript into usage-log records **without reading
 * what was said**: the conversion touches `message.model`, `message.usage`,
 * `timestamp`, `sessionId` and `requestId`, and nothing else survives into
 * the output — no message text, no `cwd`, no `gitBranch`, held by a test
 * that plants a secret in each and greps the whole output for it.
 *
 * **One API call is written as several lines.** A multi-block response
 * repeats the same `usage` object on one line per content block — in the
 * session this was designed against, 25,490 assistant lines collapsed to
 * 16,079 distinct `requestId`s, so a line-by-line conversion overbills by a
 * third. Records are deduplicated by `requestId`, keeping the **last**
 * line's usage — the call's final state. Two ways the lines of one call
 * differ, measured on real transcripts and told apart on purpose: counts
 * that only ever grow are a response written while still streaming (the
 * norm — 311 of them across one real project's 195 transcripts), counted
 * in `streamed` without alarm; anything else is a genuine `disagreement`,
 * and the caller says that one out loud.
 */

/** One converted record, shaped exactly as `parseUsageLine` reads it. */
export interface ClaudeCodeRecord {
  model: string;
  ts: string;
  session: string;
  label?: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_creation?: { ephemeral_5m_input_tokens?: number; ephemeral_1h_input_tokens?: number };
  };
}

export interface ClaudeCodeConversion {
  records: ClaudeCodeRecord[];
  /** Extra lines of already-seen requests, collapsed — not spend. */
  collapsed: number;
  /** Assistant lines carrying usage but no requestId: kept, and counted. */
  noRequestId: number;
  /** Lines of the transcript's other business: user turns, attachments, system. */
  otherLines: number;
  /** Lines that did not parse as JSON at all. */
  unparseable: number;
  /** Assistant lines with no usage object — nothing to price. */
  assistantWithoutUsage: number;
  /**
   * Requests written while still streaming: later lines carry larger counts
   * (the in-flight total growing), and the last line is the final state.
   * The measured norm on real transcripts — counted, not alarmed about.
   */
  streamed: number;
  /**
   * Requests whose lines disagreed in a way streaming cannot explain — a
   * count shrank, or a different field changed. The last line stood, and
   * the caller should say so loudly: this is a finding, not bookkeeping.
   */
  disagreements: number;
}

const asObject = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const asCount = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;

/** Convert one transcript's text. Pure, like every measuring function here. */
export function claudeCodeRecords(
  text: string,
  options: { label?: string } = {},
): ClaudeCodeConversion {
  const out: ClaudeCodeConversion = {
    records: [],
    collapsed: 0,
    noRequestId: 0,
    otherLines: 0,
    unparseable: 0,
    assistantWithoutUsage: 0,
    streamed: 0,
    disagreements: 0,
  };
  /** requestId → index into out.records, so a later line can replace the usage. */
  const byRequest = new Map<string, number>();
  /** requestId → the usage currently standing, to classify a change when one arrives. */
  const seenUsage = new Map<string, ClaudeCodeRecord['usage']>();

  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch {
      out.unparseable += 1;
      continue;
    }
    const entry = asObject(raw);
    if (entry === null || entry.type !== 'assistant') {
      out.otherLines += 1;
      continue;
    }
    const message = asObject(entry.message);
    const usage = message === null ? null : asObject(message.usage);
    const model = message === null ? undefined : message.model;
    const input = usage === null ? undefined : asCount(usage.input_tokens);
    const output = usage === null ? undefined : asCount(usage.output_tokens);
    if (usage === null || typeof model !== 'string' || input === undefined || output === undefined) {
      out.assistantWithoutUsage += 1;
      continue;
    }

    const creation = asObject(usage.cache_creation);
    const record: ClaudeCodeRecord = {
      model,
      ts: typeof entry.timestamp === 'string' ? entry.timestamp : '',
      session: typeof entry.sessionId === 'string' ? entry.sessionId : '',
      ...(options.label !== undefined ? { label: options.label } : {}),
      usage: {
        input_tokens: input,
        output_tokens: output,
        ...(asCount(usage.cache_read_input_tokens) !== undefined
          ? { cache_read_input_tokens: asCount(usage.cache_read_input_tokens) }
          : {}),
        ...(asCount(usage.cache_creation_input_tokens) !== undefined
          ? { cache_creation_input_tokens: asCount(usage.cache_creation_input_tokens) }
          : {}),
        ...(creation !== null
          ? {
              cache_creation: {
                ...(asCount(creation.ephemeral_5m_input_tokens) !== undefined
                  ? { ephemeral_5m_input_tokens: asCount(creation.ephemeral_5m_input_tokens) }
                  : {}),
                ...(asCount(creation.ephemeral_1h_input_tokens) !== undefined
                  ? { ephemeral_1h_input_tokens: asCount(creation.ephemeral_1h_input_tokens) }
                  : {}),
              },
            }
          : {}),
      },
    };

    const requestId = typeof entry.requestId === 'string' ? entry.requestId : null;
    if (requestId === null) {
      out.noRequestId += 1;
      out.records.push(record);
      continue;
    }
    const standing = byRequest.get(requestId);
    if (standing === undefined) {
      byRequest.set(requestId, out.records.length);
      seenUsage.set(requestId, record.usage);
      out.records.push(record);
      continue;
    }
    // The same call, another line. The last line's usage is the call's
    // final state. Identical repetition (one line per content block)
    // collapses silently into the count; counts that only ever grew are a
    // response written while still streaming — the measured norm, counted
    // without alarm; anything else is a genuine disagreement, counted as
    // the finding it is. Either way the last line stands.
    out.collapsed += 1;
    const before = seenUsage.get(requestId)!;
    if (JSON.stringify(before) !== JSON.stringify(record.usage)) {
      const grewOnly =
        record.usage.input_tokens >= before.input_tokens &&
        record.usage.output_tokens >= before.output_tokens &&
        (record.usage.cache_read_input_tokens ?? 0) >= (before.cache_read_input_tokens ?? 0) &&
        (record.usage.cache_creation_input_tokens ?? 0) >= (before.cache_creation_input_tokens ?? 0);
      if (grewOnly) out.streamed += 1;
      else out.disagreements += 1;
      seenUsage.set(requestId, record.usage);
    }
    out.records[standing] = { ...record };
  }
  return out;
}

/**
 * Does this text look like a Claude Code transcript rather than a usage log?
 *
 * The web app accepts a dropped folder that mixes both, and has to tell them
 * apart per file with no help from the reader: a transcript's lines are
 * conversation events (`type: 'assistant'`, `'user'`, `'system'`…) with the
 * usage buried in `message.usage`, while a usage log's lines are the usage
 * records themselves (`model` and `usage` at the top). Deliberately dumb —
 * no scoring, no tunable threshold: a file is a transcript when at least one
 * line is an assistant event carrying `message.usage`, and not otherwise.
 * That is the exact shape `claudeCodeRecords` converts, so "looks like one"
 * and "converts to something" cannot disagree.
 *
 * Reads at most the first `limit` non-empty lines: a transcript announces
 * itself early, and a hundred-megabyte session should not be parsed in full
 * just to route it.
 */
export function looksLikeClaudeCodeTranscript(text: string, limit = 200): boolean {
  let seen = 0;
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    if (seen >= limit) break;
    seen += 1;
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch {
      continue;
    }
    const entry = asObject(raw);
    if (entry === null || entry.type !== 'assistant') continue;
    const message = asObject(entry.message);
    if (message !== null && asObject(message.usage) !== null) return true;
  }
  return false;
}
