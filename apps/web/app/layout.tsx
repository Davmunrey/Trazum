import { headers } from 'next/headers';
import type { Metadata } from 'next';

import { SITE_ORIGIN } from '../lib/site-origin';
import { THEME_BOOTSTRAP } from '../lib/theme';
import { Analytics } from '../components/Analytics';
import { SpeedInsights } from '../components/SpeedInsights';
import { getWebMessages, localeFromHeaders } from '../lib/i18n';
import { marketingLocaleFromHeader } from '../lib/marketing-locales';
import './globals.css';


/**
 * Metadata follows the request's `Accept-Language`, so a crawler or a link
 * preview gets the description in a language its reader is likely to want.
 * The page below can still be switched by hand once it loads.
 */
export async function generateMetadata(): Promise<Metadata> {
  const locale = localeFromHeaders((await headers()).get('accept-language'));
  const { meta } = getWebMessages(locale);

  return {
    metadataBase: new URL(SITE_ORIGIN),
    title: {
      default: meta.title,
      template: '%s · Trazum',
    },
    description: meta.description,
    openGraph: {
      title: meta.title,
      description: meta.description,
      type: 'website',
      locale: meta.ogLocale,
      siteName: 'Trazum',
    },
    twitter: {
      // `summary_large_image` now that there is one: the card the app ships is
      // 1200x630 and a `summary` crop throws two thirds of it away.
      card: 'summary_large_image',
      title: meta.title,
      description: meta.description,
    },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const requestHeaders = await headers();
  // The middleware says which surface the address is; the theme bootstrap and
  // the stylesheet read it so the public site is light until a visitor chooses.
  const surface = requestHeaders.get('x-trazum-surface') === 'site' ? 'site' : 'app';
  // The site speaks five languages and the tool two, so each surface reads the
  // header with its own list. Read with the tool's, a French page went out as
  // `lang="en"` (#862).
  const acceptLanguage = requestHeaders.get('accept-language');
  const locale = surface === 'site' ? marketingLocaleFromHeader(acceptLanguage) : localeFromHeaders(acceptLanguage);

  return (
    <html lang={locale} data-surface={surface} suppressHydrationWarning>
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: the script is a constant written in this repository and carries the request's nonce; nothing a visitor sends reaches it */}
        <script nonce={requestHeaders.get('x-nonce') ?? undefined} dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body>
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
