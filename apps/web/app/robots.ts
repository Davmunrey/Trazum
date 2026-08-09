import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      /**
       * `/c/` is where shared comparisons live.
       *
       * The page already sends `noindex` in its metadata, and this is the second
       * of two independent defences rather than a duplicate of the first. They
       * fail differently: `robots.txt` stops a crawler fetching the URL at all,
       * and the meta tag stops one that fetched it anyway from indexing it. A
       * share link is unlisted, not public, and one of them reaching a search
       * result publishes a prompt somebody sent to a single colleague.
       *
       * Neither is a security control — anyone with the URL can read it, which
       * is the point of the feature. Both are about the URL not spreading on its
       * own.
       */
      disallow: ['/api/', '/c/', '/admin'],
    },
  };
}
