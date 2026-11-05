/**
 * A usage-log line with its long strings set aside, for files too large to
 * hold whole.
 *
 * JavaScript cannot hold a string much past 512 MiB, and an agent session can
 * outgrow that: Claude Code writes every tool result into its transcript, so a
 * long session that read large files or ran chatty commands reaches hundreds
 * of megabytes. Reading such a file whole failed with "Invalid string length"
 * and took the rest of the bill down with it.
 *
 * What a converter needs from a line is short: a type, a model id, a request
 * or message id, a timestamp, a session id, a working directory and the token
 * counts. What makes a line long is content: prompts, replies, thinking, tool
 * arguments and tool results, none of which is ever billed by its length here
 * (the counts are the provider's own). So a long line is parsed, every string
 * longer than {@link SLIM_STRING_CHARS} is replaced by a marker that says how
 * long it was, and the line is written back. Numbers, booleans, keys and short
 * strings are untouched, so every converter reads the same fields it would
 * have read from the whole line.
 *
 * **A line that is not JSON is returned unchanged.** A CSV row with a long
 * quoted field is still a row; rewriting what could not be parsed would
 * corrupt it rather than shorten it.
 */

/**
 * Strings longer than this are content. PATH_MAX on Linux is 4096, so even
 * the longest working directory a label rule could match survives.
 */
export const SLIM_STRING_CHARS = 4096;

const marker = (length: number): string => `[trazum: ${length} characters not read]`;

const slim = (value: unknown, changed: { yes: boolean }): unknown => {
  if (typeof value === 'string') {
    if (value.length <= SLIM_STRING_CHARS) return value;
    changed.yes = true;
    return marker(value.length);
  }
  if (Array.isArray(value)) return value.map((item) => slim(item, changed));
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) out[key] = slim(item, changed);
    return out;
  }
  return value;
};

/**
 * The line with its content strings shortened, or the line itself when it is
 * short, is not JSON, or holds no string long enough to shorten. A line no
 * longer than {@link SLIM_STRING_CHARS} cannot hold such a string, so it is
 * returned without being parsed.
 */
export function slimUsageLine(line: string): string {
  if (line.length <= SLIM_STRING_CHARS) return line;
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return line;
  }
  const changed = { yes: false };
  const slimmed = slim(parsed, changed);
  return changed.yes ? JSON.stringify(slimmed) : line;
}
