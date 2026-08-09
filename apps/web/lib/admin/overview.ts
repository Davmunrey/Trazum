import { optimize } from '@trazum/core';

import type { PromptCensus } from '../store/prompts';

/**
 * What the deployment's prompts add up to.
 *
 * The honest version of "aggregate spending across the org", and the gap between
 * those two phrasings is the whole design of this file.
 *
 * **Trazum does not know what anybody spent.** It has never seen a bill, an API
 * call or a token counter — it reads prompt text and estimates. A dashboard
 * headed "spend" would be inventing a number nobody can reconcile against an
 * invoice, and this repository's rule is that a figure a reader cannot reproduce
 * by hand does not get printed.
 *
 * So the headline figure is **tokens**, which is a property of the prompt alone
 * and needs no assumption about anything. Dollars appear only against a call
 * volume the admin types in and can see on screen, labelled as the hypothetical
 * it is.
 *
 * The second thing it reports is the one worth acting on: **how many of those
 * tokens the rules would remove.** That is measured by running the rules, not by
 * a heuristic, which is the same standard `trazum rank` is held to.
 */

export interface PromptRow {
  id: string;
  name: string;
  ownerLogin: string;
  versionCount: number;
  tokensBefore: number;
  tokensAfter: number;
  /** `before - after`, so positive means the rules would remove this many. */
  recoverable: number;
  updatedAt: string;
}

export interface Overview {
  accounts: number;
  prompts: number;
  /** Prompts actually measured. Differs from `prompts` when the cap bit. */
  measured: number;
  truncated: boolean;
  tokensBefore: number;
  tokensAfter: number;
  recoverable: number;
  /** Per account, biggest first. */
  byAccount: { login: string; prompts: number; tokens: number; recoverable: number }[];
  /** The prompts worth an afternoon, biggest recoverable first. */
  top: PromptRow[];
}

/** How many rows the dashboard lists. The totals always cover everything measured. */
export const TOP_ROWS = 20;

export function buildOverview(census: PromptCensus, topRows = TOP_ROWS): Overview {
  const rows: PromptRow[] = census.entries.map((entry) => {
    /**
     * The rules are run, not modelled, and the counts come back with them.
     *
     * Both numbers are taken from the one `optimize` call rather than measured
     * separately with `estimateTokens`. Counting the two sides independently is
     * how a total ends up disagreeing with the per-prompt figures it is the sum
     * of — the core already did the arithmetic and it is the same arithmetic
     * every other surface in Trazum prints.
     *
     * There is deliberately no complexity score here. A number nobody can
     * reproduce by hand is a number nobody can argue with, and an admin who
     * cannot argue with a ranking will not act on it.
     */
    const result = optimize(entry.latestText);

    return {
      id: entry.id,
      name: entry.name,
      ownerLogin: entry.ownerLogin,
      versionCount: entry.versionCount,
      tokensBefore: result.tokensBefore,
      tokensAfter: result.tokensAfter,
      recoverable: result.tokensSaved,
      updatedAt: entry.updatedAt.toISOString(),
    };
  });

  const byAccount = new Map<string, { login: string; prompts: number; tokens: number; recoverable: number }>();
  for (const row of rows) {
    const bucket = byAccount.get(row.ownerLogin) ?? {
      login: row.ownerLogin,
      prompts: 0,
      tokens: 0,
      recoverable: 0,
    };
    bucket.prompts += 1;
    bucket.tokens += row.tokensBefore;
    bucket.recoverable += row.recoverable;
    byAccount.set(row.ownerLogin, bucket);
  }

  const sum = (pick: (row: PromptRow) => number) => rows.reduce((total, row) => total + pick(row), 0);

  return {
    accounts: census.totalAccounts,
    prompts: census.totalPrompts,
    measured: rows.length,
    // Reported, never hidden. A total that silently described the first five
    // hundred prompts of eight hundred would read as "the whole deployment".
    truncated: rows.length < census.totalPrompts,
    tokensBefore: sum((row) => row.tokensBefore),
    tokensAfter: sum((row) => row.tokensAfter),
    recoverable: sum((row) => row.recoverable),
    byAccount: [...byAccount.values()].sort((a, b) => b.tokens - a.tokens),
    top: [...rows].sort((a, b) => b.recoverable - a.recoverable).slice(0, topRows),
  };
}
