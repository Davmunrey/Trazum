import type { MetadataRoute } from 'next';

import { SITEMAP_PATHS } from '../lib/site';
import { SITE_ORIGIN } from '../lib/site-origin';

/**
 * `/sitemap.xml`: the pages of the site that have an address of their own,
 * from `SITEMAP_PATHS` in `lib/site.ts`. One document and one release are not
 * listed one by one: each is linked from its index, which is.
 *
 * No `lastModified`: the build does not know when a page's words last changed,
 * and a date it made up would be a date a crawler trusts.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return SITEMAP_PATHS.map((path) => ({ url: new URL(path, SITE_ORIGIN).href }));
}
