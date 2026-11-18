'use client';

import { useEffect, type ReactNode } from 'react';

import { useMarketingLocale } from '../marketing';
import type { MarketingLocale } from '../../lib/marketing-locales';
import { SITE_COPY, UNREVIEWED_NOTE, type SiteCopy } from '../../lib/site-copy';
import { SiteFooter } from './SiteFooter';
import { SiteHeader } from './SiteHeader';

/**
 * Every public page: the header, the page, the footer, in the site's
 * language.
 *
 * The page is a function of the locale rather than a child, because the
 * language is chosen in the header and the page has to follow it. The first
 * render uses the language the server picked from `Accept-Language`, so the
 * HTML a crawler or a slow connection gets is already in it.
 */
export function SiteFrame({
  initialLocale,
  children,
}: {
  initialLocale: MarketingLocale;
  children: (locale: MarketingLocale, copy: SiteCopy) => ReactNode;
}) {
  const [locale, setLocale] = useMarketingLocale(initialLocale);
  const copy = SITE_COPY[locale];
  const note = UNREVIEWED_NOTE[locale];

  /*
    The page says it has started once its first effects have run, as the
    application does, so a browser test can wait for a page that is listening
    rather than for a quiet network. Last on purpose: React runs a component's
    effects in the order they are written, after its children's.
  */
  useEffect(() => {
    document.documentElement.dataset.started = 'true';
  }, []);

  return (
    <div lang={locale} className="flex min-h-dvh flex-col overflow-x-clip bg-background text-foreground">
      <a
        href="#content"
        className="sr-only z-50 border-2 border-foreground bg-primary px-4 py-2 font-semibold text-primary-foreground focus:not-sr-only focus:absolute focus:top-3 focus:left-3"
      >
        {copy.skipToContent}
      </a>
      <SiteHeader copy={copy} locale={locale} onLocaleChange={setLocale} />
      {note !== '' && (
        <p className="border-b-2 border-foreground bg-warn-wash px-4 py-2.5 text-center text-[13px] leading-relaxed text-warn sm:px-8">
          {note}
        </p>
      )}
      <main id="content" className="flex-1">
        {children(locale, copy)}
      </main>
      <SiteFooter copy={copy} />
    </div>
  );
}
