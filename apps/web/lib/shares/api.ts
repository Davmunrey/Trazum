import { RULES, listModels } from '@trazum/core';

import { mintToken } from '../auth/session';
import { DEFAULT_SHARE_TTL, SHARE_TTL_DAYS } from '../store/shares';
import type { ShareSettings, ShareTtl } from '../store/shares';

/**
 * Turning a request body into a share, and a token into a URL.
 *
 * The validation here is not politeness. The settings a share stores are read
 * back later and handed to `comparePrompts`, so anything this function lets
 * through becomes configuration that runs on every future view — by a reader who
 * did not choose it and cannot see it. So the parse is a whitelist that produces
 * a fully-populated object, never a merge over what arrived.
 */

/** Same cap as the compare endpoint: a share stores what that endpoint accepts. */
export const MAX_SHARE_PROMPT_CHARS = 400_000;

/**
 * The token, from the same generator that mints session cookies.
 *
 * 32 bytes of CSPRNG. It is the only thing standing between a stranger and the
 * prompt, so it is not a short id, not a slug and not derived from the content.
 */
export function mintShareToken(): string {
  return mintToken();
}

/** Tokens are base64url from `randomBytes(32)`: 43 characters, no padding. */
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

export function isShareToken(value: string): boolean {
  return TOKEN.test(value);
}

export function shareUrl(publicUrl: string, token: string): string {
  return `${publicUrl}/c/${token}`;
}

export function expiryFor(ttl: ShareTtl, now: Date): Date | null {
  const days = SHARE_TTL_DAYS[ttl];
  return days === null ? null : new Date(now.getTime() + days * 86_400_000);
}

export function parseTtl(raw: unknown): ShareTtl | null {
  if (raw === undefined || raw === null) return DEFAULT_SHARE_TTL;
  if (typeof raw !== 'string') return null;
  return raw in SHARE_TTL_DAYS ? (raw as ShareTtl) : null;
}

function clamp(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * A settings object built from known keys only.
 *
 * Clamped rather than rejected for the numeric fields, because a share is made
 * from whatever the Compare tab happened to hold and refusing the whole link
 * over a call volume of −1 helps nobody. The model and the rule ids *are*
 * rejected, because both are identifiers the core looks up and a silent fallback
 * would price the comparison against something the sharer did not pick.
 */
export function parseSettings(raw: unknown): { value: ShareSettings } | { error: string } {
  const input = (raw ?? {}) as Record<string, unknown>;

  const model = typeof input.model === 'string' ? input.model : listModels()[0]!.id;
  if (!listModels().some((m) => m.id === model)) {
    return { error: `unknown model: ${model}` };
  }

  const disableRules = Array.isArray(input.disableRules)
    ? input.disableRules.filter((id): id is string => typeof id === 'string')
    : [];
  const unknownRule = disableRules.find((id) => !RULES.some((rule) => rule.id === id));
  if (unknownRule) return { error: `unknown rule: ${unknownRule}` };

  return {
    value: {
      // Anything that is not the literal string is `safe`, matching how every
      // other endpoint in this app reads this field.
      level: input.level === 'aggressive' ? 'aggressive' : 'safe',
      optimizeBoth: input.optimizeBoth === true,
      disableRules,
      model,
      callsPerMonth: Math.round(clamp(input.callsPerMonth, 10_000, 0, 1_000_000_000)),
      avgOutputTokens: Math.round(clamp(input.avgOutputTokens, 300, 0, 1_000_000)),
      cacheHitRate: clamp(input.cacheHitRate, 0, 0, 1),
      batchEligible: input.batchEligible === true,
    },
  };
}

/**
 * The headers a shared page carries are declared in `next.config.mjs`, not here.
 *
 * There used to be a `SHARE_HEADERS` constant at this spot holding exactly the
 * right three, and it was applied to nothing. It could not have been: `/c/<token>`
 * is a page, and in the App Router a page cannot set a response header —
 * `headers()` is read-only. The constant read as a defence, was tested as a
 * constant, and sent nothing.
 *
 * `next.config.mjs` is where a page's headers can actually be sent from, so that
 * is where they live: `no-referrer` site-wide because the token is in the path,
 * and `X-Robots-Tag` on `/c/:token` because an unlisted link that reaches a
 * search index is a published prompt.
 */
