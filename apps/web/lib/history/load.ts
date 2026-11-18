import { RELEASE_LOADERS } from './generated/loaders';
import type { ReleaseData } from './types';

/**
 * One release's page, as the build left it, or `null` when there is no such
 * release.
 *
 * The version comes from the address, which a visitor writes, so it is looked
 * up as a key of what the build wrote and never as a path: `Object.hasOwn`
 * keeps `constructor` and `__proto__` from naming something that was not
 * generated, and nothing is ever read from a file in a request.
 */
export async function loadRelease(version: string): Promise<ReleaseData | null> {
  if (!Object.hasOwn(RELEASE_LOADERS, version)) return null;
  return (await RELEASE_LOADERS[version]()).default;
}

/** The versions that have a page, for `generateStaticParams`. */
export function releaseVersions(): string[] {
  return Object.keys(RELEASE_LOADERS);
}
