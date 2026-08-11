'use client';

import { useEffect } from 'react';

import { ANALYTICS_HOST, ANALYTICS_KEY } from '@/lib/analytics';

/**
 * Optional analytics, off by default.
 *
 * Only switches on when the operator sets NEXT_PUBLIC_POSTHOG_KEY at build
 * time. Without a key not one byte of posthog-js is loaded (the import is
 * dynamic), no server is contacted and `track` is a no-op. Prompt content is
 * never sent: aggregate metrics only (reduction %, level, model, locale).
 *
 * The key and the host come from `lib/analytics` rather than from `process.env`
 * here, because the Content-Security-Policy has to name the same host and the
 * two read the environment independently exactly once — after which the policy
 * blocked the requests this file makes.
 */

const KEY = ANALYTICS_KEY;
const HOST = ANALYTICS_HOST;

export function track(event: string, properties?: Record<string, unknown>): void {
  if (!KEY) return;
  import('posthog-js')
    .then(({ default: posthog }) => posthog.capture(event, properties))
    .catch(() => {
      // Analytics must never break the application.
    });
}

export function Analytics() {
  useEffect(() => {
    if (!KEY) return;
    import('posthog-js')
      .then(({ default: posthog }) => posthog.init(KEY, { api_host: HOST }))
      .catch(() => {});
  }, []);
  return null;
}
