/**
 * Did it work? — the plan held to the log that came after it.
 *
 * Every optimisation tool says what you *would* save; almost none says what
 * you *did*. This module takes a saved plan and a newer report and answers
 * per action, with **three outcomes and never two**: the change arrived, the
 * change did not arrive, or *it cannot be told* — because the workload
 * vanished, the fields the detection needs stopped being recorded, or the
 * log simply cannot see the thing (tokens do not say which tier billed
 * them). The third outcome is the honest one, and the one every other tool
 * renders as the first.
 *
 * **Differences are attributed, not just stated.** A predicted saving that
 * did not appear in the bill is decomposed against the plan's recorded
 * baseline: the calls moved, the output per call moved, the input per call
 * moved — measured ratios with names, never a single number that blames
 * nobody. And a plan priced under one catalogue verified under another says
 * so: the tool must not blame a team for a saving that arithmetic revoked.
 *
 * Browser-safe like everything here: two documents in, one verdict out.
 */

import { cacheEconomics } from './usage.js';
import type { UsageProfileReport } from './usage.js';
import type { PlanAction, PlanDocument } from './plan.js';

export type VerifyOutcome = 'arrived' | 'not-arrived' | 'cannot-tell';

/**
 * Why an action cannot be told. The distinction matters to the gate: a
 * workload that vanished is the world's doing; a log that stopped recording
 * the fields the detection needs is the team's, and "not recorded" must not
 * read as "fixed".
 */
export type CannotTellReason =
  | 'workload-vanished'
  | 'fields-stopped'
  | 'tier-not-recorded'
  /** An `edit-file` action, checked where nothing could read the file: a browser, an HTTP body. */
  | 'file-not-read'
  /** The file is neither the one the plan saw nor the one it promised: it moved on. */
  | 'file-changed';

export interface VerifiedAction {
  /** The plan's action, verbatim — the prediction being judged. */
  action: PlanAction;
  outcome: VerifyOutcome;
  reason: CannotTellReason | null;
  /**
   * What the newer log measured for this slice, per kind: where the money
   * sits now, the new retry bill, the new cache delta. Keys are stable.
   */
  observed: Record<string, number | string | null>;
  /**
   * The world's movement between the two logs, from the plan's recorded
   * baseline: never a verdict, always the measured before and after.
   */
  attribution: {
    calls?: { before: number; after: number };
    inputPerCallTokens?: { before: number; after: number };
    outputPerCallTokens?: { before: number; after: number };
  } | null;
  /**
   * Whether this action fails `--gate`. `not-arrived` always does;
   * `cannot-tell` does only for `fields-stopped` — a team that degraded its
   * own log must not pass the gate on the strength of the silence. A
   * vanished workload and an unrecordable tier fail nothing.
   */
  gateFailing: boolean;
}

export interface PlanVerification {
  schemaVersion: 1;
  /** When the plan was made, when it carries the stamp. */
  planCreatedAt: string | null;
  /** The catalogue that priced the plan, and the one pricing this check. */
  planPricing: string;
  currentPricing: string;
  /**
   * True when those differ: every dollar comparison here is then two
   * measurements under two price lists, and the rendering must say so
   * rather than let a repricing read as a team's failure.
   */
  pricesChanged: boolean;
  actions: VerifiedAction[];
  arrived: number;
  notArrived: number;
  cannotTell: number;
  gateFailures: number;
}

/** Newer-log slices for one label, dearest first. */
function slicesForLabel(report: UsageProfileReport, label: string) {
  return report.byLabelAndModel
    .filter((s) => s.label === label && s.breakdown.calls > 0)
    .sort((a, b) => b.breakdown.totalUsd - a.breakdown.totalUsd);
}

function attributionFrom(
  action: PlanAction,
  after: { calls: number; inputPerCallTokens: number; outputPerCallTokens: number } | null,
): VerifiedAction['attribution'] {
  const before = action.detail.baseline;
  if (before === undefined || after === null) return null;
  return {
    calls: { before: before.calls, after: after.calls },
    inputPerCallTokens: { before: before.inputPerCallTokens, after: after.inputPerCallTokens },
    outputPerCallTokens: { before: before.outputPerCallTokens, after: after.outputPerCallTokens },
  };
}

function perCall(breakdown: { calls: number; inputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; outputTokens: number }) {
  return {
    calls: breakdown.calls,
    inputPerCallTokens:
      (breakdown.inputTokens + breakdown.cacheReadTokens + breakdown.cacheWriteTokens) / breakdown.calls,
    outputPerCallTokens: breakdown.outputTokens / breakdown.calls,
  };
}

/**
 * An edit is checked twice: in the tree, then in the log.
 *
 * The file has to hold the text the plan promised, by hash. A file still
 * holding the text the plan saw did not get the edit, which is a broken
 * promise; a file holding something else moved on in a way the plan did not
 * write, and that cannot be told, failing the gate the way a log that stopped
 * recording its fields does. Then the workload's input per call in the newer
 * log is held to the baseline the plan recorded: shorter is arrived, not
 * shorter is not.
 */
function verifyEdit(
  action: PlanAction,
  report: UsageProfileReport,
  files: ReadonlyMap<string, string | null> | undefined,
): VerifiedAction {
  const edit = action.detail.edit;
  const now = edit === undefined || files === undefined || !files.has(edit.path) ? undefined : files.get(edit.path);
  if (edit === undefined || now === undefined) {
    return { action, outcome: 'cannot-tell', reason: 'file-not-read', observed: {}, attribution: null, gateFailing: false };
  }
  if (now === edit.beforeSha256) {
    return { action, outcome: 'not-arrived', reason: null, observed: { file: 'as-planned-from' }, attribution: null, gateFailing: true };
  }
  if (now !== edit.afterSha256) {
    return {
      action,
      outcome: 'cannot-tell',
      reason: 'file-changed',
      observed: { file: now === null ? 'missing' : 'other' },
      attribution: null,
      gateFailing: true,
    };
  }
  const slice = report.byLabelAndModel.find(
    (s) => s.label === action.label && s.model === action.model && s.breakdown.calls > 0,
  );
  if (slice === undefined) {
    return { action, outcome: 'cannot-tell', reason: 'workload-vanished', observed: { file: 'edited' }, attribution: null, gateFailing: false };
  }
  const after = perCall(slice.breakdown);
  const before = action.detail.baseline?.inputPerCallTokens;
  const shorter = before !== undefined && after.inputPerCallTokens < before;
  return {
    action,
    outcome: shorter ? 'arrived' : 'not-arrived',
    reason: null,
    observed: {
      file: 'edited',
      inputPerCallTokens: after.inputPerCallTokens,
      inputPerCallTokensBefore: before ?? null,
    },
    attribution: attributionFrom(action, after),
    gateFailing: !shorter,
  };
}

export function verifyPlan(
  plan: PlanDocument & { createdAt?: string },
  report: UsageProfileReport,
  options: {
    currentPricingLastReviewed: string;
    /**
     * For `edit-file` actions: the SHA-256 of each file as it is now, by the
     * plan's path, or null for a file that is not there. Whoever can read
     * the files supplies it; a path missing from it cannot be told.
     */
    files?: ReadonlyMap<string, string | null>;
  },
): PlanVerification {
  const actions: VerifiedAction[] = [];

  for (const action of plan.actions) {
    if (action.kind === 'edit-file') {
      actions.push(verifyEdit(action, report, options.files));
      continue;
    }
    const slices = slicesForLabel(report, action.label);
    const total = slices.reduce((sum, s) => sum + s.breakdown.totalUsd, 0);
    const allCalls = slices.reduce((sum, s) => sum + s.breakdown.calls, 0);

    /** The label carries no priced traffic any more: nothing can be told. */
    if (slices.length === 0) {
      actions.push({
        action,
        outcome: 'cannot-tell',
        reason: 'workload-vanished',
        observed: {},
        attribution: null,
        gateFailing: false,
      });
      continue;
    }

    if (action.kind === 'route' || action.kind === 'route+batch') {
      const target = action.detail.routeTo!;
      const dearest = slices[0]!;
      const onTarget = slices.find((s) => s.model === target.id);
      const stillOnOld = slices.find((s) => s.model === action.model);
      const moved = dearest.model === target.id;
      const after = perCall(
        moved ? dearest.breakdown : (stillOnOld ?? dearest).breakdown,
      );
      actions.push({
        action,
        outcome: moved ? 'arrived' : 'not-arrived',
        reason: null,
        observed: {
          dearestModel: dearest.model,
          onTargetUsd: onTarget?.breakdown.totalUsd ?? 0,
          onOldModelUsd: stillOnOld?.breakdown.totalUsd ?? 0,
          labelUsd: total,
          labelCalls: allCalls,
          // The batch half of route+batch cannot be seen in token counts;
          // the rendering names it instead of counting it as arrived.
          ...(action.kind === 'route+batch' ? { batchObservable: 0 } : {}),
        },
        attribution: attributionFrom(action, after),
        gateFailing: !moved,
      });
      continue;
    }

    if (action.kind === 'batch') {
      // Tokens do not say which tier billed them. Not the team's silence,
      // so it cannot fail the gate — but it is said, never assumed arrived.
      actions.push({
        action,
        outcome: 'cannot-tell',
        reason: 'tier-not-recorded',
        observed: { labelUsd: total, labelCalls: allCalls },
        attribution: null,
        gateFailing: false,
      });
      continue;
    }

    const slice = slices.find((s) => s.model === action.model);

    if (action.kind === 'fix-truncation') {
      // The detection needs sessions and timestamps; a log that dropped them
      // reads as "no retries" for the wrong reason, and that must not pass.
      if (!report.hasSessions || report.span === null) {
        actions.push({
          action,
          outcome: 'cannot-tell',
          reason: 'fields-stopped',
          observed: {},
          attribution: attributionFrom(action, slice ? perCall(slice.breakdown) : null),
          gateFailing: true,
        });
        continue;
      }
      const row = report.truncationRetries.find(
        (r) => r.label === action.label && r.model === action.model,
      );
      const newStake = row === undefined ? 0 : row.wastedUsd + row.retryUsd;
      actions.push({
        action,
        outcome: row === undefined ? 'arrived' : 'not-arrived',
        reason: null,
        observed: {
          retryBillUsd: newStake,
          retried: row?.retried ?? 0,
          truncatedCalls: row?.truncatedCalls ?? 0,
        },
        attribution: attributionFrom(action, slice ? perCall(slice.breakdown) : null),
        gateFailing: row !== undefined,
      });
      continue;
    }

    // fix-caching.
    if (slice === undefined) {
      actions.push({
        action,
        outcome: 'cannot-tell',
        reason: 'workload-vanished',
        observed: {},
        attribution: null,
        gateFailing: false,
      });
      continue;
    }
    const economics = cacheEconomics(slice.breakdown);
    if (economics.verdict === 'lost-money' && economics.worstCaseVerdict === economics.verdict) {
      actions.push({
        action,
        outcome: 'not-arrived',
        reason: null,
        observed: { deltaUsd: economics.deltaUsd, spentUsd: economics.spentUsd },
        attribution: attributionFrom(action, perCall(slice.breakdown)),
        gateFailing: true,
      });
    } else if (economics.worstCaseVerdict !== economics.verdict) {
      // The verdict cannot settle on this log: the fields that would settle
      // it are not there, and an unverifiable fix is not a verified one.
      actions.push({
        action,
        outcome: 'cannot-tell',
        reason: 'fields-stopped',
        observed: {},
        attribution: attributionFrom(action, perCall(slice.breakdown)),
        gateFailing: true,
      });
    } else {
      actions.push({
        action,
        outcome: 'arrived',
        reason: null,
        observed: { deltaUsd: economics.deltaUsd, spentUsd: economics.spentUsd },
        attribution: attributionFrom(action, perCall(slice.breakdown)),
        gateFailing: false,
      });
    }
  }

  return {
    schemaVersion: 1,
    planCreatedAt: plan.createdAt ?? null,
    planPricing: plan.pricingLastReviewed,
    currentPricing: options.currentPricingLastReviewed,
    pricesChanged: plan.pricingLastReviewed !== options.currentPricingLastReviewed,
    actions,
    arrived: actions.filter((a) => a.outcome === 'arrived').length,
    notArrived: actions.filter((a) => a.outcome === 'not-arrived').length,
    cannotTell: actions.filter((a) => a.outcome === 'cannot-tell').length,
    gateFailures: actions.filter((a) => a.gateFailing).length,
  };
}
