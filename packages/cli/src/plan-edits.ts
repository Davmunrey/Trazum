import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import { isEditableFile, planEdits, planFileEdit } from '@trazum/core';
import type { PlanAction, PlanDocument, PlanEditStep, PricingCatalogue, UsageProfileReport } from '@trazum/core';

import { isTracked, pathInRepository, repositoryRoot } from './git.js';

/**
 * The file side of `trazum plan --edits` and of `trazum verify` (#796).
 *
 * `plan --edits` reads each prompt file `trazum.config.json` maps a label to
 * (`labels`), and asks the core for the edit the deterministic steps would
 * make to it. This module owns the reading and the hashing; the core owns
 * what an edit is. It writes nothing: the plan names the edit, and the
 * Action's pull-request step is the only thing that ever makes it.
 */

/** SHA-256 of a text as UTF-8, lowercase hex: the digest every edit is held to. */
export const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

/** Why a mapped label produced no edit. */
export type EditSkip =
  | { why: 'no-traffic'; label: string; path: string }
  | { why: 'unreadable'; label: string; path: string }
  | { why: 'not-tracked'; label: string; path: string }
  | { why: 'source-file'; label: string; path: string }
  | { why: 'unchanged'; label: string; path: string };

export interface PlannedEdits {
  actions: PlanAction[];
  skipped: EditSkip[];
}

/**
 * The `edit-file` actions for every label the configuration maps to a file.
 *
 * A path is read as the configuration gives it, from the working directory,
 * the way `profile` reads it, and recorded relative to the repository root,
 * which is where a pull request names it. A file git does not track is
 * skipped and said: an edit to a file the repository does not hold could
 * never be proposed to it.
 */
export async function planEditsFor(options: {
  report: UsageProfileReport;
  labels: Record<string, string>;
  steps: PlanEditStep[];
  disabledRules: string[];
  pricing: PricingCatalogue;
  cwd?: string;
}): Promise<PlannedEdits> {
  const cwd = options.cwd ?? process.cwd();
  const actions: PlanAction[] = [];
  const skipped: EditSkip[] = [];
  const traffic = new Set(options.report.byLabelAndModel.filter((s) => s.breakdown.calls > 0).map((s) => s.label));

  for (const [label, given] of Object.entries(options.labels).sort((a, b) => a[0].localeCompare(b[0]))) {
    if (!traffic.has(label)) {
      skipped.push({ why: 'no-traffic', label, path: given });
      continue;
    }
    const absolute = resolve(cwd, given);
    let text: string;
    try {
      text = await readFile(absolute, 'utf8');
    } catch {
      skipped.push({ why: 'unreadable', label, path: given });
      continue;
    }
    const root = repositoryRoot(dirname(absolute));
    const repoPath = root === null ? null : pathInRepository(root, absolute);
    if (root === null || repoPath === null || !isTracked(root, repoPath)) {
      skipped.push({ why: 'not-tracked', label, path: given });
      continue;
    }
    if (!isEditableFile(repoPath)) {
      skipped.push({ why: 'source-file', label, path: repoPath });
      continue;
    }
    const action = planFileEdit({
      report: options.report,
      label,
      path: repoPath,
      text,
      steps: options.steps,
      disabledRules: options.disabledRules,
      pricing: options.pricing,
      digest: sha256,
    });
    if (action === null) skipped.push({ why: 'unchanged', label, path: repoPath });
    else actions.push(action);
  }
  return { actions, skipped };
}

/**
 * The SHA-256 of each file a plan's edits name, as it is now in the
 * repository holding the working directory, or null for one that is not
 * there. Outside a repository the map is empty and every edit reads as
 * `file-not-read`, which is what it is.
 */
export async function currentFileDigests(
  plan: Pick<PlanDocument, 'actions'>,
  cwd: string = process.cwd(),
): Promise<Map<string, string | null>> {
  const digests = new Map<string, string | null>();
  const edits = planEdits(plan);
  if (edits.length === 0) return digests;
  const root = repositoryRoot(cwd);
  if (root === null) return digests;
  for (const edit of edits) {
    try {
      digests.set(edit.path, sha256(await readFile(join(root, ...edit.path.split('/')), 'utf8')));
    } catch {
      digests.set(edit.path, null);
    }
  }
  return digests;
}
