/**
 * The clock's little formatters, shared by the terminal and the markdown
 * renderings so the two cannot drift — the same reason `formatUsd` lives once.
 */

/** A gap, in the coarsest unit that keeps one significant figure honest. */
export function formatGap(ms: number): string {
  if (ms < 90_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 90 * 60_000) return `${Math.round(ms / 60_000)}m`;
  if (ms < 36 * 3_600_000) return `${(ms / 3_600_000).toFixed(1)}h`;
  return `${(ms / 86_400_000).toFixed(1)}d`;
}

/** `YYYY-MM-DD`, UTC — the same bucketing the core's spendByDay uses. */
export const dayOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** The span's length in days, one decimal. */
export const spanDays = (fromMs: number, toMs: number): string =>
  ((toMs - fromMs) / 86_400_000).toFixed(1);

/**
 * The median of a list, the yardstick a spike cannot inflate.
 *
 * A mean would let the most expensive day raise the bar it is measured
 * against; the median holds still. Returns 0 for an empty list.
 */
export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}
