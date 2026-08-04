import type { Metadata } from 'next';

import { Analytics } from '../components/Analytics';
import './globals.css';

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

const description =
  'Reduce el coste de tus llamadas a la IA: acorta el prompt sin cambiar lo que pide y ve cuánto dinero supone al mes. Código, URLs y plantillas quedan intactos.';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'Trazum — optimizador de prompts',
    template: '%s · Trazum',
  },
  description,
  openGraph: {
    title: 'Trazum — optimizador de prompts',
    description,
    type: 'website',
    locale: 'es_ES',
    siteName: 'Trazum',
  },
  twitter: {
    card: 'summary',
    title: 'Trazum — optimizador de prompts',
    description,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
