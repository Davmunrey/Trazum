/**
 * The two checks every address in a document passes before it reaches a
 * page, written once and used twice: by `scripts/build-docs-site.mjs`, which
 * stops the build on a link that fails, and by the renderer, which draws a
 * failing one as plain text.
 *
 * A document is text this repository wrote, read at build time. Even so the
 * renderer does not trust it, because "this repository wrote it" is a claim
 * about every line of forty files and a pull request can change any of them.
 * What a link may be is decided here, not by what the file says.
 */

/** `http`, `https`, `mailto`, a fragment, or a path on this site. Nothing else. */
const HREF = /^(?:https?:\/\/[^\s]+|mailto:[^\s]+|#[^\s]*|\/(?:[^\s/\\][^\s]*)?)$/i;

/** A path on this site, and only that: an image is never loaded from a host. */
const SRC = /^\/[^\s/\\][^\s]*$/;

/**
 * Whitespace and control characters anywhere in the address, and a
 * backslash. `java\tscript:` and `/\evil.example` both get past a check
 * written for the plain spelling, because a browser strips the one and reads
 * the other as a slash.
 */
const SMUGGLING = /[\u0000- \u007f-\u009f\\]/;

/** An address a link may carry, or `null` when it must not be a link. */
export function safeHref(value: unknown): string | null {
  if (typeof value !== 'string' || SMUGGLING.test(value)) return null;
  return HREF.test(value) ? value : null;
}

/** An address an image may load from, or `null` when it must not load. */
export function safeSrc(value: unknown): string | null {
  if (typeof value !== 'string' || SMUGGLING.test(value)) return null;
  return SRC.test(value) ? value : null;
}

/** An `id` the page may carry: letters, digits, hyphen and underscore. */
export function safeId(value: unknown): string | null {
  return typeof value === 'string' && /^[\p{L}\p{N}_-]{1,200}$/u.test(value) ? value : null;
}

/** A code block's language label, or `null` when it is not a plain word. */
export function safeLang(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Za-z0-9+#_-]{1,20}$/.test(value) ? value : null;
}
