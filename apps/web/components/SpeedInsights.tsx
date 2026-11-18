'use client';

import { type ComponentType, useEffect, useState } from 'react';

import { SPEED_INSIGHTS, type SpeedInsightsEvent, scrubSpeedInsightsEvent } from '@/lib/analytics';

type Loaded = ComponentType<{ beforeSend: (event: SpeedInsightsEvent) => SpeedInsightsEvent | null }>;

/**
 * Vercel Speed Insights, off by default.
 *
 * Only switches on when the operator builds with
 * `NEXT_PUBLIC_VERCEL_SPEED_INSIGHTS=1`. Off, this renders nothing and loads
 * nothing: `@vercel/speed-insights` is imported dynamically inside the `if`
 * below, never statically, so none of it is in what the page loads, and no
 * script is added to the page. A test fails if any file under `apps/web`
 * imports the package statically.
 *
 * On, it renders the package's component, which adds a script that Vercel
 * serves at `/_vercel/speed-insights/script.js` on the same origin. That script
 * is not in the package and was not read here, so what it sends is known only
 * from the `beforeSend` hook the package offers: a measurement carrying the
 * page's URL. Every measurement passes `scrubSpeedInsightsEvent` first, the
 * rule PostHog events use (share token replaced, query and fragment dropped),
 * and one whose URL cannot be cleaned is dropped. It only works on a Vercel
 * deployment, because the script and the endpoint it posts to exist only there.
 *
 * The Content-Security-Policy is unchanged with this on: the script is on the
 * page's own origin and is added by a script the nonce already vouches for. The
 * statement is in `middleware.ts`.
 */
export function SpeedInsights() {
  const [Component, setComponent] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!SPEED_INSIGHTS) return;
    import('@vercel/speed-insights/next')
      .then((module) => setComponent(() => module.SpeedInsights))
      .catch(() => {
        // Measurement must never break the application.
      });
  }, []);

  if (!SPEED_INSIGHTS || !Component) return null;
  return <Component beforeSend={scrubSpeedInsightsEvent} />;
}
