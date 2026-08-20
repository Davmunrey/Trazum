/**
 * What a team has decided to live with, and how long they have been deciding it.
 *
 * 1.40 named this gap and could not fill it: *no document stores past waivers,
 * and a history invented from the current config would be a guess presented as
 * a record*. That was the right refusal — a config says what is waived **now**,
 * and nothing in it says whether the same finding was waived last quarter under
 * a different reason, or whether the expiry has been pushed forward four times
 * by four people who each assumed somebody else had looked.
 *
 * It is fixable by **recording**, not by inferring. A waiver silences a gate;
 * the moment it does, that use is a fact with a date on it, and this module
 * reads those facts back.
 *
 * Three rules hold the whole thing up:
 *
 * **Nothing is back-filled.** The history starts the day the recording did,
 * and `since` says which day that was. Reconstructing a past from the present
 * config is exactly what 1.40 refused, and it would be worse here than
 * nowhere: a fabricated "waived four times" is an accusation.
 *
 * **A use is recorded when the waiver silences something, not when it is
 * written.** A waiver nobody's build has ever hit is not a habit — it is dead
 * config, and the report says which it is rather than folding the two together.
 *
 * **The verdict describes the record, never the team.** "Renewed without being
 * revisited" is a statement about dates and reasons in a file. Whether that was
 * the right call is a conversation this tool does not get to have.
 */

import type { WaiveEntry } from './config-schema.js';

/** One occasion on which a waiver silenced a gate. */
export interface WaiverUse {
  schemaVersion: 1;
  /** The UTC day it happened, `YYYY-MM-DD`. */
  day: string;
  /** The gate silenced — a `WAIVABLE_GATES` entry or `byLabel:<label>`. */
  gate: string;
  /** The reason the config gave **at that moment**, not today's. */
  reason: string;
  /** The expiry the waiver carried at that moment. */
  until: string;
  /**
   * The commit that carried it, when the run could see one.
   *
   * Null is common and honest: a waiver used outside a repository, or in a CI
   * job that did not export the SHA. Null never becomes "unknown commit" in a
   * count — a use with no commit is still a use.
   */
  commit: string | null;
  /** What the gate measured, so a recorded use is checkable rather than asserted. */
  measuredUsd: number | null;
  limitUsd: number | null;
}

export type WaiverVerdict =
  /** One recorded use. Nothing to say about it yet. */
  | 'used-once'
  /** Used repeatedly under one unchanging reason and one unchanging expiry. */
  | 'recurring'
  /**
   * The expiry moved while the reason stayed the same.
   *
   * The shape a decision takes when nobody is revisiting it: the same sentence
   * carried forward past its own deadline. Named, and never called wrong —
   * plenty of real constraints outlive their first estimate.
   */
  | 'renewed-without-revisiting'
  /**
   * The reason changed between uses.
   *
   * Somebody looked. Worth telling apart from the case above, because it is
   * the opposite behaviour and would otherwise be counted as the same habit.
   */
  | 'reason-changed';

export interface WaiverHabit {
  gate: string;
  /** How many recorded uses, never an estimate. */
  uses: number;
  firstDay: string;
  lastDay: string;
  /** Distinct days it fired on — a gate hit twice on one day is one day. */
  days: number;
  /** Every distinct reason given, oldest first. */
  reasons: string[];
  /** Every distinct expiry carried, oldest first. More than one means it moved. */
  expiries: string[];
  verdict: WaiverVerdict;
  /** Whether this gate is still waived in the config as it stands today. */
  stillConfigured: boolean;
}

export interface WaiverHistory {
  schemaVersion: 1;
  /**
   * The first day any use was recorded, or null when none has been.
   *
   * Rendered as "the history starts here", because a reader looking at two
   * uses needs to know whether that is two in the project's life or two since
   * Tuesday.
   */
  since: string | null;
  /** Most-used first — the order somebody would read in. */
  habits: WaiverHabit[];
  /**
   * Waivers in the config today that no recorded run has ever hit.
   *
   * Dead config, not habit. Either the gate stopped failing — which is good
   * news nobody wrote down — or the waiver names a situation that never
   * arises. Both are worth deleting; neither is a team living with a finding.
   */
  neverUsed: string[];
  /** Total recorded uses across every gate. */
  totalUses: number;
}

/** `YYYY-MM-DD` for a moment, UTC — the same day boundary the store uses. */
export function waiverDay(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/**
 * Whether a value is a use record this module can read.
 *
 * Same posture as the plan validator: a line that is not a record is skipped
 * and counted by the caller, never coerced into one. A malformed line in an
 * append-only file is a fact about the file, and a reader that silently
 * repairs it produces a history that is wrong by an unknown amount.
 */
export function isWaiverUse(value: unknown): value is WaiverUse {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    record.schemaVersion === 1 &&
    typeof record.day === 'string' &&
    typeof record.gate === 'string' &&
    typeof record.reason === 'string' &&
    typeof record.until === 'string'
  );
}

function verdictFor(reasons: string[], expiries: string[], uses: number): WaiverVerdict {
  if (uses <= 1) return 'used-once';
  if (reasons.length > 1) return 'reason-changed';
  return expiries.length > 1 ? 'renewed-without-revisiting' : 'recurring';
}

/**
 * The habits, from the record and the config as it stands.
 *
 * `configured` is used for exactly one thing — telling a gate somebody is
 * still waiving from one they stopped — and never to invent a use. A waiver in
 * the config with no recorded use appears in `neverUsed`, with a count of
 * nothing, which is the honest shape.
 */
export function waiverHistory(
  uses: readonly WaiverUse[],
  configured: readonly WaiveEntry[] = [],
): WaiverHistory {
  const byGate = new Map<string, WaiverUse[]>();
  for (const use of uses) {
    const list = byGate.get(use.gate);
    if (list === undefined) byGate.set(use.gate, [use]);
    else list.push(use);
  }

  const configuredGates = new Set(configured.map((entry) => entry.gate));
  const habits: WaiverHabit[] = [];

  for (const [gate, list] of byGate) {
    const sorted = [...list].sort((a, b) => a.day.localeCompare(b.day));
    // Distinct values in the order they were first seen, so "the reason
    // changed" reads chronologically rather than alphabetically.
    const reasons = [...new Set(sorted.map((u) => u.reason))];
    const expiries = [...new Set(sorted.map((u) => u.until))];
    const days = new Set(sorted.map((u) => u.day)).size;
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    if (first === undefined || last === undefined) continue;
    habits.push({
      gate,
      uses: sorted.length,
      firstDay: first.day,
      lastDay: last.day,
      days,
      reasons,
      expiries,
      verdict: verdictFor(reasons, expiries, sorted.length),
      stillConfigured: configuredGates.has(gate),
    });
  }

  habits.sort((a, b) => b.uses - a.uses || a.gate.localeCompare(b.gate));

  const allDays = uses.map((use) => use.day).sort((a, b) => a.localeCompare(b));

  return {
    schemaVersion: 1,
    since: allDays[0] ?? null,
    habits,
    neverUsed: configured
      .filter((entry) => !byGate.has(entry.gate))
      .map((entry) => entry.gate)
      .sort(),
    totalUses: uses.length,
  };
}
