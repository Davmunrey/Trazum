/**
 * Did the things that are supposed to run, run?
 *
 * `watch --once` is designed for a scheduler: it pulls, stores, evaluates and
 * saves state, so a cron entry is the whole daemon. Its state file records the
 * last cycle precisely so a restart is honest about the stretch it did not
 * watch — and that file is read by exactly one thing, which is the next cycle.
 *
 * **So nothing can tell you the watcher stopped, because the thing that would
 * tell you is the thing that stopped.** A dead cron produces silence, and
 * silence is what a watcher with nothing to report produces too. That is
 * `not-recorded is not not-happened` one layer up from where this repository
 * usually meets it: not a missing record, a missing *run*.
 *
 * This module is the arithmetic for saying so. The caller reads the state file
 * and the store; this turns instants into ages and ages into a verdict, which
 * is what makes the rule testable without waiting a week for a cron to die.
 *
 * **Three refusals shape it:**
 *
 * - **Something that never ran cannot be stale.** A repository where nobody
 *   has ever started a watcher is not a repository whose watcher is late; it
 *   has no cadence to be late against. `never-run` is its own verdict and it
 *   never gates, because a gate that fires on "you have not adopted this
 *   feature" is a tool nagging rather than measuring.
 * - **No limit, no verdict.** Without a stated threshold the ages are reported
 *   and nothing is judged. How stale is too stale is a policy, and this
 *   product does not write somebody's policy for them.
 * - **How far the measurements reach is not a run.** A store whose newest
 *   record covers up to yesterday is a provider reporting on its own schedule,
 *   not a job that failed. It is reported beside the runs and deliberately
 *   never judged by the same threshold: merging "nothing ran" with "the
 *   provider is a day behind" would produce a red build for somebody else's
 *   latency.
 */

const HOUR_MS = 3_600_000;

export type HeartbeatKind =
  /** The last `watch` cycle, from its state file. */
  | 'watch-cycle'
  /** The last time a connector wrote a record into the store. */
  | 'store-pull'
  /** How far the stored measurements reach — a fact, never a run. */
  | 'store-coverage';

export type HeartbeatVerdict =
  /** It has never happened here. Not late; there is no cadence to be late against. */
  | 'never-run'
  /** It happened, and no threshold was stated, so nothing is judged. */
  | 'not-judged'
  /** Within the stated threshold. */
  | 'within'
  /** Past the stated threshold. */
  | 'stale';

export interface Heartbeat {
  kind: HeartbeatKind;
  /** When it last happened, or null when it never has. */
  lastMs: number | null;
  /**
   * Whole hours since, or null when it never happened.
   *
   * Hours rather than days because the schedules this is about are hourly as
   * often as daily, and a cron that died twenty hours ago is zero days old.
   * Floored, so an age this reports as six hours is at least six hours.
   */
  ageHours: number | null;
  verdict: HeartbeatVerdict;
}

export interface HeartbeatReport {
  schemaVersion: 1;
  nowMs: number;
  /** The threshold the caller stated, or null when none was. */
  maxStaleHours: number | null;
  beats: Heartbeat[];
  /**
   * True when something that has run before is past the threshold.
   *
   * Never true for a `never-run` beat, and never true for `store-coverage`,
   * which is not a run.
   */
  stale: boolean;
}

/** What the caller found on disk. Nulls are absences, never zero. */
export interface HeartbeatInput {
  /** `lastCycleMs` from the watch state file, or null when there is none. */
  watchCycleMs: number | null;
  /** The newest `pulledAtMs` in the store, or null when the store is empty. */
  storePulledMs: number | null;
  /** The furthest `toMs` in the store, or null when the store is empty. */
  storeCoveredToMs: number | null;
}

/** Whole hours between two instants, floored and never negative. */
const hoursSince = (fromMs: number, nowMs: number): number =>
  Math.max(0, Math.floor((nowMs - fromMs) / HOUR_MS));

/** Kinds that answer "did something run", as opposed to "how far does it reach". */
const IS_A_RUN: Record<HeartbeatKind, boolean> = {
  'watch-cycle': true,
  'store-pull': true,
  'store-coverage': false,
};

export function heartbeats(
  input: HeartbeatInput,
  options: { nowMs: number; maxStaleHours?: number },
): HeartbeatReport {
  const { nowMs } = options;
  const maxStaleHours =
    typeof options.maxStaleHours === 'number' && Number.isFinite(options.maxStaleHours)
      ? options.maxStaleHours
      : null;

  const build = (kind: HeartbeatKind, lastMs: number | null): Heartbeat => {
    if (lastMs === null) {
      return { kind, lastMs: null, ageHours: null, verdict: 'never-run' };
    }
    const ageHours = hoursSince(lastMs, nowMs);
    if (maxStaleHours === null || !IS_A_RUN[kind]) {
      return { kind, lastMs, ageHours, verdict: 'not-judged' };
    }
    return { kind, lastMs, ageHours, verdict: ageHours > maxStaleHours ? 'stale' : 'within' };
  };

  const beats: Heartbeat[] = [
    build('watch-cycle', input.watchCycleMs),
    build('store-pull', input.storePulledMs),
    build('store-coverage', input.storeCoveredToMs),
  ];

  return {
    schemaVersion: 1,
    nowMs,
    maxStaleHours,
    beats,
    stale: beats.some((beat) => beat.verdict === 'stale'),
  };
}
