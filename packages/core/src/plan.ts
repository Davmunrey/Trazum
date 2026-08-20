/**
 * Not a list of findings — a ranked, costed, non-additive plan of what to do.
 *
 * The report names findings; a person then decides what to do first by doing
 * arithmetic in their head, and head-arithmetic on savings gets done by
 * *adding* them — which the levers module has documented as wrong since it
 * shipped ($12.60 plus $10.50 against a $21.00 slice). This module does the
 * composition once, correctly, and attaches to every action the things the
 * log cannot confirm, because a plan that hides its assumptions is advice
 * pretending to be arithmetic.
 *
 * **Everything here is derived from figures the report already computed.**
 * Route and batch come from `billLevers` (combined, never summed). The
 * truncation action's stake is the retry bill `truncationRetries` measured.
 * The cache action's stake is `cacheEconomics`' own delta. Nothing is
 * invented, and each action carries how to check the part that is not
 * arithmetic.
 *
 * **The total is stated honestly.** Actions on *different* slices add
 * cleanly; the one composition that does not add — route and batch on the
 * same slice — arrives already combined inside a single action, so the
 * plan's total is a sum of non-overlapping figures by construction. Measured
 * stakes (money already spent on retries, money already lost to caching) are
 * totalled separately from projected savings: "what you would save" and
 * "what you already paid" are different columns, and merging them makes a
 * number that is neither.
 */

import { UNLABELLED, cacheEconomics } from './usage.js';
import type { UsageProfileReport } from './usage.js';
import type { BillLevers } from './levers.js';

export type PlanActionKind = 'route' | 'batch' | 'route+batch' | 'fix-truncation' | 'fix-caching';

/**
 * What the log cannot confirm, as data rather than prose.
 *
 * Rendering lives with whoever renders — the CLI localizes these, and 1.39's
 * verification can match them structurally. An English sentence baked in here
 * would be a browser-safe module deciding the reader's language.
 */
export type PlanAssumption =
  /** The cheaper model can actually do this work — quality, not arithmetic. */
  | { kind: 'model-capability'; model: string }
  /** These calls tolerate a batch window's latency. */
  | { kind: 'batch-window' }
  /** The truncation-retry pairing is real — the log sees shapes, not content. */
  | { kind: 'retry-pattern-real' }
  /** A max_tokens the answers fit inside removes the retry pair. */
  | { kind: 'max-tokens-fits' }
  /** The traffic pattern holds — a cache underwater on this log may pay on other traffic. */
  | { kind: 'traffic-pattern-holds' };

export interface PlanAction {
  kind: PlanActionKind;
  /** The workload this acts on. `UNLABELLED` renders as the unlabelled bucket. */
  label: string;
  model: string;
  /**
   * Projected saving per the log's own period, for route/batch — or null for
   * the measured-stake actions, whose money is in `stakeUsd` instead. Never
   * both: a projection and a measurement in one field is a number that is
   * neither.
   */
  savingUsd: number | null;
  /**
   * Money already measured against this problem — the retry bill, the cache
   * loss. Null for the projected actions.
   */
  stakeUsd: number | null;
  /** What the log cannot confirm. Every entry is a human's question to answer. */
  assumes: PlanAssumption[];
  /** How to check the assumption, when a Trazum command can. */
  check: string | null;
  /** What this action does, in one machine-stable keyword per detail. */
  detail: {
    /** Route target, when the action moves the calls. */
    routeTo?: { id: string; displayName: string };
    /** The measured pieces behind a stake. */
    measured?: Record<string, number>;
    /**
     * The slice as it was when the plan was made — what a later verification
     * compares the newer log against. Without this the plan is a prediction
     * with no record of the world it was made in, and "calls doubled" could
     * never be told from "the prediction was wrong".
     */
    baseline?: { calls: number; usd: number; inputPerCallTokens: number; outputPerCallTokens: number };
  };
}

export interface PlanDocument {
  /** Same contract discipline as the profile JSON. */
  schemaVersion: 1;
  /** The period the plan's figures cover, or null when the log had no clock. */
  span: { fromMs: number; toMs: number } | null;
  /** The price table behind every dollar here. */
  pricingLastReviewed: string;
  /** Ranked: largest money first, projected or staked alike. */
  actions: PlanAction[];
  /**
   * Projected savings summed — additive by construction, because same-slice
   * compositions arrive pre-combined in one action.
   */
  projectedSavingUsd: number;
  /** Measured stakes summed: money already paid to problems this plan names. */
  measuredStakeUsd: number;
  /** The bill the plan was made against. */
  totalUsd: number;
}

/**
 * Builds the plan from a report and its levers.
 *
 * `pricingLastReviewed` is passed in rather than imported so the plan records
 * the catalogue that actually priced it — an overlay's date when one was in
 * effect, which 1.39's verification needs to tell "the prediction was wrong"
 * from "the prices changed".
 */
export function buildPlan(
  report: UsageProfileReport,
  levers: BillLevers,
  pricingLastReviewed: string,
): PlanDocument {
  const actions: PlanAction[] = [];

  /** The slice as the plan saw it, recorded so verification has a "before". */
  const baselineOf = (label: string, model: string) => {
    const slice = report.byLabelAndModel.find((s) => s.label === label && s.model === model);
    if (slice === undefined || slice.breakdown.calls === 0) return undefined;
    const b = slice.breakdown;
    return {
      calls: b.calls,
      usd: b.totalUsd,
      inputPerCallTokens: (b.inputTokens + b.cacheReadTokens + b.cacheWriteTokens) / b.calls,
      outputPerCallTokens: b.outputTokens / b.calls,
    };
  };

  for (const slice of levers.slices) {
    const assumes: PlanAssumption[] = [];
    let kind: PlanActionKind;
    if (slice.route !== null && slice.batch !== null) {
      kind = 'route+batch';
      assumes.push({ kind: 'model-capability', model: slice.route.candidate.displayName });
      assumes.push({ kind: 'batch-window' });
    } else if (slice.route !== null) {
      kind = 'route';
      assumes.push({ kind: 'model-capability', model: slice.route.candidate.displayName });
    } else if (slice.batch !== null) {
      kind = 'batch';
      assumes.push({ kind: 'batch-window' });
    } else {
      continue;
    }
    actions.push({
      kind,
      label: slice.label,
      model: slice.model,
      savingUsd: slice.combinedUsd,
      stakeUsd: null,
      assumes,
      check: slice.route !== null ? 'trazum route <log> --prompt-file <prompt> --cases <cases>' : null,
      detail: {
        ...(slice.route !== null ? { routeTo: slice.route.candidate } : {}),
        baseline: baselineOf(slice.label, slice.model),
      },
    });
  }

  for (const row of report.truncationRetries) {
    actions.push({
      kind: 'fix-truncation',
      label: row.label,
      model: row.model,
      savingUsd: null,
      stakeUsd: row.wastedUsd + row.retryUsd,
      assumes: [{ kind: 'retry-pattern-real' }, { kind: 'max-tokens-fits' }],
      check: null,
      detail: {
        measured: {
          wastedUsd: row.wastedUsd,
          retryUsd: row.retryUsd,
          retried: row.retried,
          truncatedCalls: row.truncatedCalls,
        },
        baseline: baselineOf(row.label, row.model),
      },
    });
  }

  for (const slice of report.byLabelAndModel) {
    const economics = cacheEconomics(slice.breakdown);
    // Only a settled loss becomes an action: an unsettled verdict is a
    // missing field, and "add the field" is the report's advice, not a plan's.
    if (economics.verdict !== 'lost-money' || economics.worstCaseVerdict !== economics.verdict) continue;
    actions.push({
      kind: 'fix-caching',
      label: slice.label,
      model: slice.model,
      savingUsd: null,
      stakeUsd: economics.deltaUsd,
      assumes: [{ kind: 'traffic-pattern-holds' }],
      check: null,
      detail: {
        measured: {
          spentUsd: economics.spentUsd,
          withoutCachingUsd: economics.withoutCachingUsd,
        },
        baseline: baselineOf(slice.label, slice.model),
      },
    });
  }

  actions.sort(
    (a, b) => (b.savingUsd ?? b.stakeUsd ?? 0) - (a.savingUsd ?? a.stakeUsd ?? 0),
  );

  return {
    schemaVersion: 1,
    span: report.span === null ? null : { fromMs: report.span.fromMs, toMs: report.span.toMs },
    pricingLastReviewed,
    actions,
    projectedSavingUsd: actions.reduce((sum, a) => sum + (a.savingUsd ?? 0), 0),
    measuredStakeUsd: actions.reduce((sum, a) => sum + (a.stakeUsd ?? 0), 0),
    totalUsd: report.total.totalUsd,
  };
}

/** Renders `UNLABELLED` for humans without leaking the sentinel. */
export function planLabelName(label: string, unlabelled: string): string {
  return label === UNLABELLED ? unlabelled : label;
}

/**
 * Every action kind a plan may carry, as a value.
 *
 * Exported because the validator below needs to reject a kind nobody wrote,
 * and a second hand-maintained copy of this list is how a kind added in one
 * place stops being accepted in the other.
 */
export const PLAN_ACTION_KINDS: readonly PlanActionKind[] = [
  'route',
  'batch',
  'route+batch',
  'fix-truncation',
  'fix-caching',
];

/** Why a file is not a plan, in a shape a caller can render in its own words. */
export type PlanParseFailure =
  | { kind: 'not-json' }
  | { kind: 'not-an-object' }
  | { kind: 'wrong-schema-version'; found: unknown }
  | { kind: 'actions-not-a-list' }
  | { kind: 'action-malformed'; index: number; because: string };

export type PlanParseResult =
  | { ok: true; plan: PlanDocument & { createdAt?: string } }
  | { ok: false; why: PlanParseFailure };

/**
 * Reads a `plan.json` back, or says exactly why it is not one.
 *
 * **One validator, because there were two and they were not the same.** The
 * CLI checked `schemaVersion === 1 && Array.isArray(actions)` inline and
 * nothing more — which accepts a file whose `actions` are arbitrary objects,
 * and `verifyPlan` would then read `action.label` off `undefined` and report a
 * verification of nothing. The browser needed the same check in 1.47, and a
 * second copy written beside the first is a guarantee they drift.
 *
 * It returns a result rather than throwing. A refusal has to be *rendered* in
 * the browser and *localised* in the terminal, and an exception with an
 * English message baked in can be neither.
 *
 * Deliberately shallow past the fields verification actually reads. A stricter
 * check would reject plans written by an older version of this tool over
 * fields nothing looks at, and a document format that rejects its own past is
 * one nobody commits.
 */
export function parsePlanDocument(text: string): PlanParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, why: { kind: 'not-json' } };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, why: { kind: 'not-an-object' } };
  }
  const doc = parsed as Record<string, unknown>;
  if (doc.schemaVersion !== 1) {
    return { ok: false, why: { kind: 'wrong-schema-version', found: doc.schemaVersion } };
  }
  if (!Array.isArray(doc.actions)) {
    return { ok: false, why: { kind: 'actions-not-a-list' } };
  }
  for (const [index, raw] of doc.actions.entries()) {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      return { ok: false, why: { kind: 'action-malformed', index, because: 'not an object' } };
    }
    const action = raw as Record<string, unknown>;
    // The three fields `verifyPlan` reads on every action, in the order it
    // reads them. An action missing any of these is not a weaker action; it
    // is a verification that would report an outcome for a workload it never
    // identified.
    if (typeof action.label !== 'string') {
      return { ok: false, why: { kind: 'action-malformed', index, because: 'label is not a string' } };
    }
    if (typeof action.model !== 'string') {
      return { ok: false, why: { kind: 'action-malformed', index, because: 'model is not a string' } };
    }
    if (!PLAN_ACTION_KINDS.includes(action.kind as PlanActionKind)) {
      return {
        ok: false,
        why: { kind: 'action-malformed', index, because: `kind is not one of ${PLAN_ACTION_KINDS.join(', ')}` },
      };
    }
  }
  return { ok: true, plan: doc as unknown as PlanDocument & { createdAt?: string } };
}
