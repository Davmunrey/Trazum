import { DOC_LOADERS } from './generated/loaders';
import type { DocData } from './types';

/**
 * One document, as the build left it, or `null` when there is no such page.
 *
 * The slug comes from the address, which a visitor writes, so it is looked up
 * as a key of what the build wrote and never as a path: `Object.hasOwn` keeps
 * `constructor` and `__proto__` from naming something that was not generated,
 * and nothing is ever read from a file in a request.
 */
export async function loadDoc(slug: string): Promise<DocData | null> {
  if (!Object.hasOwn(DOC_LOADERS, slug)) return null;
  return (await DOC_LOADERS[slug]()).default;
}
