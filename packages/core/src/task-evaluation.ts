import { taskError } from './task-analysis.js';
import { MAX_INPUT_CHARS } from './limits.js';
import { pairMismatch, sharesSource, validated } from './task.js';
import { TASK_LIMITATIONS } from './task-types.js';
import type { TaskOutcome, TaskReport } from './task-types.js';

/**
 * The bar an evaluation is held to, written down before any task runs (#903,
 * #638). Trazum cannot tell when it was written; the evaluation says so.
 */
export interface TaskEvaluationPlan {
  version: 1;
  kind: 'trazum-task-evaluation-plan';
  policyId: 'repeat-review-v1';
  /** Matched pairs needed before a verdict other than `inconclusive`. */
  minimumPairs: number;
  /** The policy arm's tokens per accepted task must fall by at least this percentage of the baseline's. */
  minimumTokenReductionPercent: number;
  /** The policy arm's acceptance rate may fall by at most this many percentage points. */
  maximumAcceptanceDropPoints: number;
}

export interface TaskEvaluationArm {
  runs: number;
  accepted: number;
  rejected: number;
  /** Accepted runs as a percentage of runs. */
  acceptanceRate: number;
  /** Every run's tokens, a rejected run's included: the arm paid for it. */
  totalTokens: number;
  tokensPerAcceptedTask: number | null;
  /** Null unless every run in the arm is priced. */
  apiEquivalentUsd: number | null;
  apiEquivalentUsdPerAcceptedTask: number | null;
  /** Explicit failures the agent ran again, from the reports' `repeated-failure` findings. */
  repeatedFailures: number;
  duplicateCalls: number;
}

export interface TaskEvaluationPair {
  index: number;
  included: boolean;
  /** Why the pair is left out; empty when it is included. */
  reasons: string[];
  before: { taskId: string; outcome: TaskOutcome; totalTokens: number };
  after: { taskId: string; outcome: TaskOutcome; totalTokens: number };
}

export interface TaskEvaluation {
  version: 1;
  kind: 'trazum-task-evaluation';
  plan: TaskEvaluationPlan;
  verdict: 'clears-bar' | 'below-bar' | 'quality-bar-failed' | 'inconclusive';
  reasons: string[];
  pairs: TaskEvaluationPair[];
  baseline: TaskEvaluationArm;
  policy: TaskEvaluationArm;
  change: {
    /** Policy minus baseline, as a percentage of the baseline. Negative is fewer tokens. */
    tokensPerAcceptedTaskPercent: number | null;
    /** Policy minus baseline, in percentage points. Negative is fewer accepted. */
    acceptanceRatePoints: number;
  };
  limitations: string[];
}

/** At most this many pairs in one evaluation, so the output stays under the report limit. */
export const MAX_EVALUATION_PAIRS = 100;

export const TASK_EVALUATION_LIMITATIONS = [
  ...TASK_LIMITATIONS,
  'The plan is a caller declaration. Trazum cannot tell whether it was fixed before the runs.',
  "The policy's own instructions are context the agent read, so their tokens are already in the policy arm's measured usage.",
] as const;

const PLAN_FIELDS = ['version', 'kind', 'policyId', 'minimumPairs', 'minimumTokenReductionPercent', 'maximumAcceptanceDropPoints'] as const;

function planValue(value: unknown): TaskEvaluationPlan {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) taskError();
  const plan = value as Record<string, unknown>;
  const keys = Object.keys(plan);
  if (keys.length !== PLAN_FIELDS.length || PLAN_FIELDS.some((field) => !Object.hasOwn(plan, field))) taskError();
  const { minimumPairs, minimumTokenReductionPercent: reduction, maximumAcceptanceDropPoints: drop } = plan;
  if (plan.version !== 1 || plan.kind !== 'trazum-task-evaluation-plan' || plan.policyId !== 'repeat-review-v1' ||
      typeof minimumPairs !== 'number' || !Number.isSafeInteger(minimumPairs) || minimumPairs < 2 || minimumPairs > MAX_EVALUATION_PAIRS ||
      typeof reduction !== 'number' || !Number.isFinite(reduction) || reduction <= 0 || reduction >= 100 ||
      typeof drop !== 'number' || !Number.isFinite(drop) || drop < 0 || drop > 100) taskError();
  return { version: 1, kind: 'trazum-task-evaluation-plan', policyId: 'repeat-review-v1', minimumPairs, minimumTokenReductionPercent: reduction, maximumAcceptanceDropPoints: drop };
}

/** Read a plan from its JSON text, refusing any field it does not define. */
export function parseTaskEvaluationPlan(text: string): TaskEvaluationPlan {
  if (typeof text !== 'string' || text.length > MAX_INPUT_CHARS) taskError();
  let value: unknown;
  try { value = JSON.parse(text); } catch { taskError(); }
  return planValue(value);
}

function arm(reports: readonly TaskReport[]): TaskEvaluationArm {
  const accepted = reports.filter((report) => report.task.outcome === 'accepted').length;
  const rejected = reports.filter((report) => report.task.outcome === 'rejected').length;
  const totalTokens = reports.reduce((sum, report) => sum + report.usage.totalTokens, 0);
  const priced = reports.length > 0 && reports.every((report) => report.usage.apiEquivalentUsd !== null);
  const apiEquivalentUsd = priced ? reports.reduce((sum, report) => sum + (report.usage.apiEquivalentUsd as number), 0) : null;
  return {
    runs: reports.length,
    accepted,
    rejected,
    acceptanceRate: reports.length ? accepted / reports.length * 100 : 0,
    totalTokens,
    tokensPerAcceptedTask: accepted ? totalTokens / accepted : null,
    apiEquivalentUsd,
    apiEquivalentUsdPerAcceptedTask: accepted && apiEquivalentUsd !== null ? apiEquivalentUsd / accepted : null,
    repeatedFailures: reports.reduce((sum, report) => sum + report.tools.findings
      .filter((finding) => finding.kind === 'repeated-failure')
      .reduce((total, finding) => total + finding.count, 0), 0),
    duplicateCalls: reports.reduce((sum, report) => sum + report.tools.duplicateCalls, 0),
  };
}

const side = (report: TaskReport) => ({ taskId: report.task.id, outcome: report.task.outcome, totalTokens: report.usage.totalTokens });

/**
 * Weigh matched baseline and policy runs against a bar declared in advance.
 * Each pair is checked the way `compareTasks` checks one, and no source may
 * appear in two pairs. A pair that fails is kept, with its reasons, and left
 * out of the arms. An unknown outcome is neither accepted nor rejected, so its
 * pair is left out too. Nothing here runs a model, changes a default or says
 * the policy caused a change.
 */
export function evaluateTasks(plan: TaskEvaluationPlan, pairs: ReadonlyArray<{ before: TaskReport; after: TaskReport }>): TaskEvaluation {
  const checkedPlan = planValue(plan);
  if (!Array.isArray(pairs) || pairs.length < 1 || pairs.length > MAX_EVALUATION_PAIRS) taskError();
  const seen: TaskReport[] = [];
  const included: Array<{ before: TaskReport; after: TaskReport }> = [];
  const rows: TaskEvaluationPair[] = pairs.map((pair, offset) => {
    const before = validated(pair.before);
    const after = validated(pair.after);
    const reasons = pairMismatch(before, after);
    if (after.task.policyId !== checkedPlan.policyId) reasons.push('plan-policy-mismatch');
    if (sharesSource(seen, before) || sharesSource(seen, after)) reasons.push('source-reuse-across-pairs');
    if (before.task.outcome === 'unknown' || after.task.outcome === 'unknown') reasons.push('outcome-unknown');
    if (before.usage.records === 0 || after.usage.records === 0) reasons.push('nonzero-usage-required');
    seen.push(before, after);
    if (reasons.length === 0) included.push({ before, after });
    return { index: offset + 1, included: reasons.length === 0, reasons, before: side(before), after: side(after) };
  });
  const baseline = arm(included.map((pair) => pair.before));
  const policy = arm(included.map((pair) => pair.after));
  const result: TaskEvaluation = {
    version: 1,
    kind: 'trazum-task-evaluation',
    plan: checkedPlan,
    verdict: 'inconclusive',
    reasons: [],
    pairs: rows,
    baseline,
    policy,
    change: {
      tokensPerAcceptedTaskPercent: baseline.tokensPerAcceptedTask !== null && policy.tokensPerAcceptedTask !== null
        ? (policy.tokensPerAcceptedTask - baseline.tokensPerAcceptedTask) / baseline.tokensPerAcceptedTask * 100
        : null,
      acceptanceRatePoints: policy.acceptanceRate - baseline.acceptanceRate,
    },
    limitations: [...TASK_EVALUATION_LIMITATIONS],
  };
  if (included.length < checkedPlan.minimumPairs) { result.reasons.push('too-few-matched-pairs'); return result; }
  if (-result.change.acceptanceRatePoints > checkedPlan.maximumAcceptanceDropPoints) {
    result.verdict = 'quality-bar-failed'; result.reasons.push('acceptance-dropped-past-bar'); return result;
  }
  if (baseline.accepted === 0) { result.reasons.push('no-accepted-baseline-run'); return result; }
  if (policy.accepted === 0) { result.reasons.push('no-accepted-policy-run'); return result; }
  const reduction = -(result.change.tokensPerAcceptedTaskPercent as number);
  result.verdict = reduction >= checkedPlan.minimumTokenReductionPercent ? 'clears-bar' : 'below-bar';
  result.reasons.push('paired-observation-not-causal');
  return result;
}
