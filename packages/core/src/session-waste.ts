import { claudeCodeRecords } from './claude-code.js';
import type { ClaudeCodeRecord } from './claude-code.js';
import type { PricingCatalogue } from './pricing.js';
import { DEFAULT_DIVISOR, ESTIMATE_ERROR_BAND_PCT } from './tokenizer.js';
import { profileUsage } from './usage.js';

/**
 * Waste in a coding-agent session, named and priced, from counts and paths.
 *
 * ## What it looks at, and what it refuses to look at
 *
 * A Claude Code transcript holds the conversation. This module reads **counts
 * and paths out of it and never what was said**: for each assistant call the
 * usage counts the converter already reads; for each tool call its name and,
 * for the file tools, the one `file_path` argument plus a `Read`'s `offset`
 * and `limit` (numbers); for each tool result only whether it was an error;
 * and, from the lines Claude Code writes about what it loaded, server and tool
 * names. No tool input other than those, no tool result body, no message text
 * and no file content is read into a variable. `session-waste.test.js` plants a
 * secret in each of those places and greps the whole report for it.
 *
 * ## Three findings, and what each can be priced from
 *
 * - **The same file read again.** Priced from the session's own counts: the
 *   prompt grew by `P(next) - P(this) - output(this)` tokens across the call
 *   that read the file, and that growth was carried, as cache reads, on every
 *   later call of the same thread until the context shrank. The saving is the
 *   difference between the thread's actual cost and its cost with those
 *   tokens taken out, both through `profileUsage`, so a long-context band, a
 *   cache TTL or a fast-mode multiplier is applied by the one code that
 *   already knows them. Measurable only where the call made exactly one tool
 *   call: with several, the growth cannot be split among them and the repeat
 *   is counted and left unpriced.
 * - **MCP servers loaded and never called.** Named, and **not priced**: what a
 *   server's tool definitions cost is not in the transcript, and where tools
 *   are deferred the definitions are not even sent until the tool is asked for.
 *   The number of tools it brought is a count, and is all that is said.
 * - **A CLAUDE.md carried on every turn.** The transcript does not record its
 *   size. The caller supplies the file's size in bytes (a `stat`, never the
 *   content), and the tokens are that size over the estimator's divisor,
 *   with the published band on both sides. It is the one estimated figure here
 *   and says so.
 *
 * ## What it never does
 *
 * It recommends and edits nothing. A saving is computed from this session's
 * counts at the dated bundled catalogue, as API-equivalent cost, and is never
 * a percentage taken from elsewhere. A saving it cannot compute is `null` with
 * the reason beside it, never a number that looks like one.
 */

export const WASTE_LIMITATIONS = [
  'Every figure is API-equivalent cost: the usage at the dated catalogue rates, not what was charged.',
  'A repeated read is only priced where its call made no other tool call, because the prompt growth cannot be split among several. The rest are counted and not priced.',
  'A file that Bash rewrote between two reads is not seen as changed, so that second read counts as a repeat.',
  'MCP tool-definition tokens are not recorded in a transcript, so a server that was never called is named and not priced.',
  'A CLAUDE.md size is a file size in bytes, not a count from the transcript, and its tokens are an estimate within the published band.',
  'Savings are a lower bound: they count the context a repeat added and carried, not the extra round trip.',
] as const;

/** Tools that change a file, and so make the next read of it a different read. */
const WRITERS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

const asObject = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const asCount = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];

interface ToolCall {
  id: string;
  name: string;
  /** The one path a file tool names. Nothing else of the input is kept. */
  path?: string;
  /** A read's range, as numbers: two reads of different ranges are not the same read. */
  range?: string;
}

interface Call {
  record: ClaudeCodeRecord;
  thread: string;
  tools: ToolCall[];
}

interface Extracted {
  calls: Call[];
  failed: Set<string>;
  loaded: { servers: Set<string>; tools: Set<string>; recorded: boolean };
  /** Whether the lines kept here are the lines the converter priced, one for one. */
  aligned: boolean;
}

/** `mcp__server__tool` to `server`. A name that is not an MCP name has none. */
export function mcpServerOf(toolName: string): string | undefined {
  if (!toolName.startsWith('mcp__')) return undefined;
  const server = toolName.slice(5).split('__')[0];
  return server === undefined || server === '' ? undefined : server;
}

/**
 * One transcript, as calls with their tool names, in the converter's order.
 *
 * The converter keys a call by `requestId`, else `message.id`, keeps the last
 * line's usage and drops `<synthetic>`; this applies the same rules to the same
 * lines to know which tool calls belong to which of its records, and `aligned`
 * says whether the two agree on how many calls there were. If they do not, the
 * caller says it cannot tell rather than pair a tool call with the wrong prompt.
 */
function extract(text: string, fileIndex: number): Extracted {
  const conversion = claudeCodeRecords(text);
  const out: Extracted = {
    calls: [],
    failed: new Set(),
    loaded: { servers: new Set(), tools: new Set(), recorded: false },
    aligned: true,
  };
  const byKey = new Map<string, Call>();
  const loaded = out.loaded;
  let next = 0;
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch {
      continue;
    }
    const entry = asObject(raw);
    if (entry === null) continue;

    if (entry.type === 'user') {
      const content = asObject(entry.message)?.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          const b = asObject(block);
          // Only the id and the flag: the body of a result is never read.
          if (b !== null && b.type === 'tool_result' && b.is_error === true && typeof b.tool_use_id === 'string') out.failed.add(b.tool_use_id);
        }
      }
      continue;
    }
    if (entry.type === 'attachment') {
      const attachment = asObject(entry.attachment);
      // Names only. `addedLines` carries descriptions and is never read.
      if (attachment !== null && attachment.type === 'deferred_tools_delta') {
        loaded.recorded = true;
        for (const name of strings(attachment.addedNames)) if (name.startsWith('mcp__')) loaded.tools.add(name);
        for (const name of strings(attachment.removedNames)) loaded.tools.delete(name);
      } else if (attachment !== null && attachment.type === 'mcp_instructions_delta') {
        loaded.recorded = true;
        for (const name of strings(attachment.addedNames)) loaded.servers.add(name);
        for (const name of strings(attachment.removedNames)) loaded.servers.delete(name);
      }
      continue;
    }
    if (entry.type === 'system' && Array.isArray(entry.mcp_servers)) {
      loaded.recorded = true;
      for (const server of entry.mcp_servers) {
        const name = asObject(server)?.name;
        if (typeof name === 'string' && name !== '') loaded.servers.add(name);
      }
      continue;
    }
    if (entry.type !== 'assistant') continue;

    const message = asObject(entry.message);
    const usage = message === null ? null : asObject(message.usage);
    const model = message === null ? undefined : message.model;
    if (usage === null || typeof model !== 'string' || asCount(usage.input_tokens) === undefined || asCount(usage.output_tokens) === undefined) continue;
    if (model === '<synthetic>') continue;

    const key =
      typeof entry.requestId === 'string' && entry.requestId !== ''
        ? `request:${entry.requestId}`
        : message !== null && typeof message.id === 'string' && message.id !== ''
          ? `message:${message.id}`
          : null;
    let call = key === null ? undefined : byKey.get(key);
    if (call === undefined) {
      const record = conversion.records[next];
      next += 1;
      if (record === undefined) {
        out.aligned = false;
        continue;
      }
      call = { record, thread: `${fileIndex}:${record.thread ?? 'main'}`, tools: [] };
      out.calls.push(call);
      if (key !== null) byKey.set(key, call);
    }
    const content = message === null ? undefined : message.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      const b = asObject(block);
      if (b === null || b.type !== 'tool_use' || typeof b.id !== 'string' || typeof b.name !== 'string') continue;
      if (call.tools.some((tool) => tool.id === b.id)) continue;
      const input = asObject(b.input);
      const tool: ToolCall = { id: b.id, name: b.name };
      if (input !== null) {
        const path = b.name === 'NotebookEdit' ? input.notebook_path : input.file_path;
        if (typeof path === 'string' && path !== '') tool.path = path;
        if (b.name === 'Read') tool.range = `${asCount(input.offset) ?? ''}:${asCount(input.limit) ?? ''}`;
      }
      call.tools.push(tool);
    }
  }
  if (next !== conversion.records.length) out.aligned = false;
  return out;
}

type Usage = ClaudeCodeRecord['usage'];
type Bucket = 'read' | 'write' | 'input';

/**
 * `n` tokens taken out of a call's usage, from the buckets in the order given.
 *
 * Never below zero: a bucket that holds fewer than asked gives what it has and
 * the rest comes from the next, and what no bucket held is simply not removed,
 * which can only make a saving smaller.
 */
function without(usage: Usage, n: number, order: readonly Bucket[]): Usage {
  const next: Usage = { ...usage, ...(usage.cache_creation === undefined ? {} : { cache_creation: { ...usage.cache_creation } }) };
  let left = n;
  for (const bucket of order) {
    if (left <= 0) break;
    if (bucket === 'input') {
      const take = Math.min(left, next.input_tokens);
      next.input_tokens -= take;
      left -= take;
    } else if (bucket === 'read') {
      const take = Math.min(left, next.cache_read_input_tokens ?? 0);
      if (take > 0) next.cache_read_input_tokens = (next.cache_read_input_tokens ?? 0) - take;
      left -= take;
    } else {
      const have = next.cache_creation_input_tokens ?? 0;
      const take = Math.min(left, have);
      if (take > 0) {
        next.cache_creation_input_tokens = have - take;
        if (next.cache_creation !== undefined) {
          let rest = take;
          for (const ttl of ['ephemeral_5m_input_tokens', 'ephemeral_1h_input_tokens'] as const) {
            const held = next.cache_creation[ttl] ?? 0;
            const cut = Math.min(rest, held);
            if (cut > 0) next.cache_creation[ttl] = held - cut;
            rest -= cut;
          }
        }
      }
      left -= take;
    }
  }
  return next;
}

const promptOf = (usage: Usage): number =>
  usage.input_tokens + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0);

export interface RepeatedRead {
  path: string;
  /** Reads of the path that were not an error, in every thread. */
  reads: number;
  /** Reads after the first of the same range with no write to the file between. */
  repeats: number;
  /** Repeats whose call made one tool call, so the growth it caused is known. */
  measured: number;
  /** The prompt growth of the measured repeats, summed. */
  tokens: number;
  /** What carrying that growth cost, or null where nothing could be measured. */
  usd: number | null;
}

export interface UnusedMcpServer {
  server: string;
  /** Tools it brought, when the transcript names them. */
  tools: number | null;
}

export interface ClaudeMdFinding {
  path: string;
  bytes: number;
  tokens: number;
  /** The same cost at the band's two ends. */
  usdLow: number;
  usd: number;
  usdHigh: number;
  /** Calls of the main thread that carried it. */
  calls: number;
}

export type McpSource = 'transcript' | 'flag' | 'none';

export interface SessionWasteReport {
  schemaVersion: 1;
  kind: 'trazum-waste';
  pricing: { source: 'bundled'; lastReviewed: string; basis: 'api-equivalent' };
  /** Calls priced, threads they ran in. */
  session: { calls: number; threads: number; files: number };
  /** Set when the transcript could not be paired with its usage, and nothing below was computed. */
  cannotTell: 'unreadable' | null;
  unpricedModels: string[];
  reads: {
    minReads: number;
    findings: RepeatedRead[];
    /** Paths read again that are not listed, because they fall under `minReads` or past the cap. */
    omitted: number;
    /** Repeats of the listed paths, and how many of them were priced. */
    repeats: number;
    measured: number;
    /** All listed repeats taken out together; null when none was measured. */
    usd: number | null;
  };
  mcp: {
    source: McpSource;
    loaded: number;
    called: number;
    /** Loaded and never called. Not priced: see `unpricedReason`. */
    unused: UnusedMcpServer[];
    unpricedReason: 'definitions-not-recorded';
  };
  claudeMd: { checked: boolean; findings: ClaudeMdFinding[]; bandPct: number };
  limitations: string[];
}

export interface SessionWasteOptions {
  catalogue: PricingCatalogue;
  on: Date;
  /** Paths read fewer times than this are not listed. */
  minReads: number;
  /** Server names the person says are loaded, when the transcript does not say. */
  mcpServers?: readonly string[];
  /** Files to price as carried every turn: a size from `stat`, never the content. */
  claudeMd?: ReadonlyArray<{ path: string; bytes: number }>;
}

/** The most paths listed. The rest are counted in `omitted`. */
export const MAX_LISTED_READS = 20;

/**
 * The directory a session ran in, the first one a main-thread line names.
 *
 * A path and nothing else of the line. It is how a caller finds the project's
 * CLAUDE.md to measure, and it is never copied into the report.
 */
export function sessionCwd(text: string): string | undefined {
  for (const line of text.split('\n')) {
    if (!line.includes('"cwd"')) continue;
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch {
      continue;
    }
    const entry = asObject(raw);
    if (entry !== null && entry.isSidechain !== true && typeof entry.cwd === 'string' && entry.cwd !== '') return entry.cwd;
  }
  return undefined;
}

function priced(records: readonly ClaudeCodeRecord[], options: SessionWasteOptions): { usd: number; unpriced: string[]; skipped: number } {
  const text = records.length === 0 ? '' : `${records.map((record) => JSON.stringify(record)).join('\n')}\n`;
  const report = profileUsage(text, { catalogue: options.catalogue, on: options.on });
  return { usd: report.total.totalUsd, unpriced: report.unpricedModels, skipped: report.skippedLines.length };
}

/** Every thread's calls in order, with the usage each would have had without `removed`. */
function counterfactual(threads: Map<string, Call[]>, removed: Map<Call, { measured: number }>): ClaudeCodeRecord[] {
  const out: ClaudeCodeRecord[] = [];
  for (const calls of threads.values()) {
    let carry = 0;
    for (let i = 0; i < calls.length; i += 1) {
      const call = calls[i]!;
      // A prompt that shrank is a context that was compacted or cleared: what was carried is gone.
      if (i > 0 && promptOf(call.record.usage) < promptOf(calls[i - 1]!.record.usage)) carry = 0;
      let usage = call.record.usage;
      if (carry > 0) usage = without(usage, carry, ['read', 'write', 'input']);
      const own = removed.get(call);
      if (own !== undefined) {
        usage = without(usage, own.measured, ['write', 'input', 'read']);
        carry += own.measured;
      }
      out.push({ ...call.record, usage });
    }
  }
  return out;
}

/** What the repeats in `chosen` cost, as the difference of two pricings of the same thread set. */
function savedBy(threads: Map<string, Call[]>, growth: Map<Call, number>, chosen: ReadonlySet<Call>, options: SessionWasteOptions, whole: number): number {
  // A repeat's growth lands on the call after it, as new tokens, and rides on every call after that.
  const landing = new Map<Call, { measured: number }>();
  for (const calls of threads.values()) {
    for (let i = 0; i + 1 < calls.length; i += 1) {
      const call = calls[i]!;
      const tokens = growth.get(call);
      if (tokens !== undefined && chosen.has(call)) landing.set(calls[i + 1]!, { measured: tokens });
    }
  }
  const after = priced(counterfactual(threads, landing), options).usd;
  return Math.max(0, whole - after);
}

export function analyzeSessionWaste(files: readonly string[], options: SessionWasteOptions): SessionWasteReport {
  const report: SessionWasteReport = {
    schemaVersion: 1,
    kind: 'trazum-waste',
    pricing: { source: 'bundled', lastReviewed: options.catalogue.lastReviewed, basis: 'api-equivalent' },
    session: { calls: 0, threads: 0, files: files.length },
    cannotTell: null,
    unpricedModels: [],
    reads: { minReads: options.minReads, findings: [], omitted: 0, repeats: 0, measured: 0, usd: null },
    mcp: { source: 'none', loaded: 0, called: 0, unused: [], unpricedReason: 'definitions-not-recorded' },
    claudeMd: { checked: options.claudeMd !== undefined, findings: [], bandPct: ESTIMATE_ERROR_BAND_PCT },
    limitations: [...WASTE_LIMITATIONS],
  };

  const parts = files.map((text, index) => extract(text, index));
  if (parts.some((part) => !part.aligned)) {
    report.cannotTell = 'unreadable';
    return report;
  }
  const threads = new Map<string, Call[]>();
  for (const part of parts) for (const call of part.calls) (threads.get(call.thread) ?? threads.set(call.thread, []).get(call.thread)!).push(call);
  const failed = new Set<string>();
  for (const part of parts) for (const id of part.failed) failed.add(id);
  report.session.calls = parts.reduce((sum, part) => sum + part.calls.length, 0);
  report.session.threads = threads.size;

  const whole = priced(
    [...threads.values()].flat().map((call) => call.record),
    options,
  );
  report.unpricedModels = whole.unpriced;
  // A call that could not be read as usage is not a free call: nothing below is computed from a part of the session.
  if (whole.skipped > 0) {
    report.cannotTell = 'unreadable';
    return report;
  }

  // ---- The same file read again --------------------------------------------
  interface Tally { reads: number; repeats: Call[] }
  const tallies = new Map<string, Tally>();
  const growth = new Map<Call, number>();
  const owner = new Map<Call, string>();
  for (const calls of threads.values()) {
    const seen = new Map<string, Set<string>>();
    for (let i = 0; i < calls.length; i += 1) {
      const call = calls[i]!;
      let repeated: string | undefined;
      for (const tool of call.tools) {
        if (tool.path === undefined) continue;
        if (WRITERS.has(tool.name)) {
          seen.delete(tool.path);
          continue;
        }
        if (tool.name !== 'Read' || failed.has(tool.id)) continue;
        const tally = tallies.get(tool.path) ?? { reads: 0, repeats: [] };
        tallies.set(tool.path, tally);
        tally.reads += 1;
        const ranges = seen.get(tool.path) ?? new Set<string>();
        seen.set(tool.path, ranges);
        const range = tool.range ?? '';
        if (ranges.has(range)) {
          tally.repeats.push(call);
          repeated = tool.path;
        } else ranges.add(range);
      }
      // The growth is known only where this call made one tool call and there is a next call to show it.
      const following = calls[i + 1];
      if (repeated !== undefined && call.tools.length === 1 && following !== undefined) {
        const tokens = promptOf(following.record.usage) - promptOf(call.record.usage) - call.record.usage.output_tokens;
        if (tokens > 0) {
          growth.set(call, tokens);
          owner.set(call, repeated);
        }
      }
    }
  }

  const candidates = [...tallies.entries()].filter(([, tally]) => tally.reads >= options.minReads && tally.repeats.length > 0);
  const rows: Array<RepeatedRead & { calls: Call[] }> = candidates.map(([path, tally]) => {
    const measuredCalls = tally.repeats.filter((call) => growth.has(call) && owner.get(call) === path);
    return {
      path,
      reads: tally.reads,
      repeats: tally.repeats.length,
      measured: measuredCalls.length,
      tokens: measuredCalls.reduce((sum, call) => sum + (growth.get(call) ?? 0), 0),
      usd: null,
      calls: measuredCalls,
    };
  });
  // The dearest first needs the cost, and the cost needs a run per path: so the order the cap is applied in is the tokens, which the run then prices.
  rows.sort((a, b) => b.tokens - a.tokens || b.repeats - a.repeats || (a.path < b.path ? -1 : 1));
  const listed = rows.slice(0, MAX_LISTED_READS);
  for (const row of listed) {
    if (row.calls.length > 0) row.usd = savedBy(threads, growth, new Set(row.calls), options, whole.usd);
  }
  listed.sort((a, b) => (b.usd ?? -1) - (a.usd ?? -1) || b.tokens - a.tokens || (a.path < b.path ? -1 : 1));
  report.reads.omitted = [...tallies.values()].filter((tally) => tally.repeats.length > 0).length - listed.length;
  report.reads.findings = listed.map(({ calls: _calls, ...row }) => row);
  report.reads.repeats = listed.reduce((sum, row) => sum + row.repeats, 0);
  report.reads.measured = listed.reduce((sum, row) => sum + row.measured, 0);
  const allMeasured = new Set(listed.flatMap((row) => row.calls));
  if (allMeasured.size > 0) report.reads.usd = savedBy(threads, growth, allMeasured, options, whole.usd);

  // ---- MCP servers loaded and never called ----------------------------------
  const loadedServers = new Map<string, number | null>();
  let recorded = false;
  const loadedTools = new Set<string>();
  const loadedNames = new Set<string>();
  for (const part of parts) {
    if (part.loaded.recorded) recorded = true;
    for (const tool of part.loaded.tools) loadedTools.add(tool);
    for (const server of part.loaded.servers) loadedNames.add(server);
  }
  for (const tool of loadedTools) {
    const server = mcpServerOf(tool);
    if (server !== undefined) loadedServers.set(server, (loadedServers.get(server) ?? 0) + 1);
  }
  for (const server of loadedNames) if (!loadedServers.has(server)) loadedServers.set(server, null);
  if (recorded && loadedServers.size > 0) report.mcp.source = 'transcript';
  else if (options.mcpServers !== undefined && options.mcpServers.length > 0) {
    report.mcp.source = 'flag';
    for (const server of options.mcpServers) if (server !== '' && !loadedServers.has(server)) loadedServers.set(server, null);
  }
  if (report.mcp.source !== 'none') {
    const calledServers = new Set<string>();
    for (const calls of threads.values()) for (const call of calls) for (const tool of call.tools) {
      const server = mcpServerOf(tool.name);
      if (server !== undefined) calledServers.add(server);
    }
    report.mcp.loaded = loadedServers.size;
    report.mcp.called = [...loadedServers.keys()].filter((server) => calledServers.has(server)).length;
    report.mcp.unused = [...loadedServers.entries()]
      .filter(([server]) => !calledServers.has(server))
      .map(([server, tools]) => ({ server, tools }))
      .sort((a, b) => (a.server < b.server ? -1 : 1));
  }

  // ---- A CLAUDE.md carried on every turn ------------------------------------
  const main = [...threads.entries()].filter(([key]) => key.endsWith(':main')).flatMap(([, calls]) => calls);
  for (const file of options.claudeMd ?? []) {
    if (!Number.isFinite(file.bytes) || file.bytes <= 0 || main.length === 0) continue;
    const at = (tokens: number): number => {
      const records: ClaudeCodeRecord[] = [];
      for (const [key, calls] of threads) {
        const isMain = key.endsWith(':main');
        calls.forEach((call, index) => {
          if (!isMain) records.push(call.record);
          // The first call writes it to the cache, every later one reads it.
          else records.push({ ...call.record, usage: without(call.record.usage, tokens, index === 0 ? ['write', 'input', 'read'] : ['read', 'write', 'input']) });
        });
      }
      return Math.max(0, whole.usd - priced(records, options).usd);
    };
    const tokens = Math.ceil(file.bytes / DEFAULT_DIVISOR);
    report.claudeMd.findings.push({
      path: file.path,
      bytes: file.bytes,
      tokens,
      usdLow: at(Math.floor((tokens * (100 - ESTIMATE_ERROR_BAND_PCT)) / 100)),
      usd: at(tokens),
      usdHigh: at(Math.ceil((tokens * (100 + ESTIMATE_ERROR_BAND_PCT)) / 100)),
      calls: main.length,
    });
  }
  return report;
}
