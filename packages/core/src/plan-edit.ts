/**
 * A plan action that is an edit to a tracked file (#796).
 *
 * Everything else in a plan is advice a person carries out somewhere Trazum
 * cannot see: move these calls, batch those. An edit is different, because
 * Trazum already writes the new text: `optimize` at the `safe` level trims a
 * prompt, and `reorderForCache` moves its stable blocks in front of the first
 * placeholder. Until now that text was printed and the plan stopped. This
 * module makes the edit a plan action, and gives whoever applies it, later
 * and elsewhere, a way to make exactly that edit and nothing else.
 *
 * Three rules, each a refusal:
 *
 * - **Only the deterministic steps.** An edit is `reorder`, `trim`, or both,
 *   recomputed from the file when it is applied. No model writes any of it,
 *   and a plan has no field that could carry text somebody else wrote.
 * - **Only the file the plan saw.** The file is hashed when the plan is made
 *   and again when the edit is applied; a file that moved on in between is
 *   refused, not merged.
 * - **Only the text the plan promised.** The recomputed text is hashed and
 *   held to the plan's hash, so a change in the rules between the two runs is
 *   a refusal rather than a different edit under the same name.
 *
 * No saving is projected. The figure an edit is expected against is the
 * workload's bill as the log measured it (`detail.baseline`); the file's
 * tokens before and after are the estimator's, and are labelled as such
 * wherever they are shown. `trazum verify` reads the file and the newer log
 * and says whether the edit landed and whether the calls got shorter.
 *
 * Browser-safe like the rest of the core: the hash is passed in, because the
 * core imports no Node builtin and SubtleCrypto is asynchronous.
 */

import { SOURCE_EXTENSIONS } from './extract.js';
import type { RuleId } from './i18n/types.js';
import { optimize } from './optimize.js';
import type { PlanAction, PlanEdit, PlanEditStep } from './plan.js';
import { planEditProblem } from './plan.js';
import type { PricingCatalogue } from './pricing.js';
import { reorderForCache } from './reorder.js';
import { estimateTokens } from './tokenizer.js';
import type { UsageProfileReport } from './usage.js';

/** SHA-256 of a text, lowercase hex. The caller supplies it. */
export type PlanDigest = (text: string) => string;

/**
 * Whether a path is a file an edit may rewrite whole.
 *
 * A source file is not a prompt. `optimize` once rewrote `import OpenAI` into
 * `Import OpenAI` in somebody's TypeScript, and an edit that replaces a whole
 * file must never be pointed at one.
 */
export function isEditableFile(path: string): boolean {
  const lower = path.toLowerCase();
  return !SOURCE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** Runs an edit's steps over a text, in order. Pure and deterministic. */
export function runPlanEditSteps(
  text: string,
  edit: Pick<PlanEdit, 'steps' | 'disabledRules' | 'minPrefixTokens'>,
): string {
  let current = text;
  for (const step of edit.steps) {
    if (step === 'reorder') {
      current = reorderForCache(current, { minPrefixTokens: edit.minPrefixTokens }).text;
    } else {
      current = optimize(current, { level: 'safe', disableRules: edit.disabledRules as RuleId[] }).optimized;
    }
  }
  return current;
}

export interface PlanFileEditInput {
  report: UsageProfileReport;
  /** The workload the configuration says sends this file. */
  label: string;
  /** Relative to the repository root, forward slashes. */
  path: string;
  /** The file's text now. */
  text: string;
  /** `trim` always; `reorder` only when asked for, and first. */
  steps: PlanEditStep[];
  disabledRules: string[];
  pricing: PricingCatalogue;
  digest: PlanDigest;
}

/**
 * The `edit-file` action for one file, or null when there is none to make.
 *
 * Null when the workload has no priced traffic in the log (there is then no
 * measured figure to expect the edit against), when the file is a source
 * file, or when the steps change nothing.
 */
export function planFileEdit(input: PlanFileEditInput): PlanAction | null {
  if (!isEditableFile(input.path)) return null;
  const slice = input.report.byLabelAndModel
    .filter((s) => s.label === input.label && s.breakdown.calls > 0)
    .sort((a, b) => b.breakdown.totalUsd - a.breakdown.totalUsd)[0];
  if (slice === undefined) return null;

  const minPrefixTokens = input.pricing.byId.get(slice.model)?.cacheMinTokens ?? 0;
  const steps = (['reorder', 'trim'] as const).filter((step) => input.steps.includes(step));
  const after = runPlanEditSteps(input.text, { steps, disabledRules: input.disabledRules, minPrefixTokens });
  if (after === input.text) return null;

  const b = slice.breakdown;
  const edit: PlanEdit = {
    path: input.path,
    steps,
    level: 'safe',
    disabledRules: [...input.disabledRules],
    minPrefixTokens,
    beforeSha256: input.digest(input.text),
    afterSha256: input.digest(after),
    beforeTokens: estimateTokens(input.text),
    afterTokens: estimateTokens(after),
  };
  // Two texts that differ and hash the same would make every check below
  // meaningless; a digest that does that is not SHA-256.
  if (planEditProblem(edit) !== null) return null;

  return {
    kind: 'edit-file',
    label: input.label,
    model: slice.model,
    savingUsd: null,
    stakeUsd: null,
    assumes: [{ kind: 'file-is-what-label-sends', path: input.path }],
    check: 'trazum verify <plan.json> --against <newer-log>',
    detail: {
      baseline: {
        calls: b.calls,
        usd: b.totalUsd,
        inputPerCallTokens: (b.inputTokens + b.cacheReadTokens + b.cacheWriteTokens) / b.calls,
        outputPerCallTokens: b.outputTokens / b.calls,
      },
      edit,
    },
  };
}

/** Why an edit could not be applied. */
export type PlanEditRefusal =
  /** The edit itself is malformed, or names a source file. */
  | 'not-an-edit'
  /** The file is not the one the plan was made against, nor the one it promised. */
  | 'not-the-planned-file'
  /** The steps, run again on the planned file, did not give the promised text. */
  | 'steps-disagree';

export type PlanEditApplication =
  /** `changed` is false when the file already holds the promised text. */
  | { ok: true; text: string; changed: boolean }
  | { ok: false; why: PlanEditRefusal };

/**
 * Makes the edit again, from the file as it is now, or says why not.
 *
 * The only way to the new text: the steps, run on a file whose hash is the
 * plan's `beforeSha256`, producing a text whose hash is its `afterSha256`.
 */
export function applyPlanEdit(edit: PlanEdit, current: string, digest: PlanDigest): PlanEditApplication {
  if (planEditProblem(edit) !== null || !isEditableFile(edit.path)) return { ok: false, why: 'not-an-edit' };
  const now = digest(current);
  if (now === edit.afterSha256) return { ok: true, text: current, changed: false };
  if (now !== edit.beforeSha256) return { ok: false, why: 'not-the-planned-file' };
  const after = runPlanEditSteps(current, edit);
  if (digest(after) !== edit.afterSha256) return { ok: false, why: 'steps-disagree' };
  return { ok: true, text: after, changed: true };
}

/** The edits a plan carries, in its order. */
export function planEdits(plan: { actions: readonly PlanAction[] }): PlanEdit[] {
  return plan.actions
    .filter((action) => action.kind === 'edit-file' && action.detail.edit !== undefined)
    .map((action) => action.detail.edit as PlanEdit);
}
