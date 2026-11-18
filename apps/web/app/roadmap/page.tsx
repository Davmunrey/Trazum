import { headers } from 'next/headers';
import type { Metadata } from 'next';

import { DocBody } from '../../components/docs/DocBody';
import { RoadmapPage } from '../../components/history/RoadmapPage';
import roadmap from '../../lib/history/generated/roadmap';
import { marketingLocaleFromHeader } from '../../lib/marketing-locales';
import { roadmapMetadata } from '../../lib/site-metadata';

/**
 * `/roadmap`: the milestones in order, and what is under consideration.
 *
 * Both come from files of the repository, read when the site is built
 * (`scripts/build-site-pages.mjs`): `.github/milestones.json` for the order
 * and `ROADMAP.md` for what is not scheduled. Nothing is fetched from GitHub
 * in a request, and nothing the visitor sends reaches the renderer.
 */
export async function generateMetadata(): Promise<Metadata> {
  return roadmapMetadata(marketingLocaleFromHeader((await headers()).get('accept-language')));
}

export default async function Roadmap() {
  const locale = marketingLocaleFromHeader((await headers()).get('accept-language'));
  return (
    <RoadmapPage
      initialLocale={locale}
      milestones={roadmap.milestones}
      hasConsideration={roadmap.hasConsideration}
      consideration={<DocBody blocks={roadmap.consideration} />}
    />
  );
}
