import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: 'Trazum — optimizador de prompts',
  description:
    'Reduce el coste de tus llamadas a la IA acortando el prompt sin cambiar lo que pide.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
