import { createRateLimiter, type RateLimiter } from './rate-limit';

/**
 * How many characters of prompt one address may hand the engine in a minute.
 *
 * The routes that run the engine on what a visitor sends (`/api/compare`,
 * `/api/optimize`) were limited in requests alone, 30 a minute. The engine's
 * cost grows with what it is given, and a body may carry up to
 * `MAX_INPUT_CHARS` characters per prompt. One comparison at the cap took
 * 982 ms (median of three runs, 400,000 characters a side, Node 22.23.4 on
 * four cores, 2026-11-21), so thirty of them were about half a minute of one
 * Node process's only thread every minute, from one address and inside the
 * limit. On the standalone build every visitor shares that thread.
 *
 * Counting characters as well bounds the work, not just the arrivals. Two
 * million a minute is two and a half comparisons of two prompts at the cap
 * (800,000 characters each), or a reader comparing a few hundred ordinary
 * prompts: far above anyone using the page,
 * and a fixed ceiling on what one address can make the engine do.
 *
 * Like every limit in `lib/rate-limit.ts` it is counted per instance and keyed
 * on a header a client can sometimes set, so it is a brake, not a wall.
 */
export const MAX_ENGINE_CHARS_PER_MINUTE = 2_000_000;

export function createEngineBudget(): RateLimiter {
  return createRateLimiter({ windowMs: 60_000, max: MAX_ENGINE_CHARS_PER_MINUTE });
}

const ENGINE_BUDGET = Symbol.for('trazum.engineBudget');

/**
 * The one budget every caller of the engine charges: `/api/compare`,
 * `/api/optimize` and the share page when it has to compute. One per process,
 * so an address that spends it on one route has spent it on all of them; a
 * budget per route would let each route add its own two million.
 *
 * Kept on `globalThis` rather than in this module's scope because each route
 * is bundled as its own entry, and the budget must not depend on whether the
 * bundler gave them one copy of this module or several.
 */
export const engineBudget: RateLimiter = ((globalThis as { [ENGINE_BUDGET]?: RateLimiter })[ENGINE_BUDGET] ??=
  createEngineBudget());
