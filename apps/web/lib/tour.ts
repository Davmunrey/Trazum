/**
 * The guided tour's steps, as data — the 1.73 arc, taught to *do* in 1.76.
 *
 * Structure only: the id, the tab a step opens, the `data-tour` anchor it
 * rings (null for the steps that stand centred — the welcome and the
 * farewell), and since 1.76 the optional demo the step performs as it
 * arrives — the sample prompt optimised, the comparison run, the sample
 * month priced, a real command typed into the terminal and executed. Every
 * sentence lives in the web dictionary under `t.tour`, one title and one
 * body per step id, the same split between structure and copy the rest of
 * the app draws.
 *
 * The suite holds the joins: every non-null target here must exist as a
 * `data-tour` attribute in some component source; every id must have its
 * copy in both locales; and every `playground-run` line must actually run
 * against the sample files — executed in the test, not trusted.
 */

import type { DemoAction } from './demo';

export interface TourStep {
  id:
    | 'welcome'
    | 'optimise'
    | 'write'
    | 'compare'
    | 'bill'
    | 'playground'
    | 'playground-profile'
    | 'playground-optimize'
    | 'cli'
    | 'finish';
  /** The tab this step opens before it speaks. */
  tab: 'optimise' | 'write' | 'compare' | 'bill' | 'playground';
  /** The `data-tour` anchor to ring, or null to stand centred. */
  target: string | null;
  /** What the step does as it arrives — beyond opening its tab. */
  demo?: DemoAction;
}

export const TOUR_STEPS: readonly TourStep[] = [
  { id: 'welcome', tab: 'optimise', target: null },
  { id: 'optimise', tab: 'optimise', target: 'panel-optimise', demo: { kind: 'optimise-sample' } },
  { id: 'write', tab: 'write', target: 'panel-write' },
  { id: 'compare', tab: 'compare', target: 'panel-compare', demo: { kind: 'compare-sample' } },
  { id: 'bill', tab: 'bill', target: 'panel-bill', demo: { kind: 'bill-sample' } },
  { id: 'playground', tab: 'playground', target: 'panel-playground' },
  {
    id: 'playground-profile',
    tab: 'playground',
    target: 'panel-playground',
    demo: { kind: 'playground-run', line: 'trazum profile usage.jsonl' },
  },
  {
    id: 'playground-optimize',
    tab: 'playground',
    target: 'panel-playground',
    demo: { kind: 'playground-run', line: 'trazum optimize prompt.txt' },
  },
  {
    id: 'cli',
    tab: 'playground',
    target: 'panel-playground',
    demo: { kind: 'playground-run', line: 'trazum position usage.jsonl' },
  },
  { id: 'finish', tab: 'playground', target: null },
];

/**
 * One flag, made once: the first-visit offer was seen (started, finished or
 * dismissed — any of them). Its own key beside the locale's, and read behind
 * try/catch like every storage access in this app: a private window returns
 * nothing and the offer simply shows again, which is the right failure.
 */
export const TOUR_SEEN_KEY = 'trazum:tour-seen';
