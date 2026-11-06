/**
 * The shapes a usage file arrives in, told apart from the file's own text.
 *
 * The CLI's `bill` and the web app's Bill tab are the same door, and they
 * used to keep their own copies of this: which shapes exist, and which
 * command explains a shape's left-out rows. Both copies built that command
 * as `from-${shape}`, and both sent people to `trazum from-anthropic-usage`,
 * which answers "Unknown command". One copy here, so a shape added next year
 * is named the same way in both places.
 */

import { looksLikeAnthropicCost } from './anthropic-cost.js';
import { looksLikeAnthropicUsage } from './anthropic-usage.js';
import { looksLikeBatchResults } from './batch-results.js';
import { looksLikeClaudeCodeTranscript } from './claude-code.js';
import { looksLikeCodexTranscript } from './codex.js';
import { looksLikeGeminiCliSession } from './gemini-cli.js';
import { looksLikeHelicone } from './helicone.js';
import { looksLikeLangsmith } from './langsmith.js';
import { looksLikeLiteLlm } from './litellm.js';
import { looksLikeOpenaiCost } from './openai-cost.js';
import { looksLikeOpenaiUsage } from './openai-usage.js';
import { looksLikeOpenrouterActivity } from './openrouter-activity.js';
import { looksLikeOtel } from './otel.js';
import { parseUsageLine } from './usage.js';

/** The shapes `bill` can tell apart from a file's own text. */
export type UsageShape =
  | 'claude-code'
  | 'codex'
  | 'gemini-cli'
  | 'otel'
  | 'litellm'
  | 'helicone'
  | 'langsmith'
  | 'anthropic-usage'
  | 'openai-usage'
  | 'batch-results'
  | 'openrouter'
  | 'usage-log';

/**
 * The CLI command that converts each shape on its own, and so says why rows
 * were left out. Null where none exists: batch results only `bill` reads, and
 * a usage log needs no converting. A pointer to a command that does not exist
 * is worse than none, so the CLI's tests run every one of these.
 */
export const SHAPE_COMMAND: Readonly<Record<UsageShape, string | null>> = {
  'claude-code': 'from-claude-code',
  codex: 'from-codex',
  'gemini-cli': 'from-gemini-cli',
  otel: 'from-otel',
  litellm: 'from-litellm',
  helicone: 'from-helicone',
  langsmith: 'from-langsmith',
  'anthropic-usage': 'from-anthropic',
  'openai-usage': 'from-openai',
  'batch-results': null,
  openrouter: 'from-openrouter',
  'usage-log': null,
};

/**
 * The first line with anything on it, found without splitting a file that
 * may be hundreds of megabytes into an array of every line.
 */
export function firstLineOf(text: string): string | undefined {
  let start = 0;
  while (start < text.length) {
    const newline = text.indexOf('\n', start);
    const end = newline === -1 ? text.length : newline;
    const line = text.slice(start, end);
    if (line.trim() !== '') return line;
    start = end + 1;
  }
  return undefined;
}

/**
 * Which shapes claim a text. Every detector is asked, not the first that
 * says yes: a file two shapes claim is a file nobody should convert, because
 * whichever one was picked would be a guess wearing a result's clothes.
 *
 * A plain usage log has no signature but its own lines, so it is claimed
 * only when nothing else is and its first line parses as a usage line.
 */
export function usageShapesOf(text: string): UsageShape[] {
  const claims: UsageShape[] = [];
  if (looksLikeCodexTranscript(text)) claims.push('codex');
  if (looksLikeGeminiCliSession(text)) claims.push('gemini-cli');
  if (looksLikeClaudeCodeTranscript(text)) claims.push('claude-code');
  if (looksLikeOtel(text)) claims.push('otel');
  if (looksLikeAnthropicUsage(text)) claims.push('anthropic-usage');
  if (looksLikeOpenaiUsage(text)) claims.push('openai-usage');
  if (looksLikeBatchResults(text)) claims.push('batch-results');
  if (looksLikeOpenrouterActivity(text)) claims.push('openrouter');
  if (looksLikeHelicone(text)) claims.push('helicone');
  if (looksLikeLangsmith(text)) claims.push('langsmith');
  if (looksLikeLiteLlm(text)) claims.push('litellm');
  if (claims.length > 0) return claims;
  const first = firstLineOf(text);
  if (first !== undefined && parseUsageLine(first) !== null) claims.push('usage-log');
  return claims;
}

/** The coding agents whose sessions convert to a usage log. */
export const AGENT_SHAPES: readonly UsageShape[] = ['claude-code', 'codex', 'gemini-cli'];

/**
 * Why a text handed to something that reads a usage log is not one.
 *
 * - `shape`: one shape claims it; `command` is the CLI converter, or null.
 * - `ambiguous`: more than one claims it, so nobody should convert it.
 * - `cost-report`: a provider's bill, which is not usage at all.
 */
export type NotAUsageLog =
  | { kind: 'shape'; shape: Exclude<UsageShape, 'usage-log'>; command: string | null }
  | { kind: 'ambiguous'; shapes: UsageShape[] }
  | { kind: 'cost-report' };

/**
 * Whether a text meant as a usage log is something else, and what.
 *
 * Every door that reads one usage log (the CLI's `profile` and its kin, the
 * MCP server's tools, the local HTTP API) read a Claude Code session as a
 * log whose every line was unreadable, and answered "no usage records". That
 * reads as a broken file. This names what the text is, so each door can
 * point at what reads it, in its own words.
 *
 * Null when the first line with anything on it is a usage line, so a usage
 * log pays one parsed line for the question, and null when nothing claims
 * the text, whose unreadable lines are then counted where they always were.
 */
export function notAUsageLog(text: string): NotAUsageLog | null {
  const first = firstLineOf(text);
  if (first === undefined || parseUsageLine(first) !== null) return null;
  const claims = usageShapesOf(text).filter(
    (shape): shape is Exclude<UsageShape, 'usage-log'> => shape !== 'usage-log',
  );
  const [only] = claims;
  if (claims.length === 1 && only !== undefined) return { kind: 'shape', shape: only, command: SHAPE_COMMAND[only] };
  if (claims.length > 1) return { kind: 'ambiguous', shapes: claims };
  if (looksLikeAnthropicCost(text) || looksLikeOpenaiCost(text)) return { kind: 'cost-report' };
  return null;
}
