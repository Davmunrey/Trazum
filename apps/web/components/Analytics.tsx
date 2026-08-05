'use client';

import { useEffect } from 'react';

/**
 * Optional analytics, off by default.
 *
 * Only switches on when the operator sets NEXT_PUBLIC_POSTHOG_KEY at build
 * time. Without a key not one byte of posthog-js is loaded (the import is
 * dynamic), no server is contacted and `track` is a no-op. Prompt content is
 * never sent: aggregate metrics only (reduction %, level, model, locale).
 */

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com';

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
