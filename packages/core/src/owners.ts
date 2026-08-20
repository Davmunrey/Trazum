/**
 * Whose budget — the question that decides whether anything on the list gets
 * done.
 *
 * The fleet answered *which service* in 1.37. Nobody has answered *whose
 * money*, and until somebody does, every finding this product makes lands on a
 * desk with no name on it. A report that says "the bill is $40,000 and here is
 * how to save $9,000" is read by four people who each assume it is one of the
 * other three's problem.
 *
 * ## The unallocated is its own line, and it is never spread
 *
 * The one rule worth breaking the module over.
 *
 * Splitting unattributed spend proportionally across the owners you *do* know
 * is the single most common lie in cost reporting. It is attractive because it
 * makes the numbers add up and every line look complete. What it actually does
 * is make **every team's figure wrong**, by an amount nobody can see, in a
 * direction nobody can check — and it does it most to the teams with the
 * cleanest instrumentation, because they are the ones whose known spend is
 * largest and who therefore absorb the biggest share of somebody else's
 * mystery.
 *
 * So the unallocated stays a line of its own, with its own dollar figure, until
 * a human claims it. It is loud on purpose: an unallocated share that grows
 * quietly is a chargeback report becoming fiction one month at a time.
 *
 * ## Shared cost is declared, never inferred
 *
 * A workload two teams use is split by a rule somebody wrote down, and **the
 * rule travels with the report**. That is the whole design: the argument then
 * happens about the rule — "why is search 60/40?" — rather than about the
 * number, which is an argument nobody can win because nobody can see where the
 * number came from.
 *
 * A split that does not sum to one is a configuration error and not a rounding
 * problem, because the alternative is silently losing or inventing money.
 *
 * ## An owner with no measured data is not an owner under budget
 *
 * `fleetBudgetMissing`, from 1.37, applied to people. A team whose logs never
 * arrived passes every budget it has, forever, and a report that renders that
 * as a green tick has told somebody the opposite of the truth.
 */

import { mostSpecificMatch } from './glob.js';
import { UNLABELLED } from './usage.js';

/** How one workload's spend is divided between owners. Sums to 1. */
export type SharedSplit = Record<string, number>;

export interface OwnersConfig {
  /** Label patterns per owner. Most specific wins, as everywhere in this tool. */
  patterns: Record<string, string[]>;
  /**
   * Workloads two or more owners share, split by a rule a human wrote.
   *
   * Keyed by the exact label rather than by a pattern: a shared split is a
   * negotiated fact about one workload, and letting it match a glob would mean
   * a new label silently joining somebody's bill.
   */
  shared?: Record<string, SharedSplit>;
  /** Monthly budgets per owner, in dollars. */
  budgets?: Record<string, number>;
}

export type OwnerProblem =
  | { kind: 'split-does-not-sum'; label: string; total: number }
  | { kind: 'split-names-unknown-owner'; label: string; owner: string }
  | { kind: 'split-has-one-owner'; label: string; owner: string }
  | { kind: 'budget-for-unknown-owner'; owner: string }
  | { kind: 'negative-share'; label: string; owner: string; share: number };

/**
 * Everything wrong with an ownership config, before any money is attributed.
 *
 * Returned rather than thrown, so all of it can be reported at once. A
 * chargeback config fixed one error per run is a chargeback config somebody
 * abandons halfway and then never trusts.
 */
export function validateOwners(config: OwnersConfig): OwnerProblem[] {
  const problems: OwnerProblem[] = [];
  const known = new Set(Object.keys(config.patterns));

  for (const [label, split] of Object.entries(config.shared ?? {})) {
    const entries = Object.entries(split);
    if (entries.length === 1) {
      // A "shared" workload with one owner is a pattern written the long way,
      // and reading it as a share invites a second one to be added without the
      // first being adjusted.
      problems.push({ kind: 'split-has-one-owner', label, owner: entries[0]?.[0] ?? '' });
    }
    let total = 0;
    for (const [owner, share] of entries) {
      if (!known.has(owner)) problems.push({ kind: 'split-names-unknown-owner', label, owner });
      if (share < 0) problems.push({ kind: 'negative-share', label, owner, share });
      total += share;
    }
    /**
     * Summing to one, within a hair for floating point.
     *
     * Not a rounding problem to be normalised away: a split that sums to 0.9
     * loses a tenth of that workload's money and a split that sums to 1.1
     * invents a tenth. Both are silent, and both are the kind of error a
     * chargeback report exists to make impossible.
     */
    if (entries.length > 0 && Math.abs(total - 1) > 1e-9) {
      problems.push({ kind: 'split-does-not-sum', label, total });
    }
  }

  for (const owner of Object.keys(config.budgets ?? {})) {
    if (!known.has(owner)) problems.push({ kind: 'budget-for-unknown-owner', owner });
  }

  return problems;
}

/** One workload's spend, as the caller measured it. */
export interface LabelSpend {
  label: string;
  usd: number;
  calls: number;
}

export type OwnerVerdict = 'within' | 'over' | 'not-measured' | 'no-budget';

export interface OwnerLine {
  owner: string;
  usd: number;
  calls: number;
  /** Which labels landed here, and how — so the attribution is checkable. */
  from: Array<{ label: string; usd: number; via: 'pattern' | 'shared'; share?: number }>;
  budgetUsd: number | null;
  verdict: OwnerVerdict;
}

export interface Allocation {
  owners: OwnerLine[];
  /**
   * Spend that matched no owner — its own line, never spread.
   *
   * `labels` names them, because "unallocated: $4,300" invites somebody to
   * divide it and "unallocated: $4,300 across `search-v2` and `internal-eval`"
   * invites somebody to claim it.
   */
  unallocated: { usd: number; calls: number; labels: string[] };
  /** The shared rules that were applied, carried so the report can print them. */
  sharedApplied: Array<{ label: string; split: SharedSplit }>;
  problems: OwnerProblem[];
}

export function allocate(spend: readonly LabelSpend[], config: OwnersConfig): Allocation {
  const problems = validateOwners(config);
  const lines = new Map<string, OwnerLine>();
  const ensure = (owner: string): OwnerLine => {
    let line = lines.get(owner);
    if (line === undefined) {
      const budgetUsd = config.budgets?.[owner] ?? null;
      line = { owner, usd: 0, calls: 0, from: [], budgetUsd, verdict: 'no-budget' };
      lines.set(owner, line);
    }
    return line;
  };

  /**
   * Every declared owner gets a line, measured or not.
   *
   * An owner absent from the report is an owner nobody looks at, and the
   * refusal below — "not measured is not under budget" — cannot be printed for
   * somebody who is not on the page.
   */
  for (const owner of Object.keys(config.patterns)) ensure(owner);

  const unallocatedLabels: string[] = [];
  let unallocatedUsd = 0;
  let unallocatedCalls = 0;

  // Flattened so specificity decides across owners, as `assignSources` does.
  const patterns: Array<{ pattern: string; owner: string }> = [];
  for (const [owner, globs] of Object.entries(config.patterns)) {
    for (const pattern of globs) patterns.push({ pattern, owner });
  }
  const sharedApplied: Allocation['sharedApplied'] = [];
  const brokenSplits = new Set(
    problems
      .filter((p) => p.kind === 'split-does-not-sum' || p.kind === 'negative-share')
      .map((p) => (p as { label: string }).label),
  );

  for (const entry of spend) {
    const split = config.shared?.[entry.label];
    /**
     * A broken split allocates **nothing**, and the workload falls to
     * unallocated.
     *
     * Applying a split that sums to 0.9 would put ten per cent of that
     * workload nowhere while every line still looked complete. Falling to
     * unallocated puts the whole workload somewhere visible, next to the
     * problem that explains it.
     */
    if (split !== undefined && !brokenSplits.has(entry.label)) {
      sharedApplied.push({ label: entry.label, split });
      for (const [owner, share] of Object.entries(split)) {
        const line = ensure(owner);
        line.usd += entry.usd * share;
        line.calls += entry.calls * share;
        line.from.push({ label: entry.label, usd: entry.usd * share, via: 'shared', share });
      }
      continue;
    }

    const matched =
      entry.label === UNLABELLED
        ? null
        : mostSpecificMatch(
            patterns.map((p) => p.pattern),
            entry.label,
          );
    const owner = matched === null ? null : patterns.find((p) => p.pattern === matched)?.owner ?? null;

    if (owner === null) {
      unallocatedUsd += entry.usd;
      unallocatedCalls += entry.calls;
      unallocatedLabels.push(entry.label);
      continue;
    }
    const line = ensure(owner);
    line.usd += entry.usd;
    line.calls += entry.calls;
    line.from.push({ label: entry.label, usd: entry.usd, via: 'pattern' });
  }

  for (const line of lines.values()) {
    line.from.sort((a, b) => b.usd - a.usd);
    /**
     * `not-measured` rather than `within`, and they are different words on
     * purpose.
     *
     * A team whose logs never arrived passes every budget it has, forever. A
     * report that renders that as a green tick has told somebody the opposite
     * of the truth — the 1.37 refusal, applied to people rather than services.
     */
    line.verdict =
      line.budgetUsd === null
        ? 'no-budget'
        : line.calls === 0
          ? 'not-measured'
          : line.usd > line.budgetUsd
            ? 'over'
            : 'within';
  }

  return {
    owners: [...lines.values()].sort((a, b) => b.usd - a.usd),
    unallocated: {
      usd: unallocatedUsd,
      calls: unallocatedCalls,
      labels: [...new Set(unallocatedLabels)].sort(),
    },
    sharedApplied,
    problems,
  };
}
