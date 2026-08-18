/**
 * The drivers of a change between two bills.
 *
 * One implementation, exported from core, because the sign convention here —
 * **positive means the bill grew**, the diff convention — has already flipped
 * once in this repository's history when restated by hand. The CLI, the MCP
 * and the web all render these rows; three inline computations of the same
 * union-and-subtract is three chances for one of them to disagree about what
 * a vanished workload contributed.
 *
 * Derived over the **union** of keys, so an appeared or vanished workload is
 * named rather than folded silently into the total: `was: null` is a key the
 * previous log did not have, `now: null` one this log no longer has. Both are
 * different statements from `$0.00`, and the renderings say which.
 */

export interface AgainstDriver {
  key: string;
  /** What this key cost in the previous log, or null when it was not there. */
  was: number | null;
  /** What it costs now, or null when it is gone. */
  now: number | null;
  /** `(now ?? 0) - (was ?? 0)` — positive means the bill grew. */
  delta: number;
}

/**
 * Noise floor, not a judgement threshold: the same accumulated-double drift
 * `cacheEconomics` refuses to report as a finding.
 */
const DRIVER_NOISE_USD = 1e-9;

export function driversBetween(
  before: ReadonlyArray<{ key: string; usd: number }>,
  after: ReadonlyArray<{ key: string; usd: number }>,
): AgainstDriver[] {
  const wasBy = new Map(before.map((row) => [row.key, row.usd]));
  const nowBy = new Map(after.map((row) => [row.key, row.usd]));
  return [...new Set([...wasBy.keys(), ...nowBy.keys()])]
    .map((key) => ({
      key,
      was: wasBy.has(key) ? wasBy.get(key)! : null,
      now: nowBy.has(key) ? nowBy.get(key)! : null,
    }))
    .map((driver) => ({ ...driver, delta: (driver.now ?? 0) - (driver.was ?? 0) }))
    .filter((driver) => Math.abs(driver.delta) > DRIVER_NOISE_USD)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}
