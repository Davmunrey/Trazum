/**
 * Response headers, and the reason they live here rather than in the routes.
 *
 * A route handler can set its own headers and `/badge/[token]` does. A **page**
 * cannot: in the App Router `headers()` is read-only, so `/c/<token>` — the one
 * page in this app that serves one person's prompt to a stranger — had no way to
 * send any. The result was a constant named `SHARE_HEADERS`, holding exactly the
 * headers that page should carry, applied to nothing at all, while the page's own
 * doc comment said it was `noindex` "set both here in the metadata and as an
 * `X-Robots-Tag`-shaped instruction". The metadata half was true. The header half
 * had never existed.
 *
 * So the headers are declared where they can actually be sent.
 */

/**
 * Sent on everything.
 *
 * **`frame-ancestors` and `X-Frame-Options` are the ones that were missing and
 * mattered.** This app has destructive controls behind a session — publish a
 * comparison, revoke a link, delete a prompt, sign out — and every one of them
 * was reachable inside somebody else's iframe. `SameSite=Lax` does nothing
 * about it: a framed page is same-site with itself, so its own `fetch` carries
 * the cookie exactly as it would in a tab. Both headers, because they are
 * honoured by different agents and neither is a superset of the other.
 *
 * **`no-referrer` everywhere, not just on the share page.** A share token is a
 * capability and it sits in the path, so a `Referer` leaking it hands the
 * capability to whoever received the request. Applied site-wide rather than to
 * `/c/` alone because two rules matching one path send two `Referrer-Policy`
 * headers, and which one a browser honours is not a thing to be clever about.
 * Nothing in this app links out, so the strict value costs nothing.
 *
 * **The CSP here is `frame-ancestors` only, and that is a stated limitation
 * rather than an oversight.** A `script-src` worth having needs a nonce
 * threaded through middleware, because Next's App Router serves its flight data
 * in inline `<script>` tags — a policy without one either breaks the app or
 * needs `'unsafe-inline'`, which is a policy that permits the attack it is
 * written to stop. That is a change with its own tests, not a line added here
 * on the way past.
 */
const BASELINE = [
  { key: 'x-frame-options', value: 'DENY' },
  { key: 'x-content-type-options', value: 'nosniff' },
  { key: 'referrer-policy', value: 'no-referrer' },
];

/**
 * The CSP is set separately, and `/badge/` is cut out of it, because a header
 * here **replaces** one a route handler set rather than adding to it.
 *
 * That is not what the first version of this file assumed, and the assumption
 * was wrong in the dangerous direction. `/badge/<token>` serves an SVG with
 * `default-src 'none'; style-src 'unsafe-inline'; sandbox` — the policy that
 * makes the document inert when it is *navigated to* rather than embedded in an
 * `<img>`. Adding `frame-ancestors 'none'` site-wide silently replaced it, so
 * the badge came out of the change with a weaker policy than it went in with.
 * Observed with `curl -I` against a built server; nothing in the config or the
 * types says it.
 *
 * The other three do not collide: the badge sets none of them except
 * `nosniff`, and that one to the same value.
 */
const CSP = [{ key: 'content-security-policy', value: "frame-ancestors 'none'" }];

/**
 * The share page, additionally.
 *
 * `X-Robots-Tag` alongside the `<meta name="robots">` the page already sets, and
 * the `Disallow` already in `robots.txt`: three defences that fail differently.
 * A meta tag needs the crawler to parse the HTML, a header does not, and
 * `robots.txt` stops the fetch before either is read — but only for a crawler
 * that asks for it first.
 *
 * An unlisted link that reaches a search index is a published prompt, which is
 * the one outcome this feature promises cannot happen by accident.
 *
 * `/badge/<token>` is not listed here even though it is behind the same token:
 * it is a route handler, it already sets its own `X-Robots-Tag`, and a second
 * rule matching it would send the header twice. One owner per header.
 */
const NO_INDEX = {
  key: 'x-robots-tag',
  value: 'noindex, nofollow, noarchive, nosnippet',
};

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The core ships as ESM with types; Next transpiles it alongside the app.
  transpilePackages: ['@trazum/core'],

  async headers() {
    return [
      { source: '/:path*', headers: BASELINE },
      // Everything except the badge, which carries a stricter policy of its own.
      { source: '/((?!badge/).*)', headers: CSP },
      { source: '/c/:token', headers: [NO_INDEX] },
    ];
  },
};

export default nextConfig;
