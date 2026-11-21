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
/** A Claude id as Anthropic writes it: lowercase letters, digits and single hyphens. */
const CLAUDE_ID = /^claude(?:-[a-z0-9]+)+$/;
const VERSION_SUFFIX = /-v\d+(?::\d+)?$/;
const VERTEX_DATE = /^\d{8}$/;

/** The platform and model a Bedrock or Vertex id names, or `undefined` for any other id. */
export function partnerModelId(id: string): PartnerModelId | undefined {
  // Bedrock: an optional profile prefix, the `anthropic.` namespace, the id, an optional version.
  const dot = id.indexOf('.');
  const prefix = dot === -1 ? '' : id.slice(0, dot);
  const rest = PROFILE_PREFIXES.includes(prefix) ? id.slice(dot + 1) : id;
  if (rest.startsWith('anthropic.')) {
    const model = rest.slice('anthropic.'.length).replace(VERSION_SUFFIX, '');
    return CLAUDE_ID.test(model) ? { platform: 'bedrock', model } : undefined;
  }
  // Vertex: the id, `@`, an eight-digit date.
  const at = id.indexOf('@');
  if (at !== -1) {
    const model = id.slice(0, at);
    const date = id.slice(at + 1);
    if (CLAUDE_ID.test(model) && VERTEX_DATE.test(date)) return { platform: 'vertex', model: `${model}-${date}` };
  }
  return undefined;
}
