import { headers } from 'next/headers';
import type { Metadata } from 'next';

import { Analytics } from '../components/Analytics';
import { getWebMessages, localeFromHeaders } from '../lib/i18n';
import './globals.css';

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

/**
 * Metadata follows the request's `Accept-Language`, so a crawler or a link
 * preview gets the description in a language its reader is likely to want.
 * The page below can still be switched by hand once it loads.
 */
export async function generateMetadata(): Promise<Metadata> {
  const locale = localeFromHeaders((await headers()).get('accept-language'));
  const { meta } = getWebMessages(locale);

  return {
    metadataBase: new URL(siteUrl),
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
      card: 'summary',
      title: meta.title,
      description: meta.description,
    },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = localeFromHeaders((await headers()).get('accept-language'));

  return (
    <html lang={locale}>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
