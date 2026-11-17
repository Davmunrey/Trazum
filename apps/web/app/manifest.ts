import type { MetadataRoute } from 'next';

import { getWebMessages } from '../lib/i18n';

/**
 * The web manifest: the name and the icons a phone or a browser uses when
 * somebody keeps this page.
 *
 * Until this existed `/manifest.webmanifest` answered 404, and adding the app
 * to a home screen saved a screenshot of the page under whatever the browser
 * could make of the title. The icons are the T of `icon.svg`, written by
 * `scripts/draw-icon.mjs` into `public/`; `icons.test.mjs` holds every entry
 * here to a file of the size it claims.
 *
 * `display: 'browser'` is deliberate. `standalone` would promise an installed
 * app, with no address bar and something useful offline, and this is a web
 * page that needs its server for everything behind a sign-in. The manifest
 * names and draws the shortcut; it claims nothing else.
 *
 * The colours are the paper of the light theme, which is what the page paints
 * before anybody has chosen otherwise.
 */
export default function manifest(): MetadataRoute.Manifest {
  const { meta } = getWebMessages('en');
  return {
    name: 'Trazum',
    short_name: 'Trazum',
    description: meta.description,
    start_url: '/',
    display: 'browser',
    background_color: '#f6f4ec',
    theme_color: '#f6f4ec',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
