/**
 * Where analytics is configured, in one place, because two places drifted.
 *
 * `Analytics.tsx` decides whether to load posthog-js and which host to send to.
 * `middleware.ts` decides which hosts the browser is permitted to reach. Those
 * are the same fact, and when they were written separately they disagreed
 * immediately: the CSP said `connect-src 'self'` while the component posted to
 * `https://eu.i.posthog.com`, so switching analytics on produced a page that
 * looked fine and silently sent nothing.
 *
 * Neither file reads `process.env` for this any more. Change the default here
 * and both move together.
 */

/** Analytics is off unless the operator sets this. Off is the default. */
export const ANALYTICS_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;

const DEFAULT_HOST = 'https://eu.i.posthog.com';

export const ANALYTICS_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? DEFAULT_HOST;

/**
 * The origin to name in `connect-src`, or `null` when there is nothing to add.
 *
 * Returns an *origin*, never the configured string. A CSP is built by joining
 * text with `;`, so a host of `evil.test; script-src *` would not widen
 * `connect-src` — it would append a directive of the attacker's choosing and
 * silently replace the one above it. `new URL()` parses it and `.origin`
 * discards path, query and anything after them, which is also all a CSP host
 * source is allowed to be.
 *
 * Anything that does not parse, or is not https, yields `null`: a policy that
 * cannot be built correctly is not widened at all. That fails towards analytics
 * being blocked rather than towards a policy nobody can read.
 */
export function analyticsConnectSrc(
  key: string | undefined = ANALYTICS_KEY,
  host: string = ANALYTICS_HOST,
): string | null {
  if (!key) return null;
  try {
    const url = new URL(host);
    if (url.protocol !== 'https:') return null;
    return url.origin;
  } catch {
    return null;
  }
}
