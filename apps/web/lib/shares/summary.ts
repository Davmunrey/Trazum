import type { PromptComparison } from '@trazum/core';

import { createBadgeMemo } from '../badge/memo';

/**
 * What `/c/:token` shows of a comparison: numbers and rule ids, never text.
 *
 * The page used to run `comparePrompts` over both prompts on every view. A
 * share may hold up to `MAX_INPUT_CHARS` characters a side, and at that size
 * one comparison took 982 ms (median of three runs, 400,000 characters a side,
 * Node 22.23.4 on four cores, 2026-11-21; 13 ms at 4,580). The page allows 120
 * views a minute per address, so one address reloading one large share inside
 * that limit could fill the only thread of a standalone server.
 *
 * The page now remembers this summary per token and language for ten minutes,
 * per instance. What that changes, and what it does not:
 *
 * - **It holds no prompt.** The reason a memo was refused here before was that
 *   it would keep somebody's prompt in process memory for the whole window.
 *   This keeps five numbers and a list of rule ids, built by `summaryOf` below,
 *   and a test holds that the text of either prompt never reaches it.
 * - **Revocation and expiry are still immediate.** `findShare` runs on every
 *   view before the memo is asked, exactly as on the badge.
 * - **A link is still priced by the rules of the day it is opened,** give or
 *   take ten minutes. The page recomputes once the window has passed.
 * - **A share never changes,** so the same token never needs a different
 *   answer inside the window: shares are create-and-revoke.
 */
export type ShareSummary = Pick<PromptComparison, 'tokensBefore' | 'tokensAfter' | 'tokenDelta' | 'deltaPct' | 'monthlyDeltaUsd'> & {
  rules: Pick<PromptComparison['rules'], 'newlyFiring'>;
};

/** The fields the page shows, copied one by one so nothing else rides along. */
export function summaryOf(comparison: PromptComparison): ShareSummary {
  return {
    tokensBefore: comparison.tokensBefore,
    tokensAfter: comparison.tokensAfter,
    tokenDelta: comparison.tokenDelta,
    deltaPct: comparison.deltaPct,
    monthlyDeltaUsd: comparison.monthlyDeltaUsd,
    rules: { newlyFiring: [...comparison.rules.newlyFiring] },
  };
}

/** How long a summary is kept before the page computes it again. */
export const SHARE_SUMMARY_WINDOW_MS = 10 * 60_000;
/** The most summaries one instance keeps, so a stream of tokens cannot grow it. */
export const MAX_SHARE_SUMMARIES = 500;

export const shareSummaries = createBadgeMemo<ShareSummary>({ ttlMs: SHARE_SUMMARY_WINDOW_MS, max: MAX_SHARE_SUMMARIES });

/**
 * Thrown inside the memo when the viewer's address has spent the engine
 * budget, so the page says to wait instead of computing.
 *
 * The memo bounds repeat views of one link, not views of many: an address
 * cycling through more links than the memo holds would miss every time. So
 * a miss is charged to the same per-address budget `/api/compare` charges
 * (`lib/engine-budget.ts`), by the characters it is about to compare. A
 * refusal is not memoised (`lib/badge/memo.ts`), so the next view after the
 * window computes as usual.
 */
export class EngineBusy extends Error {
  constructor() {
    super('the engine budget for this address is spent');
    this.name = 'EngineBusy';
  }
}
