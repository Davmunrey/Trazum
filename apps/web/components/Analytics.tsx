'use client';

import { useEffect } from 'react';

import { ANALYTICS_HOST, ANALYTICS_KEY, scrubAnalyticsEvent } from '@/lib/analytics';

/**
 * Optional analytics, off by default.
 *
 * Only switches on when the operator sets NEXT_PUBLIC_POSTHOG_KEY at build
 * time. Without a key not one byte of posthog-js is loaded (the import is
 * dynamic), no server is contacted and `track` is a no-op. Prompt content is
 * never sent: aggregate metrics only (reduction %, level, model, locale).
 *
 * **Every collector posthog-js runs by default is switched off by name.**
 * Initialised with nothing but a host, it autocaptures clicks with the text
 * and attributes of the element clicked, records a pageview with the full
 * URL, can start session recordings and heatmaps from its own dashboard, and
 * keeps an identity in a cookie. On `/c/<token>` the URL is the share link,
 * and a click records whatever text was on the button. None of that is an
 * aggregate metric, which is the only thing the README says leaves. So the
 * events this app names with `track` are the only events sent, and
 * `scrubAnalyticsEvent` rewrites the URLs posthog-js attaches to each one.
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
      .then(({ default: posthog }) =>
        posthog.init(KEY, {
          api_host: HOST,
          autocapture: false,
          capture_pageview: false,
          capture_pageleave: false,
          capture_dead_clicks: false,
          rageclick: false,
          enable_heatmaps: false,
          disable_session_recording: true,
          disable_surveys: true,
          capture_exceptions: false,
          mask_all_text: true,
          mask_all_element_attributes: true,
          // No cookie, no localStorage: an identity that lives as long as the tab.
          persistence: 'memory',
          before_send: (event) => scrubAnalyticsEvent(event),
        }),
      )
      .catch(() => {});
  }, []);
  return null;
}
