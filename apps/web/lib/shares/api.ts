import { MAX_INPUT_CHARS, listModels } from '@trazum/core';

import { mintToken } from '../auth/session';
import { SHARE_SETTINGS, saySettings } from '../body-schemas';
import { getWebMessages } from '../i18n';
import { check } from '../schema';
import type { Infer } from '../schema';
import { SHARE_TTL_DAYS } from '../store/shares';
import type { ShareSettings, ShareTtl } from '../store/shares';

/**
 * Turning a checked request body into a share, and a token into a URL.
 *
 * The validation behind it is not politeness. The settings a share stores are read
 * back later and handed to `comparePrompts`, so anything this function lets
 * through becomes configuration that runs on every future view — by a reader who
 * did not choose it and cannot see it. So the parse is a whitelist that produces
 * a fully-populated object, never a merge over what arrived.
 */

/** Same cap as the compare endpoint: a share stores what that endpoint accepts. */
export const MAX_SHARE_PROMPT_CHARS = MAX_INPUT_CHARS;

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

/**
 * A settings object built from known keys only, by `SHARE_SETTINGS` in
 * `lib/body-schemas.ts`, then filled with the Compare tab's own defaults.
 *
 * Clamped rather than rejected for the numeric fields, because a share is made
 * from whatever the Compare tab happened to hold and refusing the whole link
 * over a call volume of −1 helps nobody; the schema says so in as many words.
 * Everything else that does not fit is refused: the model and the rule ids are
 * identifiers the core looks up, and a silent fallback would price the
 * comparison against something the sharer did not pick.
 */
export function settingsFrom(input: Infer<typeof SHARE_SETTINGS> | undefined): ShareSettings {
  const settings = input ?? {};
  return {
    level: settings.level ?? 'safe',
    optimizeBoth: settings.optimizeBoth === true,
    disableRules: settings.disableRules ?? [],
    model: settings.model ?? listModels()[0]!.id,
    callsPerMonth: Math.round(settings.callsPerMonth ?? 10_000),
    avgOutputTokens: Math.round(settings.avgOutputTokens ?? 300),
    cacheHitRate: settings.cacheHitRate ?? 0,
    batchEligible: settings.batchEligible === true,
  };
}

/** The settings object on its own, as the badge and the tests build one. */
export function parseSettings(raw: unknown): { value: ShareSettings } | { error: string } {
  const checked = check(SHARE_SETTINGS, raw ?? {});
  if (!checked.ok) return { error: saySettings(checked.issue, 0) ?? getWebMessages('en').api.badInput(checked.issue) };
  return { value: settingsFrom(checked.value) };
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
