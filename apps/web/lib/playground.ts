/**
 * The playground's dispatcher — the 1.72 arc's core, and deliberately not a
 * shell.
 *
 * The web app demonstrates the product's answers; this demonstrates the
 * *tool*. A quote-aware tokenizer (the real CLI gets its tokens from the OS
 * shell; a browser has no shell, so the playground brings its own), a command
 * registry covering the subset of the forty commands that is pure in a
 * browser, and an in-memory file map seeded with samples. `runPlayground` is
 * a function from one command line and the current files to output lines —
 * testable in Node with no DOM.
 *
 * **The same core functions, not a re-implementation.** `optimize`,
 * `profileUsage`, `positionReport`, `comparePrompts`, `otelRecords`,
 * `claudeCodeRecords`, `findContradictions`, `estimateTokens` — the
 * playground prices with exactly what the CLI imports. Only the presentation
 * is its own: the CLI's formatting is `console.log` fused with ANSI colour,
 * and forking it would be two formats wearing one name.
 *
 * **Nothing here fetches.** No network, no credentials, no filesystem — the
 * commands that need any of those are named as CLI-only by `help` rather
 * than silently absent. Held by `playground.test.mjs` the same way Bill's
 * no-fetch invariant is held.
 */

import {
  BUNDLED_CATALOGUE,
  RULES,
  claudeCodeRecords,
  comparePrompts,
  estimateTokens,
  findContradictions,
  formatUsd,
  getMessages,
  heliconeRecords,
  langsmithRecords,
  litellmRecords,
  looksLikeClaudeCodeTranscript,
  looksLikeHelicone,
  looksLikeLangsmith,
  looksLikeLiteLlm,
  looksLikeOtel,
  optimize,
  otelRecords,
  parseUsageLine,
  positionReport,
  profileUsage,
} from '@trazum/core';
import type { Locale, UsageRecord } from '@trazum/core';

import type { WebMessages } from './i18n';

export interface PlaygroundOutput {
  lines: string[];
  /** True for `clear`: the terminal empties instead of printing. */
  clear?: boolean;
}

/**
 * Every command output is computed against this fixed instant, not the
 * visitor's clock. The sample month is August 2026; `position` measured
 * against "today" would drift out of the sample's month the day after a
 * release and every figure would collapse to "nothing measured". A demo that
 * decays with the calendar is a bug, so the demo says what time it is.
 */
export const PLAYGROUND_NOW = new Date('2026-08-20T12:00:00Z');

/** A deliberately wasteful prompt, so `optimize` has something to find. */
const SAMPLE_PROMPT = `You are a support assistant for the Acme billing team.
Please kindly make sure that you always answer in a way that is very clear and
very concise. It is important to note that you should never invent an order
number. In order to resolve the ticket, first read the customer's message.
Please kindly remember to always answer clearly and concisely.
Basically, at the end of the day, you should just actually focus on the refund
policy, which is to say the rules about giving money back.
Never invent an order number.`;

/**
 * A small measured month: three workloads on two models, cache data on the
 * calls that had it — one carrying the TTL split, so the cache verdict has
 * something honest to say. All timestamps inside PLAYGROUND_NOW's month.
 */
const SAMPLE_USAGE = [
  { ts: '2026-08-03T09:12:00Z', model: 'claude-opus-5', label: 'support-rag', usage: { input_tokens: 42000, output_tokens: 1900, cache_read_input_tokens: 30000, cache_creation: { ephemeral_5m_input_tokens: 8000, ephemeral_1h_input_tokens: 0 } } },
  { ts: '2026-08-05T10:03:00Z', model: 'claude-opus-5', label: 'support-rag', usage: { input_tokens: 40100, output_tokens: 2100, cache_read_input_tokens: 33000, cache_creation: { ephemeral_5m_input_tokens: 5200, ephemeral_1h_input_tokens: 0 } } },
  { ts: '2026-08-08T16:40:00Z', model: 'claude-sonnet-5', label: 'summarise', usage: { input_tokens: 12800, output_tokens: 900 } },
  { ts: '2026-08-11T08:20:00Z', model: 'claude-sonnet-5', label: 'summarise', usage: { input_tokens: 13100, output_tokens: 840 } },
  { ts: '2026-08-12T11:55:00Z', model: 'claude-opus-5', label: 'support-rag', usage: { input_tokens: 43800, output_tokens: 2000, cache_read_input_tokens: 35500, cache_creation: { ephemeral_5m_input_tokens: 4100, ephemeral_1h_input_tokens: 0 } } },
  { ts: '2026-08-14T14:22:00Z', model: 'claude-haiku-4-5', label: 'classify', usage: { input_tokens: 2600, output_tokens: 60 } },
  { ts: '2026-08-16T09:31:00Z', model: 'claude-haiku-4-5', label: 'classify', usage: { input_tokens: 2400, output_tokens: 55 } },
  { ts: '2026-08-18T17:05:00Z', model: 'claude-sonnet-5', label: 'summarise', usage: { input_tokens: 12500, output_tokens: 910 } },
]
  .map((record) => JSON.stringify(record))
  .join('\n');

/**
 * An OTLP GenAI export: two LLM spans, one database span, and a prompt
 * attribute planted so the suite can grep every command's output and prove
 * the words stay in the span. The string below is the proof, not a secret.
 */
const SAMPLE_OTEL_PROMPT = 'sample-prompt-content-never-crosses-9a1c';
const SAMPLE_OTEL = JSON.stringify(
  {
    resourceSpans: [
      {
        resource: { attributes: [{ key: 'service.name', value: { stringValue: 'checkout-bot' } }] },
        scopeSpans: [
          {
            spans: [
              {
                name: 'chat',
                startTimeUnixNano: '1786608000000000000',
                attributes: [
                  { key: 'gen_ai.request.model', value: { stringValue: 'claude-sonnet-5' } },
                  { key: 'gen_ai.operation.name', value: { stringValue: 'chat' } },
                  { key: 'gen_ai.prompt', value: { stringValue: SAMPLE_OTEL_PROMPT } },
                  { key: 'gen_ai.usage.input_tokens', value: { intValue: '5200' } },
                  { key: 'gen_ai.usage.output_tokens', value: { intValue: '640' } },
                ],
              },
              {
                name: 'chat',
                startTimeUnixNano: '1786694400000000000',
                attributes: [
                  { key: 'gen_ai.request.model', value: { stringValue: 'claude-opus-5' } },
                  { key: 'gen_ai.operation.name', value: { stringValue: 'chat' } },
                  { key: 'gen_ai.usage.input_tokens', value: { intValue: '18100' } },
                  { key: 'gen_ai.usage.output_tokens', value: { intValue: '1200' } },
                  { key: 'gen_ai.usage.cache_read_input_tokens', value: { intValue: '9000' } },
                ],
              },
              { name: 'db.query', startTimeUnixNano: '1786608001000000000', attributes: [{ key: 'db.system', value: { stringValue: 'postgres' } }] },
            ],
          },
        ],
      },
    ],
  },
  null,
  0,
);

/** Two assistant lines of a Claude Code session, words included on purpose. */
const SAMPLE_TRANSCRIPT = [
  {
    type: 'assistant',
    timestamp: '2026-08-10T10:00:00.000Z',
    sessionId: 'sess-demo-1',
    requestId: 'req-demo-1',
    message: {
      model: 'claude-sonnet-5',
      content: [{ type: 'text', text: 'the words of the session stay in the transcript' }],
      usage: { input_tokens: 20400, output_tokens: 1450, cache_read_input_tokens: 15000 },
    },
  },
  {
    type: 'assistant',
    timestamp: '2026-08-10T10:06:00.000Z',
    sessionId: 'sess-demo-1',
    requestId: 'req-demo-2',
    message: {
      model: 'claude-sonnet-5',
      content: [{ type: 'text', text: 'and the numbers are what crosses' }],
      usage: { input_tokens: 22100, output_tokens: 1600, cache_read_input_tokens: 17500 },
    },
  },
]
  .map((line) => JSON.stringify(line))
  .join('\n');

/**
 * A LiteLLM spend log, a Helicone export and a LangSmith run export.
 *
 * **Every model in the three is deliberately not Anthropic's.** The tab used to
 * load a Claude Code transcript and an OpenTelemetry export and nothing else,
 * so a visitor reading `help` saw one vendor named and one standard, and drew
 * the obvious conclusion about what this tool is for. It reads 7 providers'
 * prices and converts 5 export formats; the samples now say so instead of
 * leaving it to the price table.
 *
 * The shapes are the ones the converters accept, taken from their own parsers
 * rather than invented: `request_id` beside the token columns for LiteLLM,
 * `request_model` and `response_model` for Helicone, `run_type` beside a trace
 * field for LangSmith.
 */
const SAMPLE_LITELLM = [
  {
    request_id: 'req-ll-1',
    model: 'gpt-5-mini',
    custom_llm_provider: 'openai',
    prompt_tokens: 18200,
    completion_tokens: 900,
    spend: 0.0072,
    cache_hit: false,
    startTime: '2026-08-11T09:00:00Z',
    metadata: { tags: ['classify'] },
    session_id: 'sess-ll-1',
  },
  {
    request_id: 'req-ll-2',
    model: 'deepseek-v3',
    custom_llm_provider: 'deepseek',
    prompt_tokens: 24500,
    completion_tokens: 1100,
    spend: 0.0069,
    cache_hit: true,
    startTime: '2026-08-11T09:14:00Z',
    metadata: { tags: ['classify'] },
    session_id: 'sess-ll-1',
  },
]
  .map((row) => JSON.stringify(row))
  .join('\n');

const SAMPLE_HELICONE = [
  {
    request_id: 'hel-1',
    request_model: 'gpt-5',
    response_model: 'gpt-5',
    prompt_tokens: 31000,
    completion_tokens: 2400,
    cache_enabled: true,
    request_created_at: '2026-08-12T11:00:00Z',
    request_properties: { label: 'summarise' },
  },
  /* The proxy answered with a different model than was asked for, which the
     converter counts rather than smoothing over: the bill rests on the model
     that answered. */
  {
    request_id: 'hel-2',
    request_model: 'gpt-5',
    response_model: 'gpt-5-mini',
    prompt_tokens: 12000,
    completion_tokens: 700,
    cache_enabled: false,
    request_created_at: '2026-08-12T11:20:00Z',
    request_properties: { label: 'summarise' },
  },
]
  .map((row) => JSON.stringify(row))
  .join('\n');

const SAMPLE_LANGSMITH = [
  {
    id: 'ls-1',
    run_type: 'llm',
    trace_id: 'trace-1',
    start_time: '2026-08-13T08:00:00Z',
    extra: { metadata: { ls_model_name: 'mistral-large-2512' } },
    tags: ['extract'],
    prompt_tokens: 9500,
    completion_tokens: 640,
    total_cost: 0.0057,
  },
  /* Not a model call. Most of a LangSmith export is chains, tools and
     retrievers, and the converter reports how many it skipped rather than
     letting a reader wonder where the runs went. */
  {
    id: 'ls-2',
    run_type: 'chain',
    trace_id: 'trace-1',
    start_time: '2026-08-13T08:00:01Z',
    tags: ['extract'],
  },
  {
    id: 'ls-3',
    run_type: 'llm',
    trace_id: 'trace-2',
    start_time: '2026-08-13T08:30:00Z',
    extra: { metadata: { ls_model_name: 'gemini-3.6-flash' } },
    tags: ['extract'],
    usage_metadata: { input_tokens: 14200, output_tokens: 880 },
  },
]
  .map((row) => JSON.stringify(row))
  .join('\n');

const SAMPLE_CONFIG = JSON.stringify({ spend: { monthlyUsd: 25 } }, null, 2);

/** The files every fresh terminal starts with. `-o` writes land beside them. */
export function createPlaygroundFiles(): Map<string, string> {
  return new Map([
    ['prompt.txt', SAMPLE_PROMPT],
    ['usage.jsonl', SAMPLE_USAGE],
    ['spans.otlp.json', SAMPLE_OTEL],
    ['transcript.jsonl', SAMPLE_TRANSCRIPT],
    ['litellm-spend.jsonl', SAMPLE_LITELLM],
    ['helicone-export.jsonl', SAMPLE_HELICONE],
    ['langsmith-runs.jsonl', SAMPLE_LANGSMITH],
    ['trazum.config.json', SAMPLE_CONFIG],
  ]);
}

/**
 * Split a command line the way a shell would, minus everything else a shell
 * is: double and single quotes group words, backslash escapes inside double
 * quotes, no expansion of any kind.
 */
export function tokenize(line: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let started = false;
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quote === '"' && ch === '\\' && i + 1 < line.length) {
      current += line[i + 1];
      i += 1;
      continue;
    }
    if (quote !== null) {
      if (ch === quote) quote = null;
      else current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      started = true;
      continue;
    }
    if (ch === ' ' || ch === '\t') {
      if (started) tokens.push(current);
      current = '';
      started = false;
      continue;
    }
    current += ch;
    started = true;
  }
  if (started) tokens.push(current);
  return tokens;
}

/** Flags for the playground's commands: value flags consume the next token. */
const VALUE_FLAGS = new Set(['max-tokens', 'out', 'o', 'level', 'config']);

interface ParsedLine {
  positional: string[];
  flags: Map<string, string | boolean>;
}

function parseTokens(tokens: string[]): ParsedLine {
  const positional: string[] = [];
  const flags = new Map<string, string | boolean>();
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (!token.startsWith('-') || token === '-') {
      positional.push(token);
      continue;
    }
    let name = token.replace(/^--?/, '');
    if (name === 'o') name = 'out';
    if (VALUE_FLAGS.has(name === 'out' ? 'out' : name) && i + 1 < tokens.length && !tokens[i + 1].startsWith('-')) {
      flags.set(name, tokens[i + 1]);
      i += 1;
    } else {
      flags.set(name, true);
    }
  }
  return { positional, flags };
}

const recordsOf = (text: string): UsageRecord[] => {
  const records: UsageRecord[] = [];
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    const parsed = parseUsageLine(line);
    if (parsed !== null) records.push(parsed);
  }
  return records;
};

/**
 * The subset of the forty commands that is pure in a browser, plus the shell
 * furniture. Everything else is CLI-only and `help` says so — the honest gap
 * this feature carries the way `from-otel` carries the missing TTL split.
 */
export const PLAYGROUND_COMMANDS = [
  'models',
  'rules',
  'optimize',
  'check',
  'profile',
  'position',
  'diff',
  'semantic',
  'from-otel',
  'from-claude-code',
  'from-litellm',
  'from-helicone',
  'from-langsmith',
] as const;

/** One line the visitor can copy for each command — `help`'s middle column. */
export const SAMPLE_INVOCATIONS: Record<(typeof PLAYGROUND_COMMANDS)[number], string> = {
  models: 'trazum models',
  rules: 'trazum rules',
  optimize: 'trazum optimize prompt.txt',
  check: 'trazum check prompt.txt --max-tokens 90',
  profile: 'trazum profile usage.jsonl',
  position: 'trazum position usage.jsonl',
  diff: 'trazum diff prompt.txt prompt.txt',
  semantic: 'trazum semantic prompt.txt',
  'from-otel': 'trazum from-otel spans.otlp.json -o converted.jsonl',
  'from-claude-code': 'trazum from-claude-code transcript.jsonl -o sessions.jsonl',
  'from-litellm': 'trazum from-litellm litellm-spend.jsonl -o converted.jsonl',
  'from-helicone': 'trazum from-helicone helicone-export.jsonl -o converted.jsonl',
  'from-langsmith': 'trazum from-langsmith langsmith-runs.jsonl -o converted.jsonl',
};

/**
 * Write the converted records to a file, or show the head of them.
 *
 * Shared by the three vendor converters because the alternative was a fourth
 * copy of the same eight lines. `from-otel` and `from-claude-code` keep their
 * own copies for now: each reports a different shape of summary above this
 * point, and collapsing all 5 would mean a parameter for every difference.
 */
function emit(
  p: WebMessages['playground'],
  records: unknown[],
  lines: string[],
  flags: Map<string, string | boolean>,
  files: Map<string, string>,
): { lines: string[] } {
  const jsonl = records.map((record) => JSON.stringify(record)).join('\n');
  const out = flags.get('out');
  if (typeof out === 'string') {
    files.set(out, jsonl);
    lines.push(p.wrote(out, records.length));
  } else if (jsonl !== '') {
    lines.push(...jsonl.split('\n').slice(0, 5));
  }
  return { lines };
}

export function runPlayground(
  line: string,
  files: Map<string, string>,
  t: WebMessages,
  locale: Locale,
): PlaygroundOutput {
  const p = t.playground;
  const tokens = tokenize(line);
  if (tokens.length === 0) return { lines: [] };
  const [head, ...rest] = tokens;

  if (head === 'clear') return { lines: [], clear: true };
  if (head === 'help') return { lines: helpLines(t) };
  if (head === 'ls') {
    return {
      lines: [...files.entries()].map(([name, text]) => `${name}  (${text.length} B)`),
    };
  }
  if (head === 'cat') {
    const name = rest[0];
    if (name === undefined) return { lines: [p.usageLine('cat <file>')] };
    const text = files.get(name);
    if (text === undefined) return { lines: [p.noSuchFile(name)] };
    return { lines: text.split('\n').slice(0, 40) };
  }

  if (head !== 'trazum') return { lines: [p.unknown(head)] };

  const command = rest[0];
  const { positional, flags } = parseTokens(rest.slice(1));

  const read = (name: string | undefined, usage: string): string | { error: string[] } => {
    if (name === undefined) return { error: [p.usageLine(usage)] };
    const text = files.get(name);
    if (text === undefined) return { error: [p.noSuchFile(name)] };
    return text;
  };

  switch (command) {
    case undefined:
    case 'help':
      return { lines: helpLines(t) };

    case 'models': {
      const lines = [p.modelsHeading];
      for (const model of BUNDLED_CATALOGUE.models) {
        lines.push(
          `${model.id.padEnd(26)} ${`$${model.inputPerMTok}/MTok in`.padEnd(16)} $${model.outputPerMTok}/MTok out`,
        );
      }
      return { lines };
    }

    case 'rules': {
      const copy = getMessages(locale).rules;
      const lines = [p.rulesHeading(RULES.length)];
      for (const rule of RULES) {
        lines.push(`${rule.id.padEnd(22)} [${rule.level}] ${copy[rule.id].title}`);
      }
      return { lines };
    }

    case 'optimize': {
      const text = read(positional[0], 'trazum optimize <file> [--level safe|aggressive]');
      if (typeof text !== 'string') return { lines: text.error };
      const level = flags.get('level') === 'aggressive' ? 'aggressive' : 'safe';
      const result = optimize(text, { level, locale });
      const lines = [
        p.optimizeTokens(result.tokensBefore, result.tokensAfter, Math.round(result.reductionPct * 10) / 10),
        ...result.rules.map((rule) => `  - ${rule.title} (x${rule.hits})`),
      ];
      if (result.advisories.length > 0) lines.push(p.optimizeAdvisories(result.advisories.length));
      lines.push(p.optimizeHonest);
      return { lines };
    }

    case 'check': {
      const text = read(positional[0], 'trazum check <file> --max-tokens <n>');
      if (typeof text !== 'string') return { lines: text.error };
      const budget = Number(flags.get('max-tokens'));
      if (!Number.isFinite(budget) || budget <= 0)
        return { lines: [p.usageLine('trazum check <file> --max-tokens <n>')] };
      const tokensIn = estimateTokens(text);
      return {
        lines: [tokensIn <= budget ? p.checkWithin(tokensIn, budget) : p.checkOver(tokensIn, budget)],
      };
    }

    case 'profile': {
      const text = read(positional[0], 'trazum profile <usage.jsonl>');
      if (typeof text !== 'string') return { lines: text.error };
      const report = profileUsage(text, { catalogue: BUNDLED_CATALOGUE, on: PLAYGROUND_NOW });
      const lines = [p.profileTotal(report.total.calls, formatUsd(report.total.totalUsd))];
      for (const entry of report.byLabel.slice(0, 5)) {
        lines.push(
          `  ${entry.label.padEnd(16)} ${String(entry.breakdown.calls).padStart(3)} calls  ${formatUsd(entry.breakdown.totalUsd)}`,
        );
      }
      if (report.byLabel.length > 5) lines.push(p.profileMore(report.byLabel.length - 5));
      return { lines };
    }

    case 'position': {
      const text = read(positional[0], 'trazum position <usage.jsonl> [--config <file>]');
      if (typeof text !== 'string') return { lines: text.error };
      const configName = typeof flags.get('config') === 'string' ? (flags.get('config') as string) : 'trazum.config.json';
      const configText = files.get(configName);
      if (configText === undefined) return { lines: [p.noSuchFile(configName)] };
      let spend: { monthlyUsd?: number } = {};
      try {
        spend = (JSON.parse(configText) as { spend?: { monthlyUsd?: number } }).spend ?? {};
      } catch {
        return { lines: [p.badConfig(configName)] };
      }
      const doc = positionReport(recordsOf(text), { spend }, { catalogue: BUNDLED_CATALOGUE, on: PLAYGROUND_NOW });
      const lines: string[] = [];
      for (const standing of doc.positions) {
        lines.push(
          p.positionRow(
            standing.scope + (standing.label !== null ? `:${standing.label}` : ''),
            formatUsd(standing.measuredUsd),
            formatUsd(standing.limitUsd),
            standing.verdict,
          ),
        );
      }
      if (doc.positions.length === 0) lines.push(...doc.cannotSay);
      if (doc.unpricedRecords > 0) lines.push(p.positionUnpriced(doc.unpricedRecords));
      return { lines };
    }

    case 'diff': {
      const before = read(positional[0], 'trazum diff <before> <after>');
      if (typeof before !== 'string') return { lines: before.error };
      const after = read(positional[1], 'trazum diff <before> <after>');
      if (typeof after !== 'string') return { lines: after.error };
      const comparison = comparePrompts(before, after, { locale });
      return {
        lines: [
          p.diffTokens(comparison.tokensBefore, comparison.tokensAfter, comparison.tokenDelta),
          p.diffMonthly(formatUsd(Math.abs(comparison.monthlyDeltaUsd)), comparison.monthlyDeltaUsd > 0),
        ],
      };
    }

    case 'semantic': {
      const text = read(positional[0], 'trazum semantic <file>');
      if (typeof text !== 'string') return { lines: text.error };
      const found = findContradictions(text);
      if (found.length === 0) return { lines: [p.semanticNone] };
      const lines = [p.semanticFound(found.length)];
      for (const contradiction of found) {
        lines.push(`  ${contradiction.axis}:`);
        lines.push(`    A: ${contradiction.a.snippet}`);
        lines.push(`    B: ${contradiction.b.snippet}`);
      }
      lines.push(p.semanticStructuralOnly);
      return { lines };
    }

    case 'from-otel': {
      const text = read(positional[0], 'trazum from-otel <file> [-o <file>]');
      if (typeof text !== 'string') return { lines: text.error };
      if (!looksLikeOtel(text)) return { lines: [p.notOtel(positional[0])] };
      const conversion = otelRecords(text);
      const jsonl = conversion.records.map((record) => JSON.stringify(record)).join('\n');
      const out = flags.get('out');
      const lines = [p.otelSummary(conversion.llmSpans, conversion.otherSpans)];
      if (conversion.noCacheData > 0) lines.push(p.otelNoCache(conversion.noCacheData));
      if (typeof out === 'string') {
        files.set(out, jsonl);
        lines.push(p.wrote(out, conversion.records.length));
      } else {
        lines.push(...jsonl.split('\n').slice(0, 5));
      }
      return { lines };
    }

    case 'from-claude-code': {
      const text = read(positional[0], 'trazum from-claude-code <file> [-o <file>]');
      if (typeof text !== 'string') return { lines: text.error };
      if (!looksLikeClaudeCodeTranscript(text)) return { lines: [p.notTranscript(positional[0])] };
      const conversion = claudeCodeRecords(text);
      const jsonl = conversion.records.map((record) => JSON.stringify(record)).join('\n');
      const out = flags.get('out');
      const lines = [p.transcriptSummary(conversion.records.length)];
      if (typeof out === 'string') {
        files.set(out, jsonl);
        lines.push(p.wrote(out, conversion.records.length));
      } else {
        lines.push(...jsonl.split('\n').slice(0, 5));
      }
      return { lines };
    }

    /*
     * The three vendor converters, each the same four steps: refuse a file that
     * is not one, convert, summarise what was skipped, and either write or show
     * the head. What differs is the count each format makes a reader owed --
     * LiteLLM's rows with no model, Helicone's substituted models, LangSmith's
     * runs that were never model calls -- and every one of them is reported
     * rather than folded into a total that looks complete.
     */
    case 'from-litellm': {
      const text = read(positional[0], 'trazum from-litellm <file> [-o <file>]');
      if (typeof text !== 'string') return { lines: text.error };
      if (!looksLikeLiteLlm(text)) return { lines: [p.notLiteLlm(positional[0])] };
      const conversion = litellmRecords(text);
      const lines = [p.litellmSummary(conversion.rows, conversion.records.length)];
      if (conversion.unnamedModel > 0) lines.push(p.rowsWithNoModel(conversion.unnamedModel));
      if (conversion.reportedSpendUsd !== null) {
        lines.push(p.reportedSpendKeptApart(conversion.reportedSpendUsd));
      }
      return emit(p, conversion.records, lines, flags, files);
    }

    case 'from-helicone': {
      const text = read(positional[0], 'trazum from-helicone <file> [-o <file>]');
      if (typeof text !== 'string') return { lines: text.error };
      if (!looksLikeHelicone(text)) return { lines: [p.notHelicone(positional[0])] };
      const conversion = heliconeRecords(text);
      const lines = [p.heliconeSummary(conversion.rows, conversion.records.length)];
      if (conversion.modelDisagreements > 0) {
        lines.push(p.modelSubstituted(conversion.modelDisagreements));
      }
      if (conversion.unnamedModel > 0) lines.push(p.rowsWithNoModel(conversion.unnamedModel));
      return emit(p, conversion.records, lines, flags, files);
    }

    case 'from-langsmith': {
      const text = read(positional[0], 'trazum from-langsmith <file> [-o <file>]');
      if (typeof text !== 'string') return { lines: text.error };
      if (!looksLikeLangsmith(text)) return { lines: [p.notLangsmith(positional[0])] };
      const conversion = langsmithRecords(text);
      const lines = [p.langsmithSummary(conversion.rows, conversion.records.length)];
      if (conversion.notModelCalls > 0) lines.push(p.notModelCalls(conversion.notModelCalls));
      if (conversion.unnamedModel > 0) lines.push(p.rowsWithNoModel(conversion.unnamedModel));
      return emit(p, conversion.records, lines, flags, files);
    }

    default:
      return { lines: [p.cliOnly(command)] };
  }
}

function helpLines(t: WebMessages): string[] {
  const p = t.playground;
  return [
    p.helpIntro,
    '',
    ...PLAYGROUND_COMMANDS.map(
      (name) => `  ${SAMPLE_INVOCATIONS[name].padEnd(52)} ${p.commandHelp[name]}`,
    ),
    '',
    `  ${'ls'.padEnd(52)} ${p.helpLs}`,
    `  ${'cat <file>'.padEnd(52)} ${p.helpCat}`,
    `  ${'clear'.padEnd(52)} ${p.helpClear}`,
    '',
    p.helpCliOnly,
  ];
}
