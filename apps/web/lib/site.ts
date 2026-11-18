/**
 * The public site's addresses: where each page lives, what the header and the
 * footer link to, and the two old addresses that now redirect.
 *
 * One list, read by the header, the footer, the application's rail, the
 * middleware and the tests, so a destination added here appears everywhere
 * that names destinations and a destination removed here disappears from all
 * of them at once. The words for each entry live in `site-copy.ts`, keyed by
 * the same ids, and its type makes a missing translation a build error.
 *
 * Only what exists today is linked. The documentation (`/docs`), the models
 * and their prices (`/models`), the roadmap and the changelog are pages of
 * this site. The brand page is coming as one too; until it exists, nothing
 * links it.
 */

/** The repository. Every public page carries a button to it. */
export const GITHUB_URL = 'https://github.com/Davmunrey/Trazum';
/** The documentation: an index at `/docs` and one page per document under it. */
export const DOCS_PATH = '/docs';
/** The repository's own `docs/` folder, where the records the site does not publish are kept. */
export const DOCS_ON_GITHUB = `${GITHUB_URL}/tree/main/docs`;
/** The models and their prices, the roadmap and the changelog: pages of the site, built from the repository's own files. */
export const MODELS_PATH = '/models';
export const ROADMAP_PATH = '/roadmap';
export const CHANGELOG_PATH = '/changelog';
/** The changelog's own file, which each release page links as its source. */
export const CHANGELOG_URL = `${GITHUB_URL}/blob/main/CHANGELOG.md`;
export const SECURITY_URL = `${GITHUB_URL}/blob/main/SECURITY.md`;
export const LICENCE_URL = `${GITHUB_URL}/blob/main/LICENSE`;
export const NPM_URL = 'https://www.npmjs.com/package/@trazum/cli';

/** Where the application lives. The landing is `/`. */
export const DASHBOARD_PATH = '/app';
export const HOME_PATH = '/';

/** The one command that works with nothing installed: the README's first. */
export const COMMAND = 'npx @trazum/cli bill';

export type SiteLinkId =
  | 'dashboard'
  | 'playground'
  | 'docs'
  | 'models'
  | 'roadmap'
  | 'github'
  | 'npm'
  | 'changelog'
  | 'security'
  | 'licence';

export interface SiteLink {
  readonly id: SiteLinkId;
  readonly href: string;
  /** Leaves this site: opens in a new tab and says so to a screen reader. */
  readonly external: boolean;
}

export const SITE_LINKS: Readonly<Record<SiteLinkId, SiteLink>> = {
  dashboard: { id: 'dashboard', href: DASHBOARD_PATH, external: false },
  playground: { id: 'playground', href: `${DASHBOARD_PATH}?tab=playground`, external: false },
  docs: { id: 'docs', href: DOCS_PATH, external: false },
  models: { id: 'models', href: MODELS_PATH, external: false },
  roadmap: { id: 'roadmap', href: ROADMAP_PATH, external: false },
  github: { id: 'github', href: GITHUB_URL, external: true },
  npm: { id: 'npm', href: NPM_URL, external: true },
  changelog: { id: 'changelog', href: CHANGELOG_PATH, external: false },
  security: { id: 'security', href: SECURITY_URL, external: true },
  licence: { id: 'licence', href: LICENCE_URL, external: true },
};

/**
 * The header's entries, in order. Add a page here and it is in the header,
 * the phone menu and the footer's first group. The dashboard and GitHub are
 * not entries: the header draws them as its two buttons.
 */
export const HEADER_ENTRIES: readonly SiteLinkId[] = ['playground', 'docs', 'models'];

export type FooterGroupId = 'product' | 'project';

/** The footer: the header's destinations, then the project's own papers. */
export const FOOTER_GROUPS: readonly { id: FooterGroupId; links: readonly SiteLinkId[] }[] = [
  { id: 'product', links: ['dashboard', ...HEADER_ENTRIES, 'npm'] },
  { id: 'project', links: ['github', 'roadmap', 'changelog', 'security', 'licence'] },
];

/** The public pages, each with its canonical path. */
export const PUBLIC_PAGES = ['landing', 'dashboard'] as const;
export type PublicPage = (typeof PUBLIC_PAGES)[number];
export const CANONICAL: Readonly<Record<PublicPage, string>> = {
  landing: HOME_PATH,
  dashboard: DASHBOARD_PATH,
};

/**
 * The addresses that are the application rather than the public site: the
 * dashboard, the operator's page, a shared comparison, and the two machine
 * surfaces. Everything else this origin serves to a person, the landing and
 * the page an unknown address gets, is the site.
 */
export const APPLICATION_PREFIXES = ['/app', '/admin', '/c', '/api', '/badge'] as const;

/**
 * Which surface an address belongs to.
 *
 * It decides one thing: the appearance a visitor gets before choosing one.
 * The public site is paper first, so a visitor whose system is dark still
 * gets the light page until they pick Dark (or System) in the header; the
 * application keeps System as its default. `DESIGN.md`, "Appearance
 * preference", records the rule and the owner's decision behind it.
 */
export function surfaceOf(pathname: string): 'site' | 'app' {
  return APPLICATION_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)) ? 'app' : 'site';
}

/**
 * Where an old address goes now, or `null` when it is not an old address.
 *
 * Two moved:
 *
 * - `/?tab=<name>` was how the README, the docs and the CLI's own output
 *   linked into a panel of the application. The application is at `/app`
 *   now, so a query with `tab` in it goes there, every parameter with it.
 * - `/landing` was the landing. It is `/` now. A `/landing` link that also
 *   names a tab goes straight to the application rather than through two
 *   redirects.
 *
 * A bare `/` is never redirected: it is the landing. Neither is `/` with a
 * query that names no tab, which is a link to the landing carrying something
 * else (a campaign tag, say).
 *
 * The target is built from the request's own origin and a path this function
 * writes, followed by the request's own query. The query is the only part a
 * visitor controls, and it starts with `?`, so it can add parameters and
 * cannot name another host: there is no open redirect to make.
 */
export function redirectFor(url: Pick<URL, 'origin' | 'pathname' | 'search' | 'searchParams'>): URL | null {
  const landing = url.pathname === '/landing';
  if (url.pathname !== HOME_PATH && !landing) return null;
  if (url.searchParams.has('tab')) return new URL(`${DASHBOARD_PATH}${url.search}`, url.origin);
  if (landing) return new URL(`${HOME_PATH}${url.search}`, url.origin);
  return null;
}
