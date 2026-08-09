import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import type { LlmProvider } from '@trazum/core';

/**
 * Not asking the model the same question twice.
 *
 * The roadmap item this answers was "prompt caching for `--suggest`", meaning
 * the API feature: mark a stable prefix with `cache_control` and pay a tenth of
 * the price for it on every later call. **That cannot work here, and the reason
 * is a number rather than an opinion.**
 *
 * Prompt caching has a minimum cacheable prefix — 512 tokens on the newest
 * models, 1,024 on most, 4,096 on some — and a prefix shorter than the minimum
 * is *silently* not cached: no error, no warning, `cache_creation_input_tokens`
 * comes back zero. Trazum's suggest prompt is **291 tokens**. Marking it would
 * have looked like an optimisation, cost a line of code, changed nothing, and
 * been impossible to notice. `suggest-cache.test.js` measures it against the
 * published minima so that stays true, or stops being true loudly.
 *
 * The stable prefix is also the only thing that *could* be cached: the rest of
 * the request is the author's prompt, which is different every time. So there
 * is no arrangement of `cache_control` that helps.
 *
 * What does help is the observation behind the request — running `--suggest`
 * over a directory asks the same questions again on every run, and most of the
 * prompts have not changed since the last one. Answering those from disk is not
 * a 90% saving on the call, it is the whole call. On a re-run after editing two
 * files out of forty, thirty-eight requests do not happen.
 *
 * Three decisions worth arguing with:
 *
 * **The raw response is cached, not the parsed suggestions.** Everything
 * `suggestRewrites` does after the model answers — checking each `before`
 * appears byte for byte, refusing anything that touches protected content,
 * dropping overlaps — is deterministic and lives in the core. Caching the text
 * means a hit is re-validated by *today's* rules rather than replaying a
 * verdict reached by an older version. Same reasoning as recomputing token
 * counts on read instead of storing them.
 *
 * **It is opt-in.** A cache hit returns what the model said last time, and a
 * model is not a pure function — silently answering from a week-old response
 * would be a surprise, in a tool whose other model-touching features
 * (`--suggest`, `--apply-suggestions`, `--reorder`) all require asking twice.
 *
 * **The files are 0600 in a 0700 directory.** The cache holds prompt text, and
 * a prompt is the most sensitive thing this tool ever touches — it is somebody's
 * unreleased product behaviour. A world-readable cache in a shared home
 * directory would publish it to every account on the machine.
 */

/**
 * Bumped when anything that shapes the answer changes and is not already in the
 * key — the suggest system prompt, the response format, the checking rules.
 * A stale entry answers a question that is no longer the one being asked.
 *
 * Exported so the test can derive a key independently rather than comparing
 * `cacheKey` to itself.
 */
export const SCHEMA = 2;

/** Seven days. Long enough for a working week, short enough that an alias that started pointing at a new model does not answer forever. */
export const DEFAULT_TTL_DAYS = 7;

export interface CacheEntry {
  schema: number;
  /** When it was written, so the TTL can be applied by the reader. */
  at: number;
  provider: string;
  model: string;
  /** The model's answer, before any checking. */
  response: string;
}

/**
 * Where the cache lives.
 *
 * `XDG_CACHE_HOME` first, because a user who set it meant it. Not the project
 * directory: two checkouts of the same repository ask the same questions, and a
 * per-checkout cache answers neither of them from the other.
 */
export function cacheDir(env: NodeJS.ProcessEnv = process.env): string {
  const base = env.XDG_CACHE_HOME?.trim() || join(homedir(), '.cache');
  return join(base, 'trazum', 'suggestions');
}

/**
 * The key: everything that changes the answer, and nothing that does not.
 *
 * `provider` and `model` are in here rather than only in the entry because two
 * models answer differently — a hit from the wrong one is not a hit. The system
 * prompt is in here rather than relying on `SCHEMA` alone, so a caller passing
 * their own system prompt gets their own entries without anybody remembering to
 * bump a constant.
 */
export function cacheKey(input: {
  provider: string;
  model: string;
  system: string;
  user: string;
}): string {
  // Length-prefixed rather than delimiter-joined: a delimiter that can occur
  // inside a prompt lets two different inputs produce one key.
  const parts = [String(SCHEMA), input.provider, input.model, input.system, input.user];
  const canonical = parts.map((part) => `${part.length}:${part}`).join('');
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

function entryPath(dir: string, key: string): string {
  return join(dir, `${key}.json`);
}

export function readEntry(
  dir: string,
  key: string,
  now: number,
  ttlDays: number,
): CacheEntry | null {
  let raw: string;
  try {
    raw = readFileSync(entryPath(dir, key), 'utf8');
  } catch {
    return null;
  }

  let entry: CacheEntry;
  try {
    entry = JSON.parse(raw) as CacheEntry;
  } catch {
    // A truncated write from an interrupted run. Treated as a miss rather than
    // an error: the answer is one API call away, and refusing to run because a
    // cache file is corrupt would be worse than the problem.
    return null;
  }

  if (entry.schema !== SCHEMA) return null;
  if (typeof entry.response !== 'string') return null;
  if (typeof entry.at !== 'number') return null;
  if (now - entry.at > ttlDays * 86_400_000) return null;

  return entry;
}

export function writeEntry(dir: string, key: string, entry: CacheEntry): void {
  try {
    // 0700: the cache holds prompt text. A default-permission directory in a
    // shared home publishes it to every other account on the machine.
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    writeFileSync(entryPath(dir, key), `${JSON.stringify(entry, null, 2)}\n`, { mode: 0o600 });
  } catch {
    // A cache that cannot be written is a cache that is not used. Read-only
    // home directory, full disk, hostile umask — none of them are reasons to
    // fail a command that was going to work.
  }
}

/** Delete every entry. Returns how many went. */
export function clearCache(dir: string): number {
  let removed = 0;
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return 0;
  }

  for (const name of names) {
    // Only files this module wrote. A cache directory that deletes whatever it
    // finds is a cache directory somebody eventually points at their home.
    if (!/^[0-9a-f]{64}\.json$/.test(name)) continue;
    try {
      unlinkSync(join(dir, name));
      removed += 1;
    } catch {
      // Already gone, or not ours to delete.
    }
  }
  return removed;
}

/** Entry count and total bytes, so `--clear-suggestion-cache` can say what it emptied. */
export function cacheStats(dir: string): { entries: number; bytes: number } {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return { entries: 0, bytes: 0 };
  }

  let entries = 0;
  let bytes = 0;
  for (const name of names) {
    if (!/^[0-9a-f]{64}\.json$/.test(name)) continue;
    try {
      bytes += statSync(join(dir, name)).size;
      entries += 1;
    } catch {
      // Raced with a clear. Not counted.
    }
  }
  return { entries, bytes };
}

export interface CachedProvider extends LlmProvider {
  /** How many calls this provider answered from disk. */
  readonly hits: number;
  /** How many it had to make. */
  readonly misses: number;
}

/**
 * Wraps a provider so identical questions are asked once.
 *
 * A wrapper rather than a change inside `suggestRewrites`, for two reasons: the
 * core stays free of `node:fs` (it is browser-safe, and a test asserts the
 * import graph), and every command that reaches for an LLM gets the cache by
 * passing through one function rather than by each remembering to.
 */
export function cachingProvider(
  inner: LlmProvider,
  options: {
    dir: string;
    ttlDays?: number;
    now?: () => number;
  },
): CachedProvider {
  const { dir, ttlDays = DEFAULT_TTL_DAYS, now = Date.now } = options;
  let hits = 0;
  let misses = 0;

  return {
    name: inner.name,
    model: inner.model,
    get hits() {
      return hits;
    },
    get misses() {
      return misses;
    },
    async complete({ system, user }) {
      const key = cacheKey({ provider: inner.name, model: inner.model, system, user });

      const cached = readEntry(dir, key, now(), ttlDays);
      if (cached) {
        hits += 1;
        return cached.response;
      }

      const response = await inner.complete({ system, user });
      misses += 1;

      // Written after the call succeeds, so a failed request is not remembered
      // as an answer. A thrown error propagates untouched.
      writeEntry(dir, key, {
        schema: SCHEMA,
        at: now(),
        provider: inner.name,
        model: inner.model,
        response,
      });

      return response;
    },
  };
}
