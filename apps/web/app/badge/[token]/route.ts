import { comparePrompts } from '@trazum/core';

import { createBadgeMemo } from '../../../lib/badge/memo';
import { BADGE_HEADERS, BADGE_MAX_AGE_S, colourFor, renderBadge } from '../../../lib/badge/svg';
import { isShareToken } from '../../../lib/shares/api';
import { getStore } from '../../../lib/store';

export const runtime = 'nodejs';

/**
 * `GET /badge/:token.svg` — the cost of a shared comparison, as an image.
 *
 * The thing you put in a README so a reviewer sees what an edit did to a prompt
 * without opening anything. It rides on the share token that already exists: a
 * badge is strictly less information than the page at `/c/:token`, and inventing
 * a second capability for a smaller disclosure would have been two things to
 * revoke instead of one.
 *
 * **It always answers 200.** An unknown token, an expired one and a malformed
 * one all render the same neutral badge. Three reasons, in order of importance:
 * a non-2xx makes GitHub's image proxy show a broken image, which tells every
 * reader of the README something went wrong without saying what; the three cases
 * are ones a stranger must not be able to tell apart; and a revoked link should
 * quietly stop reporting rather than announce that it used to exist.
 *
 * **It never renders text that came from a prompt.** The message is assembled
 * from numbers this file computed. That is what makes an XML-escaped badge safe
 * rather than merely careful — `escapeXml` runs anyway, because "no untrusted
 * text reaches here" is a property somebody can break in one commit.
 *
 * **The comparison is memoised; the lookup is not.** This is the one route here
 * that is unauthenticated, embedded in documents this project does not control,
 * and expensive per hit: `comparePrompts` runs the rule engine, the estimator
 * and the advisories over two whole prompts. Fetched through an image proxy on
 * behalf of every reader of a README, that made one pasted URL an amplifier,
 * and the route's own test file already said so in prose — *"this route is the
 * one behind a CDN that anybody can hammer"* — while only the malformed-token
 * path was actually defended.
 *
 * So the comparison is computed at most once per token per `BADGE_MAX_AGE_S`,
 * which is the staleness this route already promises every cache in the header
 * it sends. `findShare` deliberately stays outside the memo, so revoking or
 * expiring a link stops the badge on the very next request rather than at the
 * end of a window — the promise two paragraphs up, kept rather than traded for
 * the cheaper implementation.
 */

const UNKNOWN = renderBadge({ label: 'trazum', message: 'unavailable', colour: '#6b7280' });

/**
 * Keyed by token, which is sound because a share is create-and-revoke: nothing
 * in `ShareStore` updates one, so a token never comes to describe different
 * prompts. Bounded, because a well-formed token that names no share is free to
 * generate and an unbounded map here would trade a CPU amplifier for a memory
 * one.
 */
const badgeFor = createBadgeMemo<string>({ ttlMs: BADGE_MAX_AGE_S * 1000, max: 2048 });

function svg(body: string): Response {
  return new Response(body, { status: 200, headers: BADGE_HEADERS });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token: raw } = await params;
  // `/badge/<token>.svg` — the extension is what makes some markdown renderers
  // and image proxies treat the URL as an image at all.
  const token = raw.endsWith('.svg') ? raw.slice(0, -4) : raw;

  if (!isShareToken(token)) return svg(UNKNOWN);

  const store = await getStore();
  const share = await store.shares.findShare(token, new Date());
  if (!share) return svg(UNKNOWN);

  // Recomputed rather than stored, like the page it belongs to. A badge is the
  // most likely thing to be looked at a year from now, and a number written
  // down at share time is the most likely thing to have quietly stopped being
  // true. "Recomputed" now means once per window rather than once per reader;
  // what a reader sees is unchanged, because the header already told every
  // cache between here and them the same thing.
  return svg(
    await badgeFor(share.token, Date.now(), async () => {
      const { settings } = share;
      const comparison = comparePrompts(share.beforeText, share.afterText, {
        level: settings.level,
        usage: {
          model: settings.model,
          callsPerMonth: settings.callsPerMonth,
          avgOutputTokens: settings.avgOutputTokens,
          cacheHitRate: settings.cacheHitRate,
          batchEligible: settings.batchEligible,
        },
        disableRules: settings.disableRules as never,
        optimizeBoth: settings.optimizeBoth,
      });

      const delta = comparison.tokenDelta;
      // Signed, always, and with the sign convention this endpoint inherits:
      // `after - before`, so a negative number is the prompt getting cheaper. A
      // bare "42" on a badge is unreadable in either direction.
      const magnitude = Math.abs(delta).toLocaleString('en-US');
      const message = delta === 0 ? 'no change' : `${delta > 0 ? '+' : '-'}${magnitude} tokens`;

      return renderBadge({ label: 'trazum', message, colour: colourFor(delta) });
    }),
  );
}
