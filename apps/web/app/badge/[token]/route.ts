import { comparePrompts } from '@trazum/core';

import { BADGE_HEADERS, colourFor, renderBadge } from '../../../lib/badge/svg';
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
 */

const UNKNOWN = renderBadge({ label: 'trazum', message: 'unavailable', colour: '#6b7280' });

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

  // Recomputed on every render, like the page it belongs to. A badge is the
  // most likely thing to be looked at a year from now, and a stored number is
  // the most likely thing to have quietly stopped being true.
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

  return svg(renderBadge({ label: 'trazum', message, colour: colourFor(delta) }));
}
