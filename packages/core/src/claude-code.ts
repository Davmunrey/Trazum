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

/**
 * One directory prefix, and the label the work under it belongs to.
 *
 * The answer to a question one session cannot answer any other way: **which
 * project was this call for**, when two of them share a transcript. Claude Code
 * records a `cwd` on every line and this module has never emitted it, on
 * purpose — a working directory is a file path, and a file path says something
 * about somebody's machine that a bill does not need.
 *
 * Reading it to *choose* a label is not the same act as emitting it, and the
 * difference is the whole contract here: the prefix and the label are written
 * by the person running the conversion, the `cwd` decides which of *their own*
 * labels applies, and **nothing derived from the path reaches the output**.
 * `claude-code.test.js` plants a secret in `cwd` and greps the whole output for
 * it, which is the same test that already holds for message text and branch
 * names, and `label-by-cwd.test.js` does it again through the CLI where the
 * stderr summary is searched too.
 *
 * A guessed label would be worse than none. Nothing here decodes, splits or
 * shortens a path: the longest matching prefix wins and an unmatched line
 * falls back to `label`, so a directory nobody wrote a rule for is
 * unattributed rather than attributed to a neighbour.
 */
export interface CwdLabel {
  /** An absolute directory prefix, compared literally. */
  prefix: string;
  label: string;
}

/** One converted record, shaped exactly as `parseUsageLine` reads it. */
export interface ClaudeCodeRecord {
  model: string;
  ts: string;
  session: string;
  label?: string;
  /**
   * What the provider said ended the turn, when the transcript recorded it.
   *
   * The field was on the assistant message all along and this converter did
   * not read it, so every report that depends on it answered "cannot be
   * measured" about a log whose own source knew. Absent when the transcript
   * is absent: nothing here is inferred from an output length that looks
   * suspiciously round.
   */
  stop_reason?: string;
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
  /**
   * Turns Claude Code produced locally, never sent to a provider.
   *
   * It writes `<synthetic>` in the model field for interrupts and error
   * notices. They carry a usage object of zeros and nobody billed them.
   * Priced, they are noise; dropped in silence, they are a hole. So they
   * are excluded by name and counted here, and the caller says how many.
   */
  synthetic: number;
  /**
   * Where a later run may safely pick this transcript up again.
   *
   * A transcript is append-only, so re-reading two hundred megabytes to learn
   * what the last thirty seconds added is waste, and on the largest real
   * session on one machine it is six and a half seconds of waste. The obstacle
   * to resuming is this converter's own rule: **one call arrives as several
   * lines and the last one stands**, so a call whose lines straddle the point
   * where a run stopped would be recorded from its later half only.
   *
   * So the resume point is not the end of what was read. It is the first line
   * of the last call seen, which is the only call that can still gain lines.
   * `records` says how many of `records` above are settled and will never be
   * revised; everything from `line` onwards is re-derived next time, and the
   * caller drops the unsettled tail before appending.
   *
   * Measured on 208 real transcripts, 36,468 lines carrying a `requestId`: a
   * call's lines are contiguous, and no `requestId` ever reappeared after
   * another had begun. The design does not lean on that. It re-derives the
   * final call whether or not it needed re-deriving, because a measurement on
   * one machine is evidence and not a guarantee.
   */
  resume: {
    /** Line index to start from next time, counting every line of the text read. */
    line: number;
    /** How many leading entries of `records` are settled. */
    records: number;
  };
}

/** The model id Claude Code writes for a turn no provider ever saw. */
const SYNTHETIC_MODEL = '<synthetic>';

const asObject = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const asCount = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;

/** Convert one transcript's text. Pure, like every measuring function here. */
/**
 * The label a line's own working directory selects, or nothing.
 *
 * **Longest prefix wins**, so `/src/app/api` beats `/src/app` and a nested
 * project is not swallowed by the repository above it. Ties cannot happen:
 * two rules with the same prefix are the same rule, and the first one written
 * stands rather than this function deciding between them silently.
 */
const labelForCwd = (cwd: unknown, rules: readonly CwdLabel[]): string | undefined => {
  if (typeof cwd !== 'string' || cwd === '') return undefined;
  let best: CwdLabel | undefined;
  for (const rule of rules) {
    if (!cwd.startsWith(rule.prefix)) continue;
    if (best === undefined || rule.prefix.length > best.prefix.length) best = rule;
  }
  return best?.label;
};

export function claudeCodeRecords(
  text: string,
  options: { label?: string; labelByCwd?: readonly CwdLabel[] } = {},
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
    synthetic: 0,
    resume: { line: 0, records: 0 },
  };
  /** requestId → index into out.records, so a later line can replace the usage. */
  const byRequest = new Map<string, number>();
  /** requestId → the usage currently standing, to classify a change when one arrives. */
  const seenUsage = new Map<string, ClaudeCodeRecord['usage']>();

  const lines = text.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
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
    const stopReason = message === null ? undefined : message.stop_reason;
    const input = usage === null ? undefined : asCount(usage.input_tokens);
    const output = usage === null ? undefined : asCount(usage.output_tokens);
    if (usage === null || typeof model !== 'string' || input === undefined || output === undefined) {
      out.assistantWithoutUsage += 1;
      continue;
    }
    /**
     * Excluded by name, and only by name.
     *
     * `<synthetic>` is the model Claude Code writes for a turn it produced
     * itself. Matching the exact string rather than "anything in angle
     * brackets" is deliberate: a provider is free to ship a model whose id
     * looks odd, and a pattern that swallowed it would delete real spend
     * from a bill without saying so.
     */
    if (model === SYNTHETIC_MODEL) {
      out.synthetic += 1;
      continue;
    }

    const creation = asObject(usage.cache_creation);
    const record: ClaudeCodeRecord = {
      model,
      ts: typeof entry.timestamp === 'string' ? entry.timestamp : '',
      session: typeof entry.sessionId === 'string' ? entry.sessionId : '',
      ...(typeof stopReason === 'string' && stopReason !== '' ? { stop_reason: stopReason } : {}),
      /*
        The directory's own rule first, then the flat label. A `--label` given
        alongside directory rules is the fallback for work outside all of
        them, which is what somebody splitting two projects out of one session
        means by giving both.
      */
      ...(((): { label?: string } => {
        const chosen =
          options.labelByCwd === undefined
            ? undefined
            : labelForCwd(entry.cwd, options.labelByCwd);
        const label = chosen ?? options.label;
        return label === undefined ? {} : { label };
      })()),
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
      // Nothing keys this line, so nothing can ever revise it: it is settled
      // the moment it is read, and the resume point moves past it.
      out.noRequestId += 1;
      out.records.push(record);
      out.resume = { line: index + 1, records: out.records.length };
      continue;
    }
    const standing = byRequest.get(requestId);
    if (standing === undefined) {
      // A call begins. Everything before it is settled; this call is not,
      // because the next line of the transcript may still revise it.
      byRequest.set(requestId, out.records.length);
      seenUsage.set(requestId, record.usage);
      out.resume = { line: index, records: out.records.length };
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

  /**
   * Nothing carrying usage was found, so everything read is settled and the
   * resume point is the end of it.
   *
   * With one exception, and it is the one that would lose a record rather than
   * merely re-derive one: a transcript being appended to can be read mid-line,
   * and that half-line parses as nothing. Resuming past it would drop the call
   * it becomes. So when the text does not end in a newline, the resume point
   * never passes the start of its final line.
   */
  if (out.records.length === 0) out.resume = { line: lines.length, records: 0 };
  if (text !== '' && !text.endsWith('\n')) {
    out.resume = { ...out.resume, line: Math.min(out.resume.line, lines.length - 1) };
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
