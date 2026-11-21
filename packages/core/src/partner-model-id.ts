/**
 * A Claude model as Amazon Bedrock or Google Cloud's Vertex AI names it (#858).
 *
 * Claude Code on those platforms records the platform's id: on Bedrock a
 * cross-region inference profile such as `us.anthropic.claude-sonnet-4-6` or
 * `us.anthropic.claude-haiku-4-5-20251001-v1:0`, on Vertex `claude-sonnet-4-5@20250929`.
 * The forms are the ones Claude Code's own pages show, read 2026-11-21
 * (code.claude.com/docs/en/amazon-bedrock, .../google-vertex-ai): the profile
 * prefixes `us`, `eu`, `apac`, `jp`, `au`, `global` and `us-gov`, the
 * `anthropic.` namespace, an optional `-YYYYMMDD` and an optional `-vN:M`; and
 * Vertex's `@YYYYMMDD`.
 *
 * **Read, never priced.** Each platform sets its own prices, and the catalogue
 * carries Anthropic's. So this only says which platform and which model a
 * refused id names, so the reader can price it from the platform's page. An
 * application inference profile ARN is opaque and is not read at all.
 */

export type PartnerPlatform = 'bedrock' | 'vertex';

export interface PartnerModelId {
  platform: PartnerPlatform;
  /** The Claude model id inside, as Anthropic names it: `claude-haiku-4-5-20251001`. */
  model: string;
}

const PROFILE_PREFIXES = ['us-gov', 'us', 'eu', 'apac', 'jp', 'au', 'global'];
const DIGITS = /^\d+$/;
const WORD = /^[a-z0-9]+$/;

/**
 * A Claude id as Anthropic writes it: `claude`, then one or more hyphenated
 * words of lowercase letters and digits. Read by splitting, not by one pattern
 * with a repeated group, so no input can make it backtrack.
 */
function isClaudeId(value: string): boolean {
  const words = value.split('-');
  return words.length >= 2 && words[0] === 'claude' && words.slice(1).every((word) => WORD.test(word));
}

/** The id without a Bedrock version such as `-v1` or `-v1:0`. */
function withoutVersion(value: string): string {
  const at = value.lastIndexOf('-v');
  if (at === -1) return value;
  const [major = '', minor, ...extra] = value.slice(at + 2).split(':');
  const isVersion = extra.length === 0 && DIGITS.test(major) && (minor === undefined || DIGITS.test(minor));
  return isVersion ? value.slice(0, at) : value;
}

/** The platform and model a Bedrock or Vertex id names, or `undefined` for any other id. */
export function partnerModelId(id: string): PartnerModelId | undefined {
  // Bedrock: an optional profile prefix, the `anthropic.` namespace, the id, an optional version.
  const dot = id.indexOf('.');
  const prefix = dot === -1 ? '' : id.slice(0, dot);
  const rest = PROFILE_PREFIXES.includes(prefix) ? id.slice(dot + 1) : id;
  if (rest.startsWith('anthropic.')) {
    const model = withoutVersion(rest.slice('anthropic.'.length));
    return isClaudeId(model) ? { platform: 'bedrock', model } : undefined;
  }
  // Vertex: the id, `@`, an eight-digit date.
  const at = id.indexOf('@');
  if (at !== -1) {
    const model = id.slice(0, at);
    const date = id.slice(at + 1);
    if (isClaudeId(model) && date.length === 8 && DIGITS.test(date)) return { platform: 'vertex', model: `${model}-${date}` };
  }
  return undefined;
}
