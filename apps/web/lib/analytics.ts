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

/**
 * Paths that carry a capability or an identifier. A share link's token *is*
 * the permission to read two prompts: whoever holds the URL can open it.
 */
const CAPABILITY_PATH = /\/(c|badge|api\/shares|api\/prompts)\/[^/?#]+/g;

/** The URL-shaped properties posthog-js attaches to every event on its own. */
const URL_PROPERTIES = [
  '$current_url',
  '$pathname',
  '$referrer',
  '$initial_current_url',
  '$initial_pathname',
  '$initial_referrer',
  '$session_entry_url',
  '$session_entry_pathname',
  '$session_entry_referrer',
  '$prev_pageview_pathname',
  '$prev_pageview_url',
];

/** What autocapture would have recorded about the element clicked: on-screen text and attributes. */
const ELEMENT_PROPERTIES = ['$el_text', '$elements', '$elements_chain', '$element_selectors'];

/**
 * A URL with its capability tokens replaced by the route's own name, and its
 * query and fragment dropped.
 *
 * `/c/Xy9…` becomes `/c/:token`: the event still says somebody opened a
 * shared comparison, and no longer hands the analytics provider the link
 * that opens it. The query goes because `?tab=bill&label=…` carries a
 * workload name from somebody's log. A referrer from another site keeps its
 * origin only, which is all "where did they come from" needs.
 */
export function redactUrl(value: string): string {
  const redactPath = (path: string): string => path.replace(CAPABILITY_PATH, '/$1/:token');
  try {
    const url = new URL(value);
    return `${url.origin}${redactPath(url.pathname)}`;
  } catch {
    // A bare path, as `$pathname` is.
    return redactPath(value.split(/[?#]/)[0] ?? '');
  }
}

interface AnalyticsEvent {
  properties?: Record<string, unknown>;
  $set?: Record<string, unknown>;
  $set_once?: Record<string, unknown>;
}

/**
 * The last thing every event passes through before it leaves the browser.
 *
 * The configuration in `Analytics.tsx` already turns autocapture, pageviews,
 * recordings and heatmaps off. This is the second lock, for what posthog-js
 * attaches to *every* event, the ones this app sends by name included: the
 * page's URL, the first URL of the session, the referrer. On a share page
 * each of those is the share link. So they are rewritten here, and anything
 * describing a clicked element is dropped, whichever option let it in.
 */
export function scrubAnalyticsEvent<T extends AnalyticsEvent>(event: T | null): T | null {
  if (event === null) return null;
  const scrub = (bag: Record<string, unknown> | undefined): Record<string, unknown> | undefined => {
    if (bag === undefined) return undefined;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(bag)) {
      if (ELEMENT_PROPERTIES.includes(key)) continue;
      out[key] = URL_PROPERTIES.includes(key) && typeof value === 'string' ? redactUrl(value) : value;
    }
    return out;
  };
  const properties = scrub(event.properties);
  const $set = scrub(event.$set);
  const $set_once = scrub(event.$set_once);
  return {
    ...event,
    ...(properties !== undefined ? { properties } : {}),
    ...($set !== undefined ? { $set } : {}),
    ...($set_once !== undefined ? { $set_once } : {}),
  };
}
