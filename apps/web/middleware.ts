import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { analyticsConnectSrc } from '@/lib/analytics';

/**
 * A Content-Security-Policy with a real `script-src`, which needs a nonce, which
 * needs middleware.
 *
 * Until now the policy was `frame-ancestors 'none'` and nothing else — honest,
 * and stated as a limitation rather than dressed up as a policy. `frame-ancestors`
 * stops clickjacking and does nothing about script injection, so React's escaping
 * was the only thing between an XSS and full exploitation.
 *
 * **Why it could not be done in `next.config.mjs`.** A policy is only worth
 * having if it excludes inline script, and the App Router serves its flight data
 * in inline `<script>` tags. A static header must therefore either allow
 * `'unsafe-inline'` — which permits precisely the attack the policy is written
 * to stop — or break the app. The third option is a value that differs per
 * response, and a config header is one string for every response.
 *
 * So: a nonce per request. Next reads the CSP off the *request* headers and
 * stamps the same nonce onto every script it emits, which is why the header is
 * set on the request as well as the response. Set it on the response alone and
 * the policy is correct and the page is blank.
 */

/**
 * 128 bits, base64. `crypto.randomUUID` would be tidier and is the wrong tool:
 * a UUID is 122 bits with six of them fixed, and a nonce that an attacker can
 * predict is a nonce that lets them sign their own injection.
 */
function nonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

/**
 * The badge is excluded, and that is not an oversight.
 *
 * `/badge/<token>.svg` sets `default-src 'none'; sandbox` on its own — strictly
 * tighter than anything here, because it is an image with no script at all. A
 * middleware policy would replace it with a looser one, which is the same
 * regression this repository already made once by adding `frame-ancestors`
 * site-wide and silently overwriting that route's policy.
 */
export const config = {
  matcher: ['/((?!badge/|_next/static/|_next/image|favicon.ico).*)'],
};

export function middleware(request: NextRequest) {
  const value = nonce();

  /**
   * `strict-dynamic` is what makes this survive a Next upgrade.
   *
   * Without it, every script Next loads has to be enumerated by URL, and the
   * chunk names change on every build. With it, a script the nonce vouches for
   * may load the chunks it needs, and nothing else may. `'self'` and `https:`
   * are there for browsers that do not implement `strict-dynamic`, which ignore
   * it — they get the weaker policy rather than none.
   *
   * `'unsafe-eval'` only outside production: the dev server compiles with it and
   * shipping it would hand back most of what the policy buys.
   */
  const dev = process.env.NODE_ENV !== 'production';

  /**
   * One host, and only when the operator asked for it.
   *
   * `connect-src 'self'` alone was wrong the moment it shipped: `Analytics.tsx`
   * posts to PostHog, so an operator who set `NEXT_PUBLIC_POSTHOG_KEY` got a
   * page that rendered perfectly and sent nothing, with the reason visible only
   * in the browser console. No test caught it, because the key is unset in CI
   * and in development — the configuration where it breaks is the one nothing
   * exercises.
   *
   * With no key the policy is byte-for-byte what it was. `analyticsConnectSrc`
   * returns an origin rather than the configured string, so this cannot become
   * a way to inject a directive through an environment variable.
   */
  const analytics = analyticsConnectSrc();

  const policy = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${value}' 'strict-dynamic' https:${dev ? " 'unsafe-eval'" : ''}`,
    // Next inlines critical CSS, and there is no nonce path for it. This is the
    // one concession, and it is the cheap one: `style-src` cannot execute.
    `style-src 'self' 'unsafe-inline'`,
    // Avatars come from GitHub, and `data:` covers the inlined icon.
    `img-src 'self' data: https://avatars.githubusercontent.com`,
    `font-src 'self'`,
    // The app talks to its own origin, plus analytics when it is switched on. An
    // exfiltration channel opened by an injected script is what this line closes,
    // so every addition to it is one more place a stolen prompt could go.
    `connect-src 'self'${analytics ? ` ${analytics}` : ''}`,
    `frame-ancestors 'none'`,
    `form-action 'self'`,
    `base-uri 'self'`,
    `object-src 'none'`,
  ].join('; ');

  const headers = new Headers(request.headers);
  headers.set('x-nonce', value);
  // On the request too. This is the part that is easy to miss and impossible to
  // notice from the header alone: it is how Next learns the nonce to stamp on
  // its own inline scripts.
  headers.set('content-security-policy', policy);

  const response = NextResponse.next({ request: { headers } });
  response.headers.set('content-security-policy', policy);
  return response;
}
