/**
 * The address this deployment is reached at, for what has to be absolute: the
 * metadata base the layout gives Next, and the sitemap's entries.
 *
 * Read once, at build, from the environment the operator sets; a local build
 * says `localhost`. The layout read the same three lines itself until the
 * sitemap needed the same answer, and two copies of it could disagree.
 */
export const SITE_ORIGIN =
  process.env.NEXT_PUBLIC_SITE_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
