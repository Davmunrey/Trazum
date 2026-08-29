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
 * **There is no CSP in this list any more.** It was `frame-ancestors` only for
 * a while, stated as a limitation rather than dressed up as a policy, because a
 * `script-src` worth having needs a nonce and a nonce cannot come from a static
 * header. `middleware.ts` sets the whole policy now, per request.
 */
/**
 * How long a browser is told to refuse plain HTTP for this host.
 *
 * One year, which is the value the header is worth having at. Shorter and the
 * window between visits is a window an attacker can strip TLS in; the whole
 * point is that a returning visitor never makes an HTTP request at all.
 *
 * **It is irreversible for that year on any browser that saw it**, which is why
 * the number is here with a reason rather than inline. Serving this host over
 * plain HTTP again means waiting the year out or reaching every visitor.
 */
const HSTS_MAX_AGE_SECONDS = 31_536_000;

/**
 * `includeSubDomains`, and no `preload`.
 *
 * **`includeSubDomains` is in**, because without it a subdomain is a way back
 * in: an attacker who can answer for `anything.<host>` over HTTP can set a
 * cookie the parent will send. The cost is real and is stated rather than
 * discovered — it binds *every* subdomain, including ones that do not exist
 * yet, so a future `status.<host>` or a vendor page that only speaks HTTP is
 * unreachable until the max-age expires.
 *
 * **`preload` is deliberately absent.** It is not a header flag with an effect;
 * it is consent to be added to a list compiled into browsers, and removal takes
 * months and reaches users only as they update. That is a decision for whoever
 * owns the domain, made once, knowingly — not something a config file should
 * take on their behalf. Adding it here would also be a claim this repository
 * has not earned: the list requires a submission nobody has made.
 *
 * **What this could not check from where it was written.** Whether the host
 * this currently deploys to is already covered by somebody else's preload
 * entry, in which case the header changes nothing today. The registry that
 * answers that is unreachable from the environment this was written in, so it
 * is not asserted either way. The header is correct regardless: it costs
 * nothing if the host is already pinned, and it is the whole defence on a
 * custom domain, which is the case it is really for.
 */
const HSTS = {
  key: 'strict-transport-security',
  value: `max-age=${HSTS_MAX_AGE_SECONDS}; includeSubDomains`,
};

/**
 * HSTS is sent in production only.
 *
 * Not caution for its own sake: `next dev` serves plain HTTP, and a browser
 * that accepts this header for a development hostname pins it — which breaks
 * every other project served over HTTP on that name, for a year, on that
 * developer's machine. Chrome special-cases `localhost`, but a LAN address or a
 * `.local` name is not special-cased, and "it worked on my laptop" is how that
 * one gets found.
 *
 * A browser ignores the header over plain HTTP anyway, so this is belt and
 * braces on the wire and a real difference to anyone running the app on a name
 * that resolves.
 */
const BASELINE = [
  { key: 'x-frame-options', value: 'DENY' },
  { key: 'x-content-type-options', value: 'nosniff' },
  { key: 'referrer-policy', value: 'no-referrer' },
  ...(process.env.NODE_ENV === 'production' ? [HSTS] : []),
];

/** Exported so the test can assert the value and the gating separately. */
export const SECURITY_HEADERS = { HSTS, HSTS_MAX_AGE_SECONDS };

/**
 * There is no CSP here any more, and its absence is the design.
 *
 * A policy worth having excludes inline script, and the App Router serves its
 * flight data in inline `<script>` tags — so a static header must either allow
 * `'unsafe-inline'`, which permits the attack the policy exists to stop, or
 * break the app. The value has to differ per response, and a config header is
 * one string for every response.
 *
 * `middleware.ts` sets it now, with a per-request nonce, and excludes
 * `/badge/` for the reason this file learned the hard way: a header set here
 * **replaces** one a route handler set rather than adding to it. Adding
 * `frame-ancestors 'none'` site-wide silently replaced the badge's
 * `default-src 'none'; sandbox` — the policy that makes that SVG inert when it
 * is navigated to — and the badge came out of a security change weaker than it
 * went in. Observed with `curl -I`; nothing in the config or the types says it.
 *
 * The three below do not collide: the badge sets none of them except `nosniff`,
 * and that one to the same value.
 */

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

  /**
   * A self-contained server for the container image. `standalone` makes
   * `next build` emit `.next/standalone` with only the modules the server
   * actually imports — the difference between shipping this app and shipping
   * this app plus the whole workspace's node_modules. Local `next dev` and
   * `next start` are unaffected.
   *
   * Conditional on purpose: Vercel's own build pipeline does its own file
   * tracing and breaks against `standalone` (ENOENT on
   * `.next/next-server.js.nft.json`, found by deploying). Vercel sets
   * `VERCEL=1` in every build, so the flag applies exactly where the
   * container image is built — Docker, N0, a local standalone preview —
   * and nowhere it fights the platform.
   */
  ...(process.env.VERCEL ? {} : { output: 'standalone' }),

  /**
   * Next sends `x-powered-by: Next.js` on every response unless told not to.
   *
   * Found by **observing** a deployed response rather than by reading this
   * file, which is the whole point the header tests make about themselves:
   * declared is one step short of sent, and the gap runs in both directions --
   * something can be missing that was never declared, too.
   *
   * It is not a vulnerability. It is free reconnaissance: it names the
   * framework and therefore the shape of every advisory worth trying, on every
   * response, to everybody. Removing it costs nothing and is not a defence
   * either -- fingerprinting a Next app takes one look at the markup. It goes
   * because there is no reason for it to stay.
   */
  poweredByHeader: false,

  async headers() {
    return [
      { source: '/:path*', headers: BASELINE },
      { source: '/c/:token', headers: [NO_INDEX] },
    ];
  },
};

export default nextConfig;
