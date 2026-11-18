'use client';

import { ArrowLeft } from 'lucide-react';

import type { MarketingLocale } from '../../lib/marketing-locales';
import { HOME_PATH } from '../../lib/site';
import { DashboardAction } from './SiteHeader';
import { SiteFrame } from './SiteFrame';

/**
 * What an address nothing lives at gets: the site's own header and footer,
 * one sentence of what happened, the way home and the way into the
 * application. The application's move to `/app` is named, because an old
 * bookmark is the likeliest way to arrive here.
 */
export function NotFoundView({ initialLocale }: { initialLocale: MarketingLocale }) {
  return (
    <SiteFrame initialLocale={initialLocale}>
      {(_, copy) => (
        <section
          aria-labelledby="not-found-title"
          className="mx-auto w-full max-w-[1440px] px-4 py-16 sm:px-8 sm:py-24 lg:px-12 lg:py-32"
        >
          <p className="font-mono text-[13px] font-semibold tracking-[0.1em] text-terracotta uppercase">404</p>
          <h1
            id="not-found-title"
            className="mt-4 max-w-[18ch] font-display text-[clamp(40px,6.4vw,92px)] leading-[0.98] font-bold tracking-[-0.045em] text-balance"
          >
            {copy.notFoundTitle}
          </h1>
          <p className="mt-6 max-w-[56ch] border-t-2 border-foreground pt-6 text-[17px] leading-[1.65] text-muted-foreground">
            {copy.notFoundBody}
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a
              href={HOME_PATH}
              className="inline-flex min-h-12 items-center gap-2.5 border-2 border-foreground bg-background px-5 text-[16px] font-bold transition-colors hover:bg-layer-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
            >
              <ArrowLeft className="size-[18px]" aria-hidden="true" />
              {copy.notFoundHome}
            </a>
            <DashboardAction label={copy.dashboardCta} className="min-h-12 px-6 text-[16px]" />
          </div>
        </section>
      )}
    </SiteFrame>
  );
}
