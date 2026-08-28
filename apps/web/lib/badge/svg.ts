/**
 * A cost badge, as an SVG somebody can put in a README.
 *
 * Built by hand rather than pulled from a badge library, for the reason most of
 * this repository is built by hand: the output is a document served from
 * Trazum's own origin, and every byte of it should be one somebody here decided
 * to emit.
 *
 * Four rules the generated document obeys, and each is a real hazard rather than
 * a style preference:
 *
 * 1. **Everything interpolated is XML-escaped.** A badge's text is derived from
 *    stored data, and an unescaped `<` turns an image into markup. Nothing here
 *    accepts caller-supplied text without going through `escapeXml`.
 * 2. **No `<script>`, no `<foreignObject>`, no external references.** An SVG is
 *    a document, and one served from your own origin can run script when it is
 *    *navigated to* rather than embedded in an `<img>`. There is nothing here to
 *    run, and a test asserts the absence.
 * 3. **No fonts, images or stylesheets are fetched.** A badge that pulls a
 *    webfont leaks the reader of a README to whoever serves it. Font families
 *    are local names with a generic fallback.
 * 4. **Widths are computed, not guessed at render time.** SVG has no text
 *    layout, so a badge whose width does not match its content overflows or
 *    leaves a gap. The estimate is documented below and is deliberately
 *    generous.
 */

/** The five characters that can end an attribute or open a tag. */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Roughly how wide a string renders at 11px in the badge's font stack.
 *
 * SVG cannot measure text, so this is arithmetic and not truth. Digits and
 * lowercase letters are close to 6.2px; capitals and wide punctuation are
 * closer to 7.5. Rounding up on every character is deliberate — a badge that is
 * slightly too wide has a little extra padding, and one that is too narrow has
 * its last character sitting outside the coloured box.
 */
export function textWidth(text: string): number {
  let width = 0;
  for (const character of text) {
    const point = character.codePointAt(0) ?? 0;
    if (point > 0x7f) {
      // Anything outside ASCII: accented Latin, the minus sign this app prints
      // in place of a hyphen, CJK. A comparison rather than a character class,
      // because the literal spelling of that range puts raw high bytes into
      // this source file.
      width += 9;
    } else if (/[A-Z@#%&]/.test(character)) width += 7.5;
    else if (/[ijlt.,:;'!|]/.test(character)) width += 3.4;
    else width += 6.2;
  }
  return Math.ceil(width);
}

export interface BadgeParts {
  /** Left, grey. Always "trazum" unless a caller has a reason. */
  label: string;
  /** Right, coloured. The number somebody put the badge there to show. */
  message: string;
  /** Any CSS colour keyword or hex this file emits. Never caller-supplied. */
  colour: string;
}

/**
 * The colour scale, and it only has three stops on purpose.
 *
 * A gradient would imply a precision the underlying number does not have: the
 * token estimate carries a stated margin, so a badge that changed shade at 3%
 * would be reporting noise as a distinction. Green when the rules would recover
 * something worth a commit, grey when they would not, and red only when a change
 * made a prompt *more* expensive — which is the one case a reader should look at
 * twice.
 */
export function colourFor(delta: number): string {
  if (delta > 0) return '#c0392b'; // grew
  if (delta < -20) return '#2f855a'; // meaningfully smaller
  return '#6b7280'; // no material change
}

const HEIGHT = 20;
const PADDING = 6;

/**
 * The document.
 *
 * Deliberately one string with no template engine: what goes out is what is
 * written here, and a reviewer can read the whole surface in one screen.
 */
export function renderBadge({ label, message, colour }: BadgeParts): string {
  const labelWidth = textWidth(label) + PADDING * 2;
  const messageWidth = textWidth(message) + PADDING * 2;
  const total = labelWidth + messageWidth;

  const safeLabel = escapeXml(label);
  const safeMessage = escapeXml(message);
  const safeColour = escapeXml(colour);
  // The accessible name, which is what a screen reader announces and what
  // GitHub shows when images are turned off.
  const title = escapeXml(`${label}: ${message}`);

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${total}" height="${HEIGHT}"`,
    ` viewBox="0 0 ${total} ${HEIGHT}" role="img" aria-label="${title}">`,
    `<title>${title}</title>`,
    `<rect width="${labelWidth}" height="${HEIGHT}" rx="3" fill="#404040"/>`,
    // The right box is drawn from x=0 and clipped by the left one overlapping
    // it, which is how the rounded corners land on the outside only.
    `<rect x="${labelWidth}" width="${messageWidth}" height="${HEIGHT}" rx="3" fill="${safeColour}"/>`,
    `<rect x="${labelWidth}" width="4" height="${HEIGHT}" fill="${safeColour}"/>`,
    `<g fill="#ffffff" font-family="Verdana,DejaVu Sans,Geneva,sans-serif" font-size="11">`,
    // Shadow first, then the text one pixel up: the same trick every badge uses
    // to stay legible on both boxes without a second colour.
    `<text x="${labelWidth / 2}" y="14" fill="#010101" fill-opacity=".3" text-anchor="middle">${safeLabel}</text>`,
    `<text x="${labelWidth / 2}" y="13" text-anchor="middle">${safeLabel}</text>`,
    `<text x="${labelWidth + messageWidth / 2}" y="14" fill="#010101" fill-opacity=".3" text-anchor="middle">${safeMessage}</text>`,
    `<text x="${labelWidth + messageWidth / 2}" y="13" text-anchor="middle">${safeMessage}</text>`,
    `</g></svg>`,
  ].join('');
}

/**
 * Headers a badge is served with.
 *
 * `nosniff` and a `default-src 'none'` policy because this is a document served
 * from Trazum's origin. Embedded in an `<img>` nothing in it could run anyway;
 * *navigated to*, an SVG is a page, and these two headers are what make that
 * uninteresting.
 *
 * Cached, unlike everything else behind a share token. The token is in the URL,
 * so only somebody who already has the capability can construct the request —
 * and a README badge is fetched through GitHub's image proxy by every reader of
 * the page, which is not a load worth passing to the database.
 */
/**
 * How long a badge is allowed to be old, in seconds.
 *
 * One number, because two things depend on it: the header below, which is what
 * a CDN and a browser are told, and the route's memo, which is how long the
 * comparison behind a badge is reused. Typed twice, those two would drift, and
 * the drift would be invisible — a memo longer than the header serves an answer
 * the caches were told had already expired.
 */
export const BADGE_MAX_AGE_S = 300;

export const BADGE_HEADERS = {
  'content-type': 'image/svg+xml; charset=utf-8',
  'cache-control': `public, max-age=${BADGE_MAX_AGE_S}, s-maxage=${BADGE_MAX_AGE_S}`,
  'x-content-type-options': 'nosniff',
  // `frame-ancestors` is in here rather than inherited from the site-wide
  // header in `next.config.mjs`, because a config header replaces a route's
  // rather than adding to it — so this route is excluded from that rule and has
  // to carry the directive itself or go without it.
  'content-security-policy':
    "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; sandbox",
  'x-robots-tag': 'noindex',
} as const;
