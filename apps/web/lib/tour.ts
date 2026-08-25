/**
 * The guided tour's steps, as data — the 1.73 arc.
 *
 * Structure only: the id, the tab a step opens, and the `data-tour` anchor it
 * rings (null for the steps that stand centred — the welcome and the
 * farewell). Every sentence lives in the web dictionary under `t.tour`, one
 * title and one body per step id, the same split between structure and copy
 * the rest of the app draws.
 *
 * The suite holds the join: every non-null target here must exist as a
 * `data-tour` attribute in some component source, so a refactor cannot
 * orphan a step silently; and every id here must have its copy in both
 * locales.
 */

export interface TourStep {
  id: 'welcome' | 'optimise' | 'write' | 'compare' | 'bill' | 'playground' | 'finish';
  /** The tab this step opens before it speaks. */
  tab: 'optimise' | 'write' | 'compare' | 'bill' | 'playground';
  /** The `data-tour` anchor to ring, or null to stand centred. */
  target: string | null;
}

export const TOUR_STEPS: readonly TourStep[] = [
  { id: 'welcome', tab: 'optimise', target: null },
  { id: 'optimise', tab: 'optimise', target: 'panel-optimise' },
  { id: 'write', tab: 'write', target: 'panel-write' },
  { id: 'compare', tab: 'compare', target: 'panel-compare' },
  { id: 'bill', tab: 'bill', target: 'panel-bill' },
  { id: 'playground', tab: 'playground', target: 'panel-playground' },
  { id: 'finish', tab: 'playground', target: null },
];

/**
 * One flag, made once: the first-visit offer was seen (started, finished or
 * dismissed — any of them). Its own key beside the locale's, and read behind
 * try/catch like every storage access in this app: a private window returns
 * nothing and the offer simply shows again, which is the right failure.
 */
export const TOUR_SEEN_KEY = 'trazum:tour-seen';
